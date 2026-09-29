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
/**
 * Keys a webhook signature is checked against, in order of preference.
 *
 * SplashPay reveals a signing secret at the moment a webhook is created, which
 * is why it is absent from the credentials page: it belongs to the webhook, not
 * to the account. Once set, it is the only thing accepted.
 *
 * The API secret is a fallback for the window before that webhook exists, so a
 * callback arriving mid-setup is not silently refused. It is not accepted
 * alongside a configured webhook secret, because the API secret travels in the
 * header of every outbound request while the webhook secret is only ever used
 * for verification. Honouring both would mean a leaked API key also bought the
 * ability to forge subscription payments.
 */
const HOOK_SECRETS = process.env.SPLASHPAY_WEBHOOK_SECRET
  ? [process.env.SPLASHPAY_WEBHOOK_SECRET]
  : [process.env.SPLASHPAY_API_SECRET ?? ''].filter(Boolean);

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
 * Withdraw a prompt that is still sitting on the customer's phone.
 *
 * Only possible while the payment is pending or processing; once it has
 * succeeded, failed or expired the gateway refuses with PAYMENT_NOT_CANCELLABLE.
 * That refusal is not an error condition here, it is the answer: the customer
 * got there first, and the payment stands.
 *
 * Worth doing rather than merely stopping our own polling. A payment we leave
 * pending is one the gateway still considers live, and the customer keeps being
 * re-prompted for money they already declined.
 */
export async function cancelPayment(reference: string): Promise<{
  cancelled: boolean;
  /** True when the gateway says it is too late, which is a real outcome. */
  tooLate: boolean;
  code?: string;
}> {
  if (!splashpayReady) return { cancelled: false, tooLate: false };
  try {
    const res = await fetch(`${BASE}/payments/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-KEY': KEY, 'X-API-SECRET': SECRET },
      body: JSON.stringify({ reference }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = await res.json().catch(() => ({})) as { status?: string; code?: string };
    const code = body?.code;
    if (res.ok && body?.status === 'success') return { cancelled: true, tooLate: false, code };
    return { cancelled: false, tooLate: code === 'PAYMENT_NOT_CANCELLABLE', code };
  } catch (err) {
    logger.warn(`SplashPay cancel failed for ${reference}: ${(err as Error).message}`);
    return { cancelled: false, tooLate: false };
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
  if (HOOK_SECRETS.length === 0) {
    logger.warn('No SplashPay secret configured — refusing the webhook rather than trusting it');
    return false;
  }
  if (!signature || !timestamp) return false;

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 26 * 60 * 60) return false;

  const body = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
  const given = Buffer.from(signature, 'utf8');

  // Every candidate is checked even after one matches, so the time taken does
  // not reveal which secret was the right one.
  let matched = false;
  for (const secret of HOOK_SECRETS) {
    const expected = Buffer.from(
      crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex'),
      'utf8',
    );
    // Compared byte by byte in constant time. A plain === leaks how much of the
    // signature was right through how long the comparison took.
    if (expected.length === given.length && crypto.timingSafeEqual(expected, given)) matched = true;
  }

  if (!matched) {
    logger.warn(
      'SplashPay webhook signature did not match the ' +
      (process.env.SPLASHPAY_WEBHOOK_SECRET
        ? 'configured webhook secret. Check it matches the one shown when the webhook was created.'
        : 'API secret, and no SPLASHPAY_WEBHOOK_SECRET is set. Add the webhook in SplashPay and set the secret it shows.'),
    );
  }
  return matched;
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
