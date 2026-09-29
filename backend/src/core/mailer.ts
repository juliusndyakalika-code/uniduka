import nodemailer, { Transporter } from 'nodemailer';
import { logger } from '../utils/logger';

/**
 * Outbound email over SMTP.
 *
 * Only transactional mail goes through here: address confirmation today, and
 * whatever joins it later. Like core/sms and core/push, every send is best
 * effort and resolves rather than throws, so a mail server having a bad
 * afternoon cannot fail a registration.
 */

const HOST = process.env.SMTP_HOST ?? '';
const PORT = Number(process.env.SMTP_PORT ?? 587);
const USER = process.env.SMTP_USER ?? '';
const PASS = process.env.SMTP_PASSWORD ?? '';
const FROM = process.env.SMTP_FROM ?? 'MauzoHalisi <no-reply@mauzohalisi.com>';

export const mailReady = Boolean(HOST && USER && PASS);
if (!mailReady) logger.warn('SMTP not configured — email verification is disabled');

let transport: Transporter | null = null;
function client(): Transporter {
  // Built once and reused, so the pool keeps connections open instead of
  // renegotiating TLS for every message.
  if (!transport) {
    transport = nodemailer.createTransport({
      host: HOST,
      port: PORT,
      // 465 is implicit TLS; 587 and 25 start plaintext and upgrade via
      // STARTTLS. Getting this backwards fails the handshake rather than
      // sending anything in the clear, but it fails on every send.
      secure: PORT === 465,
      auth: { user: USER, pass: PASS },
      pool: true,
      maxConnections: 3,
      // Without these, a blocked or unreachable SMTP port is not an error, it
      // is a wait: nodemailer's defaults run to minutes, so the request that
      // asked for a code sat spinning until the browser gave up. Railway
      // blocks outbound SMTP below the Pro plan, which is exactly that case,
      // and it has to surface as a failure the screen can report rather than
      // as a hang.
      connectionTimeout: 10_000,
      greetingTimeout:   10_000,
      socketTimeout:     15_000,
    });
  }
  return transport;
}

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/** Hard ceiling, so nothing upstream can wait on this longer than this. */
const SEND_TIMEOUT_MS = 20_000;

export async function sendMail(mail: Mail): Promise<boolean> {
  if (!mailReady) return false;
  try {
    // The transport timeouts above cover the usual failures; this covers the
    // rest, because a request hanging is worse than one that fails.
    await Promise.race([
      client().sendMail({ from: FROM, ...mail }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Mail send timed out')), SEND_TIMEOUT_MS).unref()),
    ]);
    return true;
  } catch (err) {
    // The address is not logged. It is the thing worth protecting in this line
    // and the message identifies the failure well enough without it.
    logger.warn(`Email send failed (${mail.subject}): ${(err as Error).message}`);
    return false;
  }
}

/**
 * The address confirmation message.
 *
 * A code rather than a magic link, deliberately. The same six digits work when
 * mail opens on a different device from the one signing up, which on a phone is
 * the common case, and there is no link for a mail scanner to burn by
 * prefetching it.
 */
export async function sendVerificationEmail(to: string, code: string, name?: string): Promise<boolean> {
  const greeting = name ? `Hi ${name},` : 'Hi,';
  const text =
    `${greeting}\n\n` +
    `Your MauzoHalisi verification code is ${code}\n\n` +
    `It expires in 30 minutes. If you did not create an account, ignore this message.\n\n` +
    `MauzoHalisi`;

  const html =
    `<div style="font-family:system-ui,sans-serif;font-size:15px;color:#1f2933;line-height:1.6">` +
    `<p>${greeting}</p>` +
    `<p>Your MauzoHalisi verification code is:</p>` +
    `<p style="font-size:30px;font-weight:700;letter-spacing:6px;margin:24px 0">${code}</p>` +
    `<p>It expires in 30 minutes.</p>` +
    `<p style="color:#7b8794;font-size:13px">If you did not create an account, ignore this message.</p>` +
    `</div>`;

  return sendMail({ to, subject: `${code} is your MauzoHalisi verification code`, text, html });
}
