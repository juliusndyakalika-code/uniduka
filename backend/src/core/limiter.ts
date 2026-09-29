import rateLimit, { type Options } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import type { Request, Response } from 'express';
import { redis } from './redis';
import { prisma } from './prisma';
import { logger } from '../utils/logger';
import { normalizePhone } from '../utils/phone';

/**
 * Rate limiting that actually holds.
 *
 * The limiter was in-process, so each replica kept its own counter and the
 * real ceiling was the configured limit multiplied by however many instances
 * happened to be running. Identical requests came back as a mix of 200 and
 * 429 depending on which one answered, which is what the assessment saw. A
 * shared store makes the number mean what it says.
 *
 * Falls back to the in-memory store when Redis is unreachable. A degraded
 * limiter is worth having; refusing to start the API because a cache is down
 * is not.
 */

function store(prefix: string) {
  try {
    return new RedisStore({
      prefix,
      sendCommand: (...args: string[]) => redis.call(...(args as [string, ...string[]])) as Promise<never>,
    });
  } catch (err) {
    logger.warn(`Rate limiter falling back to memory: ${(err as Error).message}`);
    return undefined;
  }
}

/**
 * Answer a refusal with how long to wait.
 *
 * express-rate-limit sets RateLimit-* headers but not Retry-After, so a client
 * was told it had been refused and nothing about when to come back. That also
 * makes a refusal indistinguishable from a failure to anything automated.
 */
function refuse(message: string) {
  return (req: Request, res: Response) => {
    const reset = (req as Request & { rateLimit?: { resetTime?: Date } }).rateLimit?.resetTime;
    const seconds = reset ? Math.max(1, Math.ceil((reset.getTime() - Date.now()) / 1000)) : 60;
    res.set('Retry-After', String(seconds));
    res.status(429).json({ success: false, message, retryAfter: seconds });
  };
}

function make(opts: Partial<Options> & { prefix: string; max: number; windowMs: number; message: string }) {
  return rateLimit({
    windowMs: opts.windowMs,
    max: opts.max,
    standardHeaders: true,
    legacyHeaders: false,
    store: store(opts.prefix),
    handler: refuse(opts.message),
    keyGenerator: opts.keyGenerator,
    skipSuccessfulRequests: opts.skipSuccessfulRequests,
  });
}

/** The broad ceiling on everything, kept generous. */
export const globalLimiter = make({
  prefix: 'rl:all:', windowMs: 15 * 60_000, max: 500,
  message: 'Too many requests. Please slow down.',
});

/**
 * Failed sign-in attempts from one address.
 *
 * Counts only failures, so somebody working normally is never affected while
 * somebody guessing is stopped after twenty tries in a quarter of an hour.
 * Deliberately looser than the per-account lock below, because this key is an
 * IP and Tanzanian mobile traffic shares carrier-grade NAT: a tight limit here
 * punishes a neighbourhood for one attacker, who can rotate addresses anyway.
 */
export const loginIpLimiter = make({
  prefix: 'rl:login:ip:', windowMs: 15 * 60_000, max: 20,
  skipSuccessfulRequests: true,
  message: 'Too many sign-in attempts. Please try again later.',
});

// ─── PER-ACCOUNT LOCKOUT ─────────────────────────────────────────────────────

/**
 * Failures tolerated for one identity before it is locked.
 *
 * Keyed on the username rather than the address, which is the half the
 * attacker cannot rotate. Password spraying works precisely by staying under
 * a per-IP limit while walking many accounts; only a per-account counter sees
 * that pattern.
 */
const MAX_FAILURES = 8;
const LOCK_SECONDS = 15 * 60;
const WINDOW_SECONDS = 15 * 60;

/** One identity, however it was typed, is one counter. */
function identityKey(username: string): string {
  const raw = String(username ?? '').trim().toLowerCase();
  if (!raw) return '';
  // A phone may arrive as 0712…, +255712… or 255712…; without normalising,
  // each spelling would get its own allowance.
  const asPhone = normalizePhone(raw);
  return `rl:acct:${/^\+?\d[\d\s-]{6,}$/.test(raw) ? asPhone : raw}`;
}

export interface LockState { locked: boolean; retryAfter: number }

export async function checkAccountLock(username: string): Promise<LockState> {
  const key = identityKey(username);
  if (!key) return { locked: false, retryAfter: 0 };
  try {
    const ttl = await redis.ttl(`${key}:lock`);
    if (ttl > 0) return { locked: true, retryAfter: ttl };
  } catch {
    // A lock we cannot read must not block a legitimate sign-in. The IP
    // limiter above still applies.
  }
  return { locked: false, retryAfter: 0 };
}

/** Count a failure and lock the identity once the cap is reached. */
export async function recordLoginFailure(username: string): Promise<void> {
  const key = identityKey(username);
  if (!key) return;
  try {
    const n = await redis.incr(`${key}:fail`);
    if (n === 1) await redis.expire(`${key}:fail`, WINDOW_SECONDS);
    if (n >= MAX_FAILURES) {
      await redis.set(`${key}:lock`, '1', 'EX', LOCK_SECONDS);
      await redis.del(`${key}:fail`);
      logger.warn(`Account locked after ${n} failed sign-ins: ${key}`);
      void notifyLockout(username);
    }
  } catch (err) {
    logger.warn(`Could not record login failure: ${(err as Error).message}`);
  }
}

/** Clear the counter once they get in, so a bad day does not accumulate. */
export async function clearLoginFailures(username: string): Promise<void> {
  const key = identityKey(username);
  if (!key) return;
  try { await redis.del(`${key}:fail`, `${key}:lock`); } catch { /* best effort */ }
}

/**
 * Tell the owner their account was locked.
 *
 * A lockout is the first sign most people get that somebody is trying their
 * password. Sent through the notice path so it uses the same SMS transport,
 * and never allowed to fail the sign-in it was triggered by.
 */
async function notifyLockout(username: string): Promise<void> {
  try {
    const raw = String(username).trim();
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: raw.toLowerCase() },
          { phone: normalizePhone(raw) },
        ],
      },
      select: { phone: true },
    });
    if (!user?.phone) return;

    const { sendSms, smsReady } = await import('./sms');
    if (!smsReady) return;
    await sendSms(user.phone,
      'MauzoHalisi: too many failed sign-in attempts on your account. ' +
      'It is locked for 15 minutes. If this was not you, change your password.');
  } catch (err) {
    logger.warn(`Lockout notice failed: ${(err as Error).message}`);
  }
}
