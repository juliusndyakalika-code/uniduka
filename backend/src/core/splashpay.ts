import crypto from 'crypto';
import { logger } from '../utils/logger';

/**
 * SplashPay, the mobile money gateway subscriptions are paid through.
 *
 * Collections only. Disbursements exist in their API but MauzoHalisi never
 * pays money out, so that half is deliberately not wired up.
 */

const BASE    = process.env.SPLASHPAY_BASE_URL ?? 'https://api.splashpay.co.tz/api/v1';
const KEY     = process.env.SPLASHPAY_API_KEY ?? '';
const SECRET  = process.env.SPLASHPAY_API_SECRET ?? '';
const HOOK    = process.env.SPLASHPAY_WEBHOOK_SECRET ?? '';

export const splashpayReady = Boolean(KEY && SECRET);
if (!splashpayReady) logger.warn('SplashPay keys not set — subscription payments are disabled');

export interface InitiateArgs {
  amount: number;
  reference: string;
  phone: string;
  customerName: string;
  customerEmail: string;
  /** Survives the round trip and comes back on the webhook. */
  metadata?: Record<string, unknown>;
}

export interface InitiateResult {
  ok: boolean;
  providerReference?: string;
  provider?: string;
  status?: string;
  code?: string;
  message?: string;
}

/**
 * Tanzanian numbers reach SplashPay as 255XXXXXXXXX with no plus and no
 * leading zero. People type all three shapes, and the gateway rejects two of
 * them, so normalise here rather than at each caller.
 */
export function toMsisdn(raw: string): string | null {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (/^255\d{9}$/.test(digits)) return digits;
  if (/^0\d{9}$/.test(digits))   return '255' + digits.slice(1);
  if (/^\d{9}$/.test(digits))    return '255' + digits;
  return null;
}

/** Push an STK prompt to the customer's phone. */
export async function initiateMobileMoney(args: InitiateArgs): Promise<InitiateResult> {
  if (!splashpayReady) return { ok: false, code: 'NOT_CONFIGURED', message: 'Payments are not set up yet.' };

  try {
    const res = await fetch(`${BASE}/payments/mobile-money`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': KEY,
        'X-API-SECRET': SECRET,
        // Our reference is already unique per attempt, so it doubles as the
        // idempotency key: a retried request cannot charge twice.
        'Idempotency-Key': args.reference,
      },
      body: JSON.stringify({
        amount: args.amount,
        currency: 'TZS',
        reference: args.reference,
        phone: args.phone,
        customer_name: args.customerName,
        customer_email: args.customerEmail,
        ...(args.metadata ? { metadata: args.metadata } : {}),
      }),
    });

    const body = await res.json().catch(() => ({})) as Record<string, never>;
    if (!res.ok || body?.status !== 'success') {
      return {
        ok: false,
        code: body?.code ?? `HTTP_${res.status}`,
        message: body?.message ?? 'The payment could not be started.',
      };
    }
    const d = (body.data ?? {}) as Record<string, string>;
    return { ok: true, providerReference: d.provider_reference, provider: d.provider, status: d.status };
  } catch (err) {
    logger.warn(`SplashPay initiate failed: ${(err as Error).message}`);
    return { ok: false, code: 'NETWORK', message: 'Could not reach the payment service. Try again.' };
  }
}

/**
 * Ask the gateway where a payment got to.
 *
 * The webhook is the primary signal; this exists because a webhook can be lost
 * and a shop watching a spinner should not have to wait for a retry an hour
 * later to learn their payment went through.
 */
export async function checkStatus(reference: string): Promise<{ status?: string; providerReference?: string }> {
  if (!splashpayReady) return {};
  try {
    const res = await fetch(`${BASE}/payments/check-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-KEY': KEY, 'X-API-SECRET': SECRET },
      body: JSON.stringify({ reference }),
    });
    const body = await res.json().catch(() => ({})) as Record<string, never>;
    const d = (body?.data ?? {}) as Record<string, string>;
    return { status: d.status, providerReference: d.provider_reference };
  } catch {
    return {};
  }
}

/**
 * Verify a webhook really came from SplashPay.
 *
 * Signed as HMAC_SHA256(timestamp + "." + rawBody, WEBHOOK_SECRET), so the raw
 * bytes are required: re-serialising the parsed JSON changes key order and
 * whitespace and the signature stops matching.
 *
 * The timestamp window is deliberately wide. SplashPay retries a failed
 * delivery for up to 24 hours, and a narrow window would reject the retry that
 * finally gets through. Replay is already harmless because applying a payment
 * is idempotent; this only turns away something ancient.
 */
export function verifyWebhook(rawBody: Buffer | string, signature?: string, timestamp?: string): boolean {
  if (!HOOK) {
    logger.warn('SPLASHPAY_WEBHOOK_SECRET not set — refusing the webhook rather than trusting it');
    return false;
  }
  if (!signature || !timestamp) return false;

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 26 * 60 * 60) return false;

  const body = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
  const expected = crypto.createHmac('sha256', HOOK).update(`${timestamp}.${body}`).digest('hex');

  // Compared byte by byte in constant time. A plain === leaks how much of the
  // signature was right through how long the comparison took.
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Their status strings mapped onto ours. */
export function mapStatus(s?: string): 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED' | 'CANCELLED' | 'EXPIRED' {
  switch ((s ?? '').toLowerCase()) {
    case 'success':    return 'SUCCESS';
    case 'processing': return 'PROCESSING';
    case 'failed':
    case 'rejected':   return 'FAILED';
    case 'cancelled':
    case 'user_cancelled': return 'CANCELLED';
    case 'expired':    return 'EXPIRED';
    default:           return 'PENDING';
  }
}
