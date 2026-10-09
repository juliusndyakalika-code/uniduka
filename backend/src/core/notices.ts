import { prisma } from './prisma';
import { sendSms, smsReady } from './sms';
import { logger } from '../utils/logger';
import { compose } from './templates';

/**
 * The SMS notices MauzoHalisi sends an account owner about their subscription.
 *
 * Copy lives here rather than at the call sites so the wording, the length and
 * the money formatting stay consistent. Length matters directly: Textify bills
 * per 160 characters, so every message below is written to fit one part.
 *
 * Nothing in this file throws. A notice is an aside to whatever triggered it,
 * and a gateway outage must not roll back a payment or break a cron tick.
 */

/** 20000 → "TSh 20,000". Whole shillings; the gateway deals in no smaller unit. */
function money(amount: number): string {
  return `TSh ${Math.round(amount).toLocaleString('en-US')}`;
}

/** 2026-11-29T… → "29 Nov 2026", which reads the same in English and Swahili. */
function day(date: Date): string {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Where an account's notices go.
 *
 * The owner account's own phone comes first, falling back to the owning user's,
 * because the two are set at different times and either may be the one that was
 * kept current. A number nobody has confirmed is still used: an unverified
 * number is more likely to reach them than no message at all, and none of these
 * notices carry anything secret.
 */
async function ownerPhone(accountId: string): Promise<string | null> {
  const account = await prisma.ownerAccount.findUnique({
    where:  { id: accountId },
    select: {
      phone: true,
      users: {
        where:   { role: 'ACCOUNT_OWNER', isActive: true },
        select:  { phone: true, phoneVerified: true },
        orderBy: { createdAt: 'asc' },
        take:    1,
      },
    },
  });
  return account?.phone ?? account?.users[0]?.phone ?? null;
}

/** Payment cleared and the subscription was extended. */
export async function smsPaymentReceived(
  accountId: string,
  args: { plan: string; months: number; amount: number; until: Date },
): Promise<void> {
  if (!smsReady) return;
  try {
    const phone = await ownerPhone(accountId);
    if (!phone) return;
    const period = args.months === 1 ? '1 month' : `${args.months} months`;
    const msg = await compose('payment_received', 'SMS', {
      amount: money(args.amount), plan: args.plan, period, until: day(args.until),
    });
    if (msg) await sendSms(phone, msg.body);
  } catch (err) {
    logger.error(`Payment received SMS failed for ${accountId}: ${(err as Error).message}`);
  }
}

/** Payment did not go through. */
export async function smsPaymentFailed(
  accountId: string,
  args: { amount: number; reason?: string | null },
): Promise<void> {
  if (!smsReady) return;
  try {
    const phone = await ownerPhone(accountId);
    if (!phone) return;
    // The gateway's own reason codes are not repeated to the customer. They are
    // written for us (AMOUNT_MISMATCH, INSUFFICIENT_BALANCE) and read as noise
    // or as alarm on a phone; the actionable part is the same either way.
    const msg = await compose('payment_failed', 'SMS', { amount: money(args.amount) });
    if (msg) await sendSms(phone, msg.body);
  } catch (err) {
    logger.error(`Payment failed SMS failed for ${accountId}: ${(err as Error).message}`);
  }
}

/** Days before expiry that a reminder goes out. 0 is the day it lapses. */
const STAGES = [7, 3, 1, 0] as const;

/** The reminder copy for one stage, from the editable templates. */
async function expiryCopy(stage: number, plan: string, until: Date): Promise<string | null> {
  const msg = await compose(`expiry_${stage}`, 'SMS', {
    plan, date: day(until), days: stage,
  });
  return msg?.body ?? null;
}

/**
 * Send whichever expiry reminders are due, once each.
 *
 * Run on a timer, so it must be safe to call at any moment and from more than
 * one instance at a time. Both properties come from the unique index on
 * (accountId, stage, periodEnd): the insert is what claims the right to send,
 * and the loser of a race takes the duplicate-key path and sends nothing.
 *
 * Keying on the expiry rather than on today's date is what makes a renewal
 * behave correctly. Paying moves the expiry, which is a different periodEnd, so
 * the new cycle's reminders are free to send while the old cycle's stay spent.
 */
export async function runExpiryReminders(): Promise<void> {
  if (!smsReady) return;

  const now = new Date();
  // Widest stage plus a day, so an account is picked up for its 7-day reminder
  // even if the tick that should have caught it was missed.
  const horizon = new Date(now.getTime() + 8 * 86_400_000);

  const accounts = await prisma.ownerAccount.findMany({
    where: {
      isActive: true,
      subscriptionExpiresAt: {
        not: null,
        lte: horizon,
        // Nothing older than a month. An account that lapsed long ago has had
        // its notice; it should not be texted every time the process restarts.
        gte: new Date(now.getTime() - 31 * 86_400_000),
      },
    },
    select: { id: true, subscriptionPlan: true, subscriptionExpiresAt: true },
  });

  for (const account of accounts) {
    const until = account.subscriptionExpiresAt;
    if (!until) continue;

    const daysLeft = Math.ceil((until.getTime() - now.getTime()) / 86_400_000);

    // The *tightest* stage this account has reached, not the first one that
    // matches. Every stage from 7 down is technically true at 1 day left, so
    // taking the first would announce "ends in 7 days" on the final day, and
    // would never reach stage 0 at all because 7 matches a negative daysLeft
    // just as happily.
    //
    // Falling straight to the tightest stage is also the right behaviour when
    // a tick is missed: an account found at 3 days left gets the 3-day wording
    // rather than a stale 7-day one that is now wrong.
    const reached = STAGES.filter((s) => daysLeft <= s);
    if (reached.length === 0) continue;
    const stage = Math.min(...reached);

    try {
      // The insert is the lock. If this row already exists the notice was sent,
      // by an earlier tick or by another instance a millisecond ago.
      await prisma.subscriptionNotice.create({
        data: { accountId: account.id, stage, periodEnd: until },
      });
    } catch {
      continue;
    }

    const phone = await ownerPhone(account.id);
    if (!phone) continue;
    const body = await expiryCopy(stage, account.subscriptionPlan, until);
    if (body) await sendSms(phone, body);
  }
}

/** How often the reminder sweep runs. */
const TICK_MS = 6 * 60 * 60_000;

/**
 * Start the reminder timer.
 *
 * Unref'd so it never holds the process open on its own, which matters for
 * anything that boots the app to run a one-off task.
 */
export function startNoticeScheduler(): void {
  if (!smsReady) {
    logger.warn('SMS not configured — subscription reminders are disabled');
    return;
  }

  const tick = () => {
    runExpiryReminders().catch((err) => logger.error(`Expiry reminder sweep failed: ${err.message}`));
  };

  // A short delay rather than an immediate run, so a restart loop cannot turn
  // into a burst of sweeps and the app finishes coming up first.
  setTimeout(tick, 60_000).unref();
  setInterval(tick, TICK_MS).unref();
  logger.info('Subscription reminder scheduler started');
}
