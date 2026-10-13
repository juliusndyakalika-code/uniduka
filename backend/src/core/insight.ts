import { prisma } from './prisma';
import { redis } from './redis';
import { logger } from '../utils/logger';
import { aiReady, aiText } from './ai';
import { toGsm, gsmLength, roomInOnePart } from './gsm';
import { shopMetrics, shortMoney, type Metrics, type Period } from './reports';
import { stockForecast } from './forecast';

/**
 * One sentence of advice at the end of the business report.
 *
 * The figures in the report are computed, never generated. The model is given
 * a short list of facts that were themselves computed from the database, and
 * asked for one Swahili sentence suggesting what to do about them. Whatever
 * it writes is then checked: every number in the sentence must be one of the
 * numbers it was given, or the sentence is thrown away. A report with no tip
 * is fine. A report with an invented figure is not.
 *
 * The tip only goes in if it fits in the same billed SMS part as the report.
 * It is never the reason a message costs two.
 */

/** Below this there is no room for a sentence worth reading. */
const MIN_ROOM = 30;
const CACHE_SECONDS = 3 * 86_400;

interface Facts { lines: string[] }

async function gatherFacts(shopId: string, from: Date, to: Date, m: Metrics): Promise<Facts> {
  const span = to.getTime() - from.getTime() + 1;
  const prevFrom = new Date(from.getTime() - span);
  const prevTo = new Date(from.getTime() - 1);

  const [prev, top, forecast] = await Promise.all([
    shopMetrics(shopId, prevFrom, prevTo),
    prisma.transactionItem.groupBy({
      by: ['name'],
      where: { transaction: { shopId, status: 'COMPLETED', createdAt: { gte: from, lte: to } } },
      _sum: { lineTotal: true, quantity: true },
      orderBy: { _sum: { lineTotal: 'desc' } },
      take: 1,
    }),
    stockForecast(shopId),
  ]);

  const lines: string[] = [
    `Mauzo: ${shortMoney(m.revenue)} TZS`,
    `Faida halisi: ${shortMoney(m.netProfit)} TZS`,
    `Risiti: ${m.transactions}`,
  ];
  if (prev.revenue > 0) {
    const pct = Math.round(((m.revenue - prev.revenue) / prev.revenue) * 100);
    lines.push(`Mauzo ukilinganisha na kipindi kilichopita: ${pct >= 0 ? '+' : ''}${pct}%`);
  }
  if (m.revenue > 0) {
    lines.push(`Asilimia ya faida: ${Math.round((m.netProfit / m.revenue) * 100)}%`);
  }
  if (top[0]?.name) {
    lines.push(`Bidhaa iliyouza zaidi: ${toGsm(top[0].name).slice(0, 24)}`);
  }
  const soon = forecast.filter(f => f.urgent && f.daysLeft !== null).slice(0, 2);
  for (const f of soon) {
    const days = Math.floor(f.daysLeft!);
    lines.push(`${toGsm(f.name).slice(0, 24)} itaisha ${days <= 0 ? 'leo' : `ndani ya siku ${days}`}`);
  }
  return { lines };
}

/** Numbers as written, normalised so "1,250" and "1250" compare equal. */
function numbers(text: string): string[] {
  return (text.match(/\d[\d,.]*\s?[KkMm%]?/g) ?? [])
    .map(s => s.replace(/[,\s]/g, '').replace(/\.$/, '').toUpperCase());
}

/** True when every number in the sentence was handed to the model. */
export function onlyGivenNumbers(sentence: string, facts: string[]): boolean {
  const allowed = new Set(facts.flatMap(numbers));
  return numbers(sentence).every(n => allowed.has(n) || allowed.has(n.replace(/[KM%]$/, '')));
}

const SYSTEM =
  'Wewe ni mshauri wa biashara ndogo za Tanzania. Unaandika sentensi MOJA tu ' +
  'kwa Kiswahili rahisi, ikimpa mwenye duka hatua moja ya kuchukua kulingana na ' +
  'takwimu alizopewa. Sheria: tumia namba zilizotolewa tu, usihesabu namba mpya; ' +
  'usitumie emoji wala alama za kipekee; usirudie takwimu zote, chagua jambo ' +
  'moja muhimu zaidi; jibu sentensi pekee bila maelezo mengine.';

/**
 * The report body with a tip appended when one fits, or unchanged.
 *
 * Cached per shop and period, so the preview, a test send and the scheduled
 * send all show the same sentence and pay for it once.
 */
export async function withInsight(
  body: string,
  ctx: { shopId: string; period: Period; periodKey: string; from: Date; to: Date; metrics: Metrics },
): Promise<string> {
  if (!aiReady || ctx.metrics.quiet) return body;

  const room = roomInOnePart(body) - 1;   // the newline before it
  if (room < MIN_ROOM) return body;

  const cacheKey = `insight:${ctx.shopId}:${ctx.period}:${ctx.periodKey}`;
  try {
    const cached = await redis.get(cacheKey);
    if (cached !== null) return cached && gsmLength(cached) <= room ? `${body}\n${cached}` : body;
  } catch { /* a cache miss is not a failure */ }

  let tip = '';
  try {
    const facts = await gatherFacts(ctx.shopId, ctx.from, ctx.to, ctx.metrics);
    const raw = await aiText({
      kind: 'insight',
      shopId: ctx.shopId,
      system: SYSTEM,
      prompt:
        `Takwimu za duka (${ctx.period}):\n- ${facts.lines.join('\n- ')}\n\n` +
        `Andika sentensi moja isiyozidi herufi ${room}.`,
    });
    // No answer at all (off, capped, refused, failing) is not cached, so the
    // next attempt can still succeed.
    if (raw === null) return body;
    const sentence = raw ? toGsm(raw.replace(/\s+/g, ' ').replace(/^["']|["']$/g, '')).trim() : '';
    if (sentence && gsmLength(sentence) <= room && onlyGivenNumbers(sentence, facts.lines)) {
      tip = sentence;
    } else if (sentence) {
      logger.warn(`Insight dropped for shop ${ctx.shopId}: ${gsmLength(sentence) > room ? 'too long' : 'unverified number'}`);
    }
  } catch (err) {
    logger.error(`Insight failed for shop ${ctx.shopId}: ${(err as Error).message}`);
    return body;
  }

  // An unusable answer is cached as empty, so a period that produced nothing
  // worth sending is not paid for again on every preview.
  try { await redis.set(cacheKey, tip, 'EX', CACHE_SECONDS); } catch { /* best effort */ }
  return tip ? `${body}\n${tip}` : body;
}
