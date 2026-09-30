import { prisma } from './prisma';
import { logger } from '../utils/logger';

/**
 * The periodic business report: what a shop sold, earned, and holds in stock.
 *
 * The figures are computed with the same rules as the reporting page, so a
 * report that arrives by SMS and the same period opened in the app agree. They
 * are deliberately not recomputed from a simpler formula here: an owner who
 * finds two different profit numbers for one day stops trusting both.
 */

export type Period = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export interface Metrics {
  revenue: number;
  netProfit: number;
  transactions: number;
  /** Inventory at cost, right now. A position, not a flow. */
  stockValue: number;
  /** Nothing sold and nothing spent: the report is not worth sending. */
  quiet: boolean;
}

/**
 * Revenue, profit, transaction count and stock value for one shop.
 *
 * Revenue is accrual: a credit sale counts on the day it is made, because that
 * is when the shop parted with the goods. Net profit is gross profit plus
 * profit on goods sold for consignment partners, less operating expenses for
 * the period, matching totalNetProfit on the reporting page.
 */
export async function shopMetrics(shopId: string, from: Date, to: Date): Promise<Metrics> {
  const range = { gte: from, lte: to };

  const [transactions, expenseAgg, consignAgg, stockItems] = await Promise.all([
    prisma.transaction.findMany({
      where:  { shopId, status: 'COMPLETED', createdAt: range },
      select: {
        total: true,
        items: { select: { quantity: true, product: { select: { costPrice: true } } } },
      },
    }),
    prisma.expense.aggregate({ where: { shopId, incurredAt: range }, _sum: { amount: true } }),
    prisma.consignmentSale.aggregate({ where: { shopId, soldAt: range }, _sum: { profit: true } }),
    // Current position, not period activity, so it carries no date filter.
    prisma.inventoryItem.findMany({
      where:  { shopId, product: { isActive: true } },
      select: { quantity: true, costPrice: true },
    }),
  ]);

  const revenue = transactions.reduce((s, t) => s + t.total, 0);
  const grossProfit = transactions.reduce((s, t) => {
    const cost = t.items.reduce((cs, i) => cs + (i.product?.costPrice ?? 0) * i.quantity, 0);
    return s + t.total - cost;
  }, 0);

  const expenses   = expenseAgg._sum.amount ?? 0;
  const consignment = consignAgg._sum.profit ?? 0;
  const netProfit  = grossProfit + consignment - expenses;
  const stockValue = stockItems.reduce((s, i) => s + i.quantity * i.costPrice, 0);

  return {
    revenue,
    netProfit,
    transactions: transactions.length,
    stockValue,
    quiet: transactions.length === 0 && expenses === 0,
  };
}

// ─── FORMATTING ──────────────────────────────────────────────────────────────

/**
 * Money short enough to survive a 160-character SMS.
 *
 * Textify bills per 160 characters, so a report that runs to 161 costs double
 * for one digit. Full figures like 1,250,000 spend eleven characters on a
 * number nobody reads to the shilling in a daily summary; 1.25M spends five
 * and says the same thing. Anything under a hundred thousand is shown in full,
 * because at that size the exact figure is the point.
 */
export function shortMoney(n: number): string {
  const v = Math.round(n);
  const sign = v < 0 ? '-' : '';
  const a = Math.abs(v);
  if (a >= 1_000_000) {
    const m = a / 1_000_000;
    return `${sign}${m >= 10 ? Math.round(m) : m.toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (a >= 100_000) {
    const k = a / 1_000;
    return `${sign}${k >= 100 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, '')}K`;
  }
  return `${sign}${a.toLocaleString('en-US')}`;
}

/** The label a person reads: "30 Sep", "Week to 30 Sep", "September", "Q3", "2026". */
export function periodLabel(period: Period, end: Date, zone: string): string {
  const d = (opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('en-GB', { timeZone: zone, ...opts }).format(end);

  switch (period) {
    case 'daily':     return d({ day: 'numeric', month: 'short' });
    case 'weekly':    return `Wk to ${d({ day: 'numeric', month: 'short' })}`;
    case 'monthly':   return d({ month: 'long' });
    case 'quarterly': {
      const month = Number(d({ month: 'numeric' }));
      return `Q${Math.floor((month - 1) / 3) + 1} ${d({ year: 'numeric' })}`;
    }
    case 'yearly':    return d({ year: 'numeric' });
  }
}

/**
 * The message itself, written to fit one billed part.
 *
 * Kept to four figures on four lines. An owner reads this on a phone, usually
 * standing up; anything longer is skimmed, and every line beyond the fourth is
 * paid for twice if it tips the message over 160 characters.
 */
export function composeReport(shopName: string, label: string, m: Metrics): string {
  // The shop name is the only unbounded part, so it is the part that is cut.
  const name = shopName.length > 22 ? shopName.slice(0, 21) + '…' : shopName;
  return [
    `${name} ${label}`,
    `Sales ${shortMoney(m.revenue)}`,
    `Profit ${shortMoney(m.netProfit)}`,
    `Receipts ${m.transactions}`,
    `Stock ${shortMoney(m.stockValue)}`,
  ].join('\n');
}

/** Billed SMS parts for a message. */
export const smsParts = (body: string) => Math.max(1, Math.ceil(body.length / 160));

// ─── PERIOD BOUNDARIES ───────────────────────────────────────────────────────

/**
 * The window a report covers, in the shop's own timezone.
 *
 * Computed against the zone rather than UTC because a day boundary three hours
 * out puts the evening's takings in tomorrow's report, which is exactly the
 * kind of discrepancy that makes an owner distrust the figures.
 */
export function periodRange(period: Period, now: Date, zone: string): { from: Date; to: Date; key: string } {
  const [y, mo, da] = ymd(now, zone);
  const pad = (n: number) => String(n).padStart(2, '0');

  // Reports always cover completed periods. Yesterday, last week, last month:
  // a report of a period still running would be read as a total and be wrong
  // by whatever happens between sending it and the period actually ending.
  const endOfYesterday = new Date(localMidnight(y, mo, da, zone).getTime() - 1);

  switch (period) {
    case 'daily': {
      const from = new Date(endOfYesterday.getTime() + 1 - 86_400_000);
      const [fy, fm, fd] = ymd(from, zone);
      return { from, to: endOfYesterday, key: `${fy}-${pad(fm)}-${pad(fd)}` };
    }
    case 'weekly': {
      const from = new Date(endOfYesterday.getTime() + 1 - 7 * 86_400_000);
      return { from, to: endOfYesterday, key: weekKey(endOfYesterday, zone) };
    }
    case 'monthly': {
      const py = mo === 1 ? y - 1 : y;
      const pm = mo === 1 ? 12 : mo - 1;
      return {
        from: localMidnight(py, pm, 1, zone),
        to:   new Date(localMidnight(y, mo, 1, zone).getTime() - 1),
        key:  `${py}-${pad(pm)}`,
      };
    }
    case 'quarterly': {
      const thisQuarterFirstMonth = Math.floor((mo - 1) / 3) * 3 + 1;
      const py = thisQuarterFirstMonth === 1 ? y - 1 : y;
      const pm = thisQuarterFirstMonth === 1 ? 10 : thisQuarterFirstMonth - 3;
      return {
        from: localMidnight(py, pm, 1, zone),
        to:   new Date(localMidnight(y, thisQuarterFirstMonth, 1, zone).getTime() - 1),
        key:  `${py}-Q${Math.floor((pm - 1) / 3) + 1}`,
      };
    }
    case 'yearly': {
      return {
        from: localMidnight(y - 1, 1, 1, zone),
        to:   new Date(localMidnight(y, 1, 1, zone).getTime() - 1),
        key:  `${y - 1}`,
      };
    }
  }
}

/** Calendar year, month and day as the zone reads them. */
function ymd(at: Date, zone: string): [number, number, number] {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  return f.format(at).split('-').map(Number) as [number, number, number];
}

/**
 * The instant midnight occurs in a zone on a given calendar date.
 *
 * Resolved in two passes: the offset is itself a function of the moment, and
 * near a daylight-saving boundary the offset at the guess differs from the
 * offset at the answer. East Africa does not observe DST, so the second pass
 * changes nothing here, but the function is not worth writing wrong.
 */
function localMidnight(y: number, m: number, d: number, zone: string): Date {
  const guess  = new Date(Date.UTC(y, m - 1, d));
  const first  = new Date(guess.getTime() - zoneOffsetMs(zone, guess));
  return new Date(guess.getTime() - zoneOffsetMs(zone, first));
}

/** Milliseconds a zone is ahead of UTC at a given instant. */
function zoneOffsetMs(zone: string, at: Date): number {
  const utc   = new Date(at.toLocaleString('en-US', { timeZone: 'UTC' }));
  const local = new Date(at.toLocaleString('en-US', { timeZone: zone }));
  return local.getTime() - utc.getTime();
}

/** ISO-ish week key, enough to be unique per shop per week. */
function weekKey(d: Date, zone: string): string {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const [yy, mm, dd] = f.format(d).split('-').map(Number);
  const start = Date.UTC(yy, 0, 1);
  const week = Math.ceil(((Date.UTC(yy, mm - 1, dd) - start) / 86_400_000 + 1) / 7);
  return `${yy}-W${String(week).padStart(2, '0')}`;
}

/** The local hour in a zone, for deciding whether it is time to send. */
export function localHour(zone: string, at: Date): number {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: 'numeric', hour12: false }).format(at));
}
