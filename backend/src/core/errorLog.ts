import { createHash } from 'node:crypto';
import Transport from 'winston-transport';

/**
 * Keeps the platform's errors where an operator can read them.
 *
 * Until now an error went to stdout and nowhere else, so finding out why a
 * message had not been delivered meant somebody with Railway access reading
 * raw logs. This catches every error-level log line, groups repeats, masks
 * what should not be stored, and writes it to error_logs for the admin
 * portal's error page.
 *
 * Three rules keep it from becoming a problem of its own:
 *
 *   1. It never throws and never logs through the logger it is part of, so a
 *      broken database cannot turn one error into an infinite loop of them.
 *   2. It buffers. Occurrences are counted in memory and flushed every ten
 *      seconds, so an error storm costs one write per kind of error per
 *      flush, not one write per occurrence.
 *   3. It masks before it stores. Gateway errors carry phone numbers
 *      ("0,255764628075,No More Credits"), and a table any admin can read is
 *      not the place for them.
 */

const FLUSH_MS = 10_000;
const MAX_MESSAGE = 2_000;
const MAX_STACK = 6_000;

interface Pending { message: string; stack?: string; count: number; lastAt: Date }
const pending = new Map<string, Pending>();

/** Phone numbers, emails and bearer tokens, masked to their last few characters. */
export function mask(text: string): string {
  return text
    // JWTs and long opaque tokens
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[token]')
    .replace(/\b(Bearer\s+)[\w.-]{12,}/gi, '$1[token]')
    // emails: keep the first letter and the domain
    .replace(/\b([A-Za-z0-9])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g, '$1***@$2')
    // runs of 9+ digits (phone numbers, card-like strings): keep the last 3
    .replace(/\+?\d{6,}(\d{3})\b/g, '•••••$1');
}

/**
 * What makes two errors "the same one". Ids, numbers and quoted values change
 * between occurrences of one underlying failure; stripping them lets the
 * repeats collapse onto a single row.
 */
export function fingerprint(message: string): string {
  const shape = message
    .toLowerCase()
    .replace(/\b[a-z0-9]{20,}\b/g, '<id>')            // cuids and similar
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/g, '<uuid>')
    .replace(/\d+/g, '#')
    .replace(/(["'`]).*?\1/g, '<q>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
  return createHash('sha1').update(shape).digest('hex');
}

/** Terminal colour codes. The dev logger colourises before transports run. */
const ANSI = /\x1B\[[0-9;]*m/g;

function record(rawMessage: string, rawStack?: string) {
  rawMessage = rawMessage.replace(ANSI, '');
  rawStack = rawStack?.replace(ANSI, '');
  const message = mask(rawMessage).slice(0, MAX_MESSAGE);
  const stack = rawStack ? mask(rawStack).slice(0, MAX_STACK) : undefined;
  const key = fingerprint(rawMessage);
  const seen = pending.get(key);
  if (seen) {
    seen.count += 1; seen.message = message; seen.lastAt = new Date();
    if (stack) seen.stack = stack;
  } else {
    pending.set(key, { message, stack, count: 1, lastAt: new Date() });
  }
}

let flushing = false;
async function flush() {
  if (flushing || pending.size === 0) return;
  flushing = true;
  const batch = [...pending.entries()];
  pending.clear();
  try {
    // Imported here rather than at the top: core/prisma imports the logger,
    // and the logger now carries this transport.
    const { prisma } = await import('./prisma');
    for (const [fp, e] of batch) {
      await prisma.errorLog.upsert({
        where:  { fingerprint: fp },
        create: { fingerprint: fp, message: e.message, stack: e.stack, count: e.count, lastAt: e.lastAt },
        update: { message: e.message, stack: e.stack ?? undefined, count: { increment: e.count }, lastAt: e.lastAt },
      });
    }
  } catch (err) {
    // Deliberately console, not logger: logging this through the logger would
    // feed it straight back into the transport that just failed.
    console.error(`[errorLog] could not store ${batch.length} error group(s): ${(err as Error).message}`);
  } finally {
    flushing = false;
  }
}

const timer = setInterval(() => { void flush(); }, FLUSH_MS);
timer.unref();

/** A winston transport that records error-level lines. */
export class ErrorLogTransport extends Transport {
  constructor() { super({ level: 'error' }); }

  log(info: { message?: unknown; stack?: unknown; level?: string }, next: () => void) {
    try {
      const message = typeof info.message === 'string' ? info.message : JSON.stringify(info.message);
      // The stack often arrives folded into the message ("Unhandled error:
      // <stack>"); split it so the list shows one line and the detail the rest.
      const [first, ...rest] = message.split('\n');
      const stack = typeof info.stack === 'string' ? info.stack : rest.length ? rest.join('\n') : undefined;
      record(first, stack);
    } catch { /* never let recording an error raise one */ }
    next();
  }
}

// ── Retention ────────────────────────────────────────────────────────────────

export const RETENTION_KEY = 'errorLogRetentionDays';
export const RETENTION_CHOICES = [7, 14, 30, 60, 90] as const;
export const RETENTION_DEFAULT = 30;
/** However long the window, the table never holds more groups than this. */
const HARD_CAP = 5_000;

export async function retentionDays(): Promise<number> {
  const { prisma } = await import('./prisma');
  const row = await prisma.appSetting.findUnique({ where: { key: RETENTION_KEY } });
  const n = Number(row?.value);
  return (RETENTION_CHOICES as readonly number[]).includes(n) ? n : RETENTION_DEFAULT;
}

/** Deletes groups not seen within the window, then trims to the hard cap. */
export async function sweepErrorLogs(): Promise<{ expired: number; trimmed: number }> {
  const { prisma } = await import('./prisma');
  const days = await retentionDays();
  const cutoff = new Date(Date.now() - days * 86_400_000);
  const expired = (await prisma.errorLog.deleteMany({ where: { lastAt: { lt: cutoff } } })).count;

  let trimmed = 0;
  const total = await prisma.errorLog.count();
  if (total > HARD_CAP) {
    const oldest = await prisma.errorLog.findMany({
      orderBy: { lastAt: 'asc' }, take: total - HARD_CAP, select: { id: true },
    });
    trimmed = (await prisma.errorLog.deleteMany({ where: { id: { in: oldest.map(o => o.id) } } })).count;
  }
  return { expired, trimmed };
}

export function startErrorLogRetention() {
  const run = () => sweepErrorLogs().catch(err =>
    console.error(`[errorLog] retention sweep failed: ${(err as Error).message}`));
  setTimeout(run, 60_000).unref();             // once shortly after boot
  setInterval(run, 6 * 60 * 60_000).unref();   // then every six hours
}

/** For a clean shutdown, so the last few seconds of errors are not lost. */
export const flushErrorLogs = flush;
