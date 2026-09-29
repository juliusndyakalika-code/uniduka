import { logger } from '../utils/logger';

/**
 * Textify Africa, the SMS gateway.
 *
 * Two distinct jobs live behind one API key:
 *
 *   sendSms   transactional notices we compose ourselves (payment received,
 *             subscription about to lapse). Billed per 160-character part.
 *   sendOtp   one-time codes. Textify generates, stores and expires the code;
 *             we never see it. Sent without a sender_name it goes out free on
 *             their system sender, which is what we want for account
 *             verification and password reset.
 *
 * Every call here is best effort in the same sense as core/push: an SMS that
 * fails must never fail the thing that triggered it. A payment is still
 * applied if the confirmation text bounces.
 */

const BASE   = process.env.TEXTIFY_BASE_URL ?? 'https://portal.textify.africa/api/v1';
const KEY    = process.env.TEXTIFY_API_KEY ?? '';
/**
 * The approved alphanumeric sender the notices go out as.
 *
 * Optional on purpose. Textify only accepts a sender_name that is approved and
 * owned by the caller, and rejects the whole send otherwise, so an unset or
 * not-yet-approved name must mean "send from the system sender" rather than
 * "fail". Sender name approval is a manual review on their side and can take
 * days; notifications should not wait for it.
 */
const SENDER = (process.env.TEXTIFY_SENDER_NAME ?? '').trim();
/** Shown inside Textify's own OTP wording, so the code is attributable. */
const BRAND  = process.env.TEXTIFY_BRAND_NAME ?? 'MauzoHalisi';

export const smsReady = Boolean(KEY);
if (!smsReady) logger.warn('TEXTIFY_API_KEY not set — SMS and OTP are disabled');

/** How long Textify keeps a code alive. Mirrored here only for user-facing copy. */
export const OTP_TTL_MINUTES = 30;

/**
 * Textify normalises recipients to 255… itself, but it rejects a blank or
 * malformed one with a 400 that costs a round trip. Numbers reach us in every
 * Tanzanian format (0712…, +255712…, 255712…), so they are reduced to the
 * 255XXXXXXXXX form the gateway documents before they are sent.
 *
 * Returns null rather than a best guess when the input cannot be a Tanzanian
 * mobile number. A caller that cannot produce a valid recipient should skip the
 * send, not ask the gateway to reject it.
 */
export function toRecipient(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[\s\-().+]/g, '');
  if (/^255\d{9}$/.test(digits)) return digits;
  if (/^0\d{9}$/.test(digits))   return '255' + digits.slice(1);
  if (/^\d{9}$/.test(digits))    return '255' + digits;
  return null;
}

interface TextifyResponse {
  success?: boolean;
  status_code?: number;
  message?: string;
  error?: string;
  data?: unknown;
}

async function call(path: string, body: unknown, auth = true): Promise<TextifyResponse | null> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(auth ? { Authorization: `Bearer ${KEY}` } : {}),
      },
      body: JSON.stringify(body),
      // The gateway is a third party on the request path of a login. Without a
      // ceiling, a stalled connection holds an Express worker until the socket
      // times out on its own.
      signal: AbortSignal.timeout(15_000),
    });

    const text = await res.text();
    let parsed: TextifyResponse = {};
    try { parsed = JSON.parse(text) as TextifyResponse; } catch { /* non-JSON error page */ }

    if (!res.ok || parsed.success === false) {
      // The message is Textify's own and safe to log; the body is not echoed in
      // full because a failed /otps call carries the recipient's number.
      logger.warn(`Textify ${path} failed: ${res.status} ${parsed.message ?? parsed.error ?? 'no detail'}`);
      return parsed.success === false ? parsed : null;
    }
    return parsed;
  } catch (err) {
    logger.warn(`Textify ${path} unreachable: ${(err as Error).message}`);
    return null;
  }
}

/**
 * Send one transactional SMS.
 *
 * Resolves false rather than throwing. Callers are notification sites, and a
 * gateway outage must not surface as a failed payment or a 500 on a cron tick.
 */
export async function sendSms(to: string | null | undefined, content: string): Promise<boolean> {
  if (!smsReady) return false;
  const receiver = toRecipient(to);
  if (!receiver) {
    logger.warn('SMS skipped: no usable recipient number');
    return false;
  }

  const res = await call('/messages', {
    ...(SENDER ? { sender_name: SENDER } : {}),
    is_scheduled: false,
    messages: [{ receiver, content }],
  });
  return res?.success === true;
}

/**
 * Ask Textify to generate and deliver a 6-digit code.
 *
 * Deliberately sent without a sender_name. An unbranded OTP goes out on their
 * free system sender, and these are account-security messages rather than
 * marketing: paying per code to brand a password reset buys nothing, and a
 * send that fails because the sender name is still pending review would lock
 * people out of their own accounts.
 */
export async function sendOtp(to: string): Promise<boolean> {
  if (!smsReady) return false;
  const phone_number = toRecipient(to);
  if (!phone_number) return false;

  const res = await call('/otps', { phone_number, brand_name: BRAND });
  return res?.success === true;
}

/**
 * Check a code against Textify and consume it.
 *
 * Textify exposes this endpoint publicly, without an API key, which means the
 * gateway itself offers no protection against someone walking the million
 * possible codes for a known number inside the 30 minute window. Nothing can be
 * done about that from here, so two rules follow and both are load bearing:
 *
 *   1. Only the backend calls this. A client claiming "I verified" is never
 *      taken at its word, because that claim is trivially forged.
 *   2. Callers must cap attempts themselves before reaching this function.
 *      See otpAttempts in the auth module.
 */
export async function verifyOtp(to: string, code: string | number): Promise<boolean> {
  if (!smsReady) return false;
  const phone_number = toRecipient(to);
  if (!phone_number) return false;

  // The field is documented as a JSON number, not a string, and a quoted value
  // is rejected as a validation error.
  const numeric = Number(String(code).trim());
  if (!Number.isInteger(numeric) || numeric <= 0) return false;

  const res = await call('/otps/verify', { code: numeric, phone_number }, false);
  return res?.success === true;
}

/**
 * Remaining SMS credits, or null if the gateway could not be reached.
 *
 * Used by the credit check so the operator finds out before a subscription
 * reminder silently stops going out.
 */
export async function balance(): Promise<number | null> {
  if (!smsReady) return null;
  try {
    const res = await fetch(`${BASE}/users/self/balance`, {
      headers: { Authorization: `Bearer ${KEY}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const body = await res.json() as { data?: { balance?: number; sms_balance?: number } | number };
    if (typeof body.data === 'number') return body.data;
    return body.data?.balance ?? body.data?.sms_balance ?? null;
  } catch {
    return null;
  }
}
