import { Request, Response } from 'express';
import crypto from 'crypto';
import { AuthRequest } from '../../types';
import { prisma } from '../../core/prisma';
import * as R from '../../utils/response';
import { logger } from '../../utils/logger';
import { smsPaymentReceived, smsPaymentFailed } from '../../core/notices';
import { PLAN_PRICES, PlanKey } from '../../core/plans';
import {
  initiateMobileMoney, checkStatus, verifyWebhook, mapStatus, toMsisdn, splashpayReady,
} from '../../core/splashpay';

/** Plans a shop can buy themselves. Enterprise is priced by conversation. */
const BUYABLE: PlanKey[] = ['GROWTH', 'BUSINESS'];

export async function getPlans(req: AuthRequest, res: Response) {
  const account = await prisma.ownerAccount.findUnique({
    where: { id: req.user!.accountId },
    select: { subscriptionPlan: true, subscriptionActive: true, subscriptionExpiresAt: true },
  });
  return R.ok(res, {
    current: account?.subscriptionPlan ?? 'STARTER',
    active: account?.subscriptionActive ?? false,
    expiresAt: account?.subscriptionExpiresAt ?? null,
    paymentsEnabled: splashpayReady,
    plans: BUYABLE.map(p => ({ plan: p, monthlyPrice: PLAN_PRICES[p] })),
  });
}

/**
 * Start a subscription payment.
 *
 * The row is written before the gateway is called, so a payment that succeeds
 * at SplashPay but whose response never reaches us still has something here to
 * reconcile against. A webhook for a reference we have never seen is the one
 * case that cannot be resolved.
 */
export async function startPayment(req: AuthRequest, res: Response) {
  const { plan, months = 1, phone } = req.body ?? {};

  if (!BUYABLE.includes(plan)) {
    return R.badRequest(res, 'Choose the Growth or Business plan. For Enterprise, talk to us.');
  }
  const monthCount = Number(months);
  if (!Number.isInteger(monthCount) || monthCount < 1 || monthCount > 12) {
    return R.badRequest(res, 'Pay for between 1 and 12 months at a time.');
  }
  const msisdn = toMsisdn(phone);
  if (!msisdn) return R.badRequest(res, 'Enter a valid Tanzanian mobile money number.');

  const price = PLAN_PRICES[plan as PlanKey];
  if (!price) return R.badRequest(res, 'That plan cannot be paid for online.');
  const amount = price * monthCount;

  const account = await prisma.ownerAccount.findUnique({
    where: { id: req.user!.accountId },
    select: { id: true, legalName: true, email: true, billingEmail: true, suspendedAt: true },
  });
  if (!account) return R.notFound(res, 'Account not found');

  // Refused before the prompt reaches their phone. Paying would not get a
  // suspended owner back in, since only an admin can lift that, so taking the
  // money first and explaining afterwards is the one outcome to avoid.
  if (account.suspendedAt) {
    return res.status(402).json({
      success: false,
      code:    'ACCOUNT_SUSPENDED',
      message: 'This account is suspended, so it cannot be renewed online. Please contact support.',
    });
  }

  // Leaving a prompt sitting on someone's phone while they start another is how
  // a shop ends up paying twice for one month.
  const pending = await prisma.subscriptionPayment.findFirst({
    where: { accountId: account.id, status: { in: ['PENDING', 'PROCESSING'] },
             createdAt: { gte: new Date(Date.now() - 10 * 60_000) } },
    select: { reference: true },
  });
  if (pending) {
    return R.badRequest(res, 'A payment is already waiting on your phone. Finish or cancel it first.');
  }

  const reference = `MH-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;

  const payment = await prisma.subscriptionPayment.create({
    data: {
      accountId: account.id, plan, months: monthCount, amount,
      reference, phone: msisdn, initiatedById: req.user!.sub,
    },
  });

  const result = await initiateMobileMoney({
    amount, reference, phone: msisdn,
    customerName: account.legalName,
    customerEmail: account.billingEmail || account.email,
    metadata: { accountId: account.id, plan, months: monthCount },
  });

  if (!result.ok) {
    await prisma.subscriptionPayment.update({
      where: { id: payment.id },
      data: { status: 'FAILED', failureReason: result.code ?? 'INITIATE_FAILED' },
    });
    return R.badRequest(res, result.message ?? 'The payment could not be started.');
  }

  await prisma.subscriptionPayment.update({
    where: { id: payment.id },
    data: {
      providerReference: result.providerReference,
      provider: result.provider,
      status: mapStatus(result.status),
    },
  });

  return R.created(res, {
    reference, amount, plan, months: monthCount,
    message: 'Check your phone and enter your PIN to approve the payment.',
  });
}

/**
 * Where a payment got to.
 *
 * Falls back to asking the gateway when our own row is still pending, because
 * a lost webhook should not leave a shop watching a spinner until the retry an
 * hour later.
 */
export async function paymentStatus(req: AuthRequest, res: Response) {
  const payment = await prisma.subscriptionPayment.findFirst({
    where: { reference: req.params.reference, accountId: req.user!.accountId },
  });
  if (!payment) return R.notFound(res, 'Payment not found');

  if (payment.status === 'PENDING' || payment.status === 'PROCESSING') {
    const live = await checkStatus(payment.reference);
    const mapped = mapStatus(live.status);
    if (live.status && mapped !== payment.status) {
      await applyResult(payment.reference, mapped, {
        providerReference: live.providerReference,
      });
      const fresh = await prisma.subscriptionPayment.findUnique({ where: { id: payment.id } });
      return R.ok(res, slim(fresh!));
    }
  }
  return R.ok(res, slim(payment));
}

export async function listPayments(req: AuthRequest, res: Response) {
  const rows = await prisma.subscriptionPayment.findMany({
    where: { accountId: req.user!.accountId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return R.ok(res, rows.map(slim));
}

/**
 * SplashPay calling to say what happened.
 *
 * Unauthenticated by necessity, so the HMAC is the only thing standing between
 * this and anyone who can guess the URL granting themselves a subscription.
 * Nothing in the body is trusted until the signature checks out, and the amount
 * is compared against what we asked for rather than taken from the payload.
 */
export async function webhook(req: Request, res: Response) {
  const raw = (req as Request & { rawBody?: Buffer }).rawBody;
  const ok = verifyWebhook(
    raw ?? JSON.stringify(req.body ?? {}),
    req.get('x-splashpay-signature') ?? undefined,
    req.get('x-splashpay-timestamp') ?? undefined,
  );
  if (!ok) {
    logger.warn('SplashPay webhook rejected: bad signature');
    return res.status(401).json({ received: false });
  }

  const event = String(req.body?.event ?? '');
  const data  = (req.body?.data ?? {}) as Record<string, string>;
  const reference = data.reference;

  if (!reference) return res.status(200).json({ received: true });

  await applyResult(reference, mapStatus(data.status ?? event.split('.')[1]), {
    providerReference: data.provider_reference,
    provider: data.provider,
    channel: data.channel,
    amount: data.amount != null ? Number(data.amount) : undefined,
  });

  // Always 200 once the signature is good. Anything else and SplashPay retries
  // for 24 hours over a problem retrying will not fix.
  return res.status(200).json({ received: true });
}

/**
 * Record the outcome and, on success, extend the subscription exactly once.
 *
 * Shared by the webhook and the status poll, which can both land at the same
 * time on the same payment.
 */
async function applyResult(
  reference: string,
  status: ReturnType<typeof mapStatus>,
  extra: { providerReference?: string; provider?: string; channel?: string; amount?: number },
) {
  const payment = await prisma.subscriptionPayment.findUnique({ where: { reference } });
  if (!payment) {
    logger.warn(`SplashPay result for an unknown reference: ${reference}`);
    return;
  }

  // Already granted. SplashPay retries up to eight times over 24 hours, and the
  // status poll can arrive alongside any of them; without this a shop that paid
  // for one month would be granted eight.
  if (payment.appliedAt) return;

  if (status !== 'SUCCESS') {
    await prisma.subscriptionPayment.update({
      where: { id: payment.id },
      data: {
        status,
        failureReason: status === 'PENDING' ? null : status,
        providerReference: extra.providerReference ?? payment.providerReference,
        completedAt: status === 'PENDING' || status === 'PROCESSING' ? null : new Date(),
      },
    });
    // Only for an outcome that is actually final. A PENDING or PROCESSING
    // update is the gateway narrating progress, and texting on each one would
    // mean several messages for a single payment.
    if (status === 'FAILED' || status === 'CANCELLED' || status === 'EXPIRED') {
      void smsPaymentFailed(payment.accountId, { amount: payment.amount, reason: status });
    }
    return;
  }

  // The amount is checked rather than trusted. A payload claiming success for
  // less than the plan costs must not buy a month.
  if (extra.amount != null && Math.abs(extra.amount - payment.amount) > 0.5) {
    logger.warn(`SplashPay amount mismatch on ${reference}: paid ${extra.amount}, expected ${payment.amount}`);
    await prisma.subscriptionPayment.update({
      where: { id: payment.id },
      data: { status: 'FAILED', failureReason: 'AMOUNT_MISMATCH', completedAt: new Date() },
    });
    return;
  }

  const account = await prisma.ownerAccount.findUnique({
    where: { id: payment.accountId },
    select: { subscriptionExpiresAt: true, suspendedAt: true },
  });
  const banned = Boolean(account?.suspendedAt);

  // Extend from whichever is later. Paying early should add to the time already
  // bought, not throw it away; paying after lapsing starts from today.
  const now = new Date();
  const from = account?.subscriptionExpiresAt && account.subscriptionExpiresAt > now
    ? account.subscriptionExpiresAt
    : now;
  const until = new Date(from);
  until.setMonth(until.getMonth() + payment.months);

  // Restoring access mirrors what a platform admin's activation does, rather
  // than setting the three subscription fields and leaving the owner locked
  // out of shops that were still switched off. That is what repairs accounts
  // broken by the old expiry behaviour, which deactivated the account and its
  // shops and gave paying no way to undo it.
  //
  // A suspended account is the one case where none of that happens. The money
  // is still recorded and the subscription still extends, so nothing is taken
  // without being credited, but isActive and the shops stay where the admin
  // left them. Only an admin reinstating the account clears suspendedAt, so a
  // ban cannot be bought off.
  await prisma.$transaction([
    prisma.ownerAccount.update({
      where: { id: payment.accountId },
      data: {
        subscriptionPlan: payment.plan,
        subscriptionActive: true,
        subscriptionExpiresAt: until,
        ...(banned ? {} : { isActive: true }),
      },
    }),
    ...(banned ? [] : [
      prisma.shop.updateMany({
        where: { ownerAccountId: payment.accountId, isActive: false },
        data:  { isActive: true },
      }),
    ]),
    prisma.subscriptionPayment.update({
      where: { id: payment.id },
      data: {
        status: 'SUCCESS',
        providerReference: extra.providerReference ?? payment.providerReference,
        provider: extra.provider ?? payment.provider,
        channel: extra.channel ?? payment.channel,
        appliedAt: now,
        completedAt: now,
        expiresBefore: account?.subscriptionExpiresAt ?? null,
        expiresAfter: until,
      },
    }),
  ]);

  logger.info(`Subscription extended for ${payment.accountId}: ${payment.plan} to ${until.toISOString()}`);

  // After the transaction, never inside it. A slow gateway would otherwise hold
  // a write transaction open, and a failed text must not undo a paid month.
  void smsPaymentReceived(payment.accountId, {
    plan: payment.plan, months: payment.months, amount: payment.amount, until,
  });
}

function slim(p: {
  reference: string; plan: string; months: number; amount: number; status: string;
  failureReason: string | null; expiresAfter: Date | null; createdAt: Date; completedAt: Date | null;
}) {
  return {
    reference: p.reference, plan: p.plan, months: p.months, amount: p.amount,
    status: p.status, failureReason: p.failureReason,
    expiresAfter: p.expiresAfter, createdAt: p.createdAt, completedAt: p.completedAt,
  };
}
