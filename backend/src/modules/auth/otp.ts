import { prisma } from '../../core/prisma';
import { toRecipient } from '../../core/sms';
import { logger } from '../../utils/logger';

/**
 * Throttling for the one-time code flows.
 *
 * This exists because Textify's verify endpoint is public: it takes no API key,
 * so anyone who knows a phone number can submit codes against it as fast as
 * they can open sockets, and a six digit code valid for thirty minutes falls to
 * that in minutes. We cannot put a limit on their endpoint, so the limit goes
 * in front of ours, and our endpoints are the only ones that can actually
 * change a password or mark a number verified.
 *
 * Two separate counters, because the two abuses are different. Sends are capped
 * so nobody can point the endpoint at a stranger's phone and bill us for the
 * flood. Failures are capped so the code itself cannot be guessed.
 */

/** Codes we will send to one number, for one purpose, per window. */
const MAX_SENDS = 3;
/**
 * Quiet time between two codes for the same target.
 *
 * This is the setting that actually saves messages. Almost all wasted sends
 * come from one impatient person tapping resend while the first code is still
 * in flight, not from an attack, and a cap alone does nothing about that: it
 * lets all three go out inside ten seconds and then leaves the person with
 * nothing when the code genuinely does not arrive. A cooldown spends the same
 * allowance over the interval where a late SMS still has time to land.
 */
const SEND_COOLDOWN_MS = 90_000;
/**
 * Codes per target per day, behind the window cap.
 *
 * Without this the window cap is only a speed limit: wait half an hour and the
 * counter resets, which over a day is plenty of messages.
 */
const MAX_DAY_SENDS = 8;
/** Wrong codes we will check before refusing to check any more. */
const MAX_FAILURES = 5;
/** Counters older than this are a new episode, not a continuing attack. */
const WINDOW_MS = 30 * 60_000;
/** How long a number is frozen once either cap is hit. */
const LOCK_MS = 30 * 60_000;
/** The daily counter's own window. */
const DAY_MS = 24 * 60 * 60_000;

export type OtpPurpose = 'verify' | 'email' | 'reset';

export interface Gate {
  allowed: boolean;
  /** Seconds until the caller may try again. Only set when blocked. */
  retryAfter?: number;
  /**
   * Why it was refused, so the client can say something true. A cooldown means
   * "your code is on its way, wait a moment"; a cap means "too many attempts".
   * Showing the second when the first is the case reads as a failure and makes
   * people try harder, which is the opposite of what is wanted.
   */
  reason?: 'cooldown' | 'capped';
}

function blocked(until: Date, reason: Gate['reason'] = 'capped'): Gate {
  return {
    allowed: false,
    retryAfter: Math.max(1, Math.ceil((until.getTime() - Date.now()) / 1000)),
    reason,
  };
}

/**
 * Reduce a target to the single form its counter is stored under, so 0712…,
 * +255712… and 255712… cannot each carry their own allowance. Email is only
 * case-folded; the local part is case-sensitive per the RFC, but no provider
 * anyone here uses treats it that way, and folding is what stops A@x.com and
 * a@x.com counting separately.
 */
function keyFor(target: string, purpose: OtpPurpose): string | null {
  if (purpose === 'email') {
    const email = target.trim().toLowerCase();
    return email.includes('@') ? email : null;
  }
  return toRecipient(target);
}

/**
 * Load the counter for this target, resetting it first if the window has run
 * out. Returns null when the target is not a usable one at all.
 */
async function current(target: string, purpose: OtpPurpose) {
  const key = keyFor(target, purpose);
  if (!key) return null;

  const row = await prisma.otpAttempt.upsert({
    where:  { identifier_purpose: { identifier: key, purpose } },
    update: {},
    create: { identifier: key, purpose },
  });

  // A stale window is cleared here rather than by a sweep, so the counters are
  // correct at the moment they are read even if nothing has swept in weeks.
  if (Date.now() - row.windowStart.getTime() > WINDOW_MS && (!row.lockedUntil || row.lockedUntil <= new Date())) {
    return prisma.otpAttempt.update({
      where: { id: row.id },
      data:  { sends: 0, failures: 0, windowStart: new Date(), lockedUntil: null },
    });
  }
  return row;
}

/**
 * Ask whether another code may be sent, and count it if so.
 *
 * Counting on the way out rather than on success is deliberate: a send that
 * errors at the gateway still cost an attempt from the caller's point of view,
 * and not counting it would make the cap trivial to sidestep by forcing errors.
 */
export async function gateSend(target: string, purpose: OtpPurpose): Promise<Gate> {
  const row = await current(target, purpose);
  if (!row) return { allowed: false };

  const now = new Date();
  if (row.lockedUntil && row.lockedUntil > now) return blocked(row.lockedUntil);

  // Cheapest check first, and the one that stops the most waste. Refusing here
  // costs nothing and changes no counter, so an impatient resend does not also
  // spend part of the allowance it is waiting on.
  if (row.lastSentAt && now.getTime() - row.lastSentAt.getTime() < SEND_COOLDOWN_MS) {
    return blocked(new Date(row.lastSentAt.getTime() + SEND_COOLDOWN_MS), 'cooldown');
  }

  // The daily counter rolls on its own clock, independent of the short window.
  const dayRolled = now.getTime() - row.dayStart.getTime() > DAY_MS;
  const daySends  = dayRolled ? 0 : row.daySends;
  if (daySends >= MAX_DAY_SENDS) {
    const until = dayRolled ? now : new Date(row.dayStart.getTime() + DAY_MS);
    return blocked(until);
  }

  const sends = row.sends + 1;
  const hitWindowCap = sends >= MAX_SENDS;

  await prisma.otpAttempt.update({
    where: { id: row.id },
    data: {
      sends,
      lastSentAt: now,
      daySends: daySends + 1,
      ...(dayRolled ? { dayStart: now } : {}),
      // Reaching the cap locks the target, but this send is still allowed: the
      // cap is the number of codes permitted, not the number before the last
      // one is refused.
      ...(hitWindowCap ? { lockedUntil: new Date(now.getTime() + LOCK_MS) } : {}),
    },
  });
  return { allowed: true };
}

/** Whether another code may be checked. Does not count anything by itself. */
export async function gateCheck(target: string, purpose: OtpPurpose): Promise<Gate> {
  const row = await current(target, purpose);
  if (!row) return { allowed: false };
  if (row.lockedUntil && row.lockedUntil > new Date()) return blocked(row.lockedUntil);
  return { allowed: true };
}

/** Record a wrong code, locking the number once the cap is reached. */
export async function recordFailure(target: string, purpose: OtpPurpose): Promise<void> {
  const key = keyFor(target, purpose);
  if (!key) return;
  const row = await prisma.otpAttempt.findUnique({ where: { identifier_purpose: { identifier: key, purpose } } });
  if (!row) return;

  const failures = row.failures + 1;
  await prisma.otpAttempt.update({
    where: { id: row.id },
    data: {
      failures,
      lockedUntil: failures >= MAX_FAILURES ? new Date(Date.now() + LOCK_MS) : row.lockedUntil,
    },
  });
  if (failures >= MAX_FAILURES) {
    logger.warn(`OTP ${purpose} locked after ${failures} wrong codes for ${key.slice(0, 6)}…`);
  }
}

/**
 * Clear the counters after a code is accepted, so a legitimate person who
 * fumbled a few digits is not left throttled on their next real attempt.
 */
export async function clearAttempts(target: string, purpose: OtpPurpose): Promise<void> {
  const key = keyFor(target, purpose);
  if (!key) return;
  // The daily counter is deliberately left alone. Clearing it here would mean
  // anyone who can complete one code gets a fresh day's allowance, which is the
  // cap undone rather than enforced.
  await prisma.otpAttempt.updateMany({
    where: { identifier: key, purpose },
    data:  { sends: 0, failures: 0, windowStart: new Date(), lockedUntil: null },
  });
}
