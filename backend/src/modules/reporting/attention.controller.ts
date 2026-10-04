import { Response } from 'express';
import { AuthRequest } from '../../types';
import { prisma } from '../../core/prisma';
import { sendSms, smsReady, toRecipient } from '../../core/sms';
import { logger } from '../../utils/logger';
import { getPlans, type PlanKey } from '../../core/plans';
import * as R from '../../utils/response';

/**
 * The things waiting for the owner, as decisions rather than figures.
 *
 * The dashboard already reports numbers well. What it never did was say what
 * to do next, so an owner had to notice a low-stock count, work out which
 * products, and go and find them. Each item here is something that can be
 * acted on, carries enough detail to act without opening anything first, and
 * disappears once there is nothing to do.
 */

const shop = (req: AuthRequest) => req.user!.shopId!;

/** Reminders are capped at one per customer per week, however often asked. */
const REMINDER_COOLDOWN_DAYS = 7;

/** Debts are only worth chasing once they have had time to be paid. */
const DEBT_AGE_DAYS = 3;

interface Debtor {
  customerId: string;
  name: string;
  phone: string | null;
  amount: number;
  oldestAt: Date;
  remindedAt: Date | null;
}

/**
 * Everyone who owes this shop money.
 *
 * Outstanding is the total minus every non-DEBIT payment against it, which is
 * how the debts page computes it. Doing it the same way here matters more
 * than doing it elegantly: two different answers to "who owes me" would be
 * worse than none.
 */
async function debtors(shopId: string): Promise<Debtor[]> {
  const cutoff = new Date(Date.now() - DEBT_AGE_DAYS * 86_400_000);
  const rows = await prisma.transaction.findMany({
    where: {
      shopId, status: 'COMPLETED',
      payments: { some: { method: 'DEBIT' } },
      customerId: { not: null },
      createdAt: { lte: cutoff },
    },
    select: {
      total: true, createdAt: true,
      payments: { select: { method: true, amount: true } },
      customer: { select: { id: true, fullName: true, phone: true } },
    },
  });

  const by = new Map<string, Debtor>();
  for (const tx of rows) {
    if (!tx.customer) continue;
    const paid = tx.payments.filter(p => p.method !== 'DEBIT').reduce((s, p) => s + p.amount, 0);
    const outstanding = tx.total - paid;
    if (outstanding <= 0) continue;

    const seen = by.get(tx.customer.id);
    if (seen) {
      seen.amount += outstanding;
      if (tx.createdAt < seen.oldestAt) seen.oldestAt = tx.createdAt;
    } else {
      by.set(tx.customer.id, {
        customerId: tx.customer.id, name: tx.customer.fullName, phone: tx.customer.phone,
        amount: outstanding, oldestAt: tx.createdAt, remindedAt: null,
      });
    }
  }
  if (!by.size) return [];

  // When each of them was last chased, so the screen can say how many the
  // button would actually message rather than promising all of them.
  const since = new Date(Date.now() - REMINDER_COOLDOWN_DAYS * 86_400_000);
  const recent = await prisma.debtReminder.findMany({
    where: { shopId, customerId: { in: [...by.keys()] }, sentAt: { gte: since } },
    select: { customerId: true, sentAt: true },
    orderBy: { sentAt: 'desc' },
  });
  for (const r of recent) {
    const d = by.get(r.customerId);
    if (d && !d.remindedAt) d.remindedAt = r.sentAt;
  }

  return [...by.values()].sort((a, b) => b.amount - a.amount);
}

/** Products at or below the point where they should have been reordered. */
async function runningOut(shopId: string) {
  const products = await prisma.product.findMany({
    where: { shopId, isActive: true, trackStock: true, reorderPoint: { gt: 0 } },
    select: {
      id: true, name: true, reorderPoint: true,
      inventory: { select: { quantity: true } },
    },
  });
  return products
    .map(p => ({
      id: p.id, name: p.name,
      quantity: p.inventory.reduce((s, i) => s + i.quantity, 0),
      reorderPoint: p.reorderPoint,
    }))
    .filter(p => p.quantity <= p.reorderPoint)
    .sort((a, b) => a.quantity - b.quantity);
}

export async function needsAttention(req: AuthRequest, res: Response) {
  const shopId = shop(req);

  const [shopRow, orders, low, owed, account] = await Promise.all([
    prisma.shop.findUnique({
      where: { id: shopId },
      select: { storefrontEnabled: true, currency: true },
    }),
    prisma.order.findMany({
      where: { shopId, status: 'PENDING' },
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),
    runningOut(shopId),
    debtors(shopId),
    prisma.ownerAccount.findUnique({
      where: { id: req.user!.accountId },
      select: { subscriptionPlan: true, subscriptionExpiresAt: true, subscriptionActive: true },
    }),
  ]);

  // Only within the window where paying is the next thing to do. Earlier than
  // that it is not a task, it is a fact, and it belongs on the account page.
  const expiresAt = account?.subscriptionExpiresAt ?? null;
  const daysLeft = expiresAt
    ? Math.ceil((expiresAt.getTime() - Date.now()) / 86_400_000)
    : null;

  const remindable = owed.filter(d => d.phone && !d.remindedAt).length;

  // The plan is shown to a person, so it carries its name and its price
  // rather than the enum the column stores.
  let plan: { label: string; monthlyPrice: number | null } | null = null;
  if (daysLeft !== null && daysLeft <= 7 && account?.subscriptionPlan) {
    const view = (await getPlans())[account.subscriptionPlan as PlanKey];
    if (view) plan = { label: view.label, monthlyPrice: view.monthlyPrice };
  }

  return R.ok(res, {
    currency: shopRow?.currency ?? 'TZS',
    orders: orders.length && shopRow?.storefrontEnabled
      ? { count: orders.length, oldestAt: orders[0].createdAt }
      : null,
    lowStock: low.length
      ? { count: low.length, items: low.slice(0, 3).map(p => ({ name: p.name, quantity: p.quantity })) }
      : null,
    debts: owed.length
      ? {
          count: owed.length,
          total: owed.reduce((s, d) => s + d.amount, 0),
          remindable,
          smsReady,
          top: owed.slice(0, 2).map(d => ({ name: d.name, amount: d.amount })),
        }
      : null,
    subscription: daysLeft !== null && daysLeft <= 7
      ? { daysLeft, plan, active: account?.subscriptionActive ?? false }
      : null,
  });
}

/**
 * Chase everyone who owes, once.
 *
 * Every message is a real cost, so the rules are strict and visible: only
 * customers with a phone number, only those not already chased this week, and
 * the reply says exactly how many were sent. Each send is recorded before the
 * next is attempted, so a failure half way through cannot double-send the
 * ones already done on a retry.
 */
export async function remindDebtors(req: AuthRequest, res: Response) {
  const shopId = shop(req);
  if (!smsReady) return R.badRequest(res, 'SMS is not configured');

  const [shopRow, owed] = await Promise.all([
    prisma.shop.findUnique({ where: { id: shopId }, select: { tradingName: true } }),
    debtors(shopId),
  ]);

  const targets = owed.filter(d => d.phone && !d.remindedAt);
  if (!targets.length) return R.ok(res, { sent: 0, skipped: owed.length, message: 'Nobody to remind' });

  const name = (shopRow?.tradingName ?? 'MauzoHalisi').slice(0, 20);
  let sent = 0, failed = 0;

  for (const d of targets) {
    const to = toRecipient(d.phone);
    if (!to) { failed++; continue; }

    // Kept inside one SMS part, and in Swahili, because the recipient is the
    // shop's customer rather than its owner.
    const amount = Math.round(d.amount).toLocaleString('en-US');
    const body = `Habari ${d.name.split(' ')[0]}. Una deni la TZS ${amount} katika ${name}. `
               + 'Tafadhali lipa unapoweza. Asante.';

    try {
      const ok = await sendSms(to, body);
      if (!ok) { failed++; continue; }
      await prisma.debtReminder.create({
        data: { shopId, customerId: d.customerId, amount: d.amount, phone: to },
      });
      sent++;
    } catch (err) {
      failed++;
      logger.error(`Debt reminder failed for ${d.customerId}: ${(err as Error).message}`);
    }
  }

  return R.ok(res, { sent, failed, skipped: owed.length - targets.length });
}
