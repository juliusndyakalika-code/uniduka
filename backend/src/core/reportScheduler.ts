import { prisma } from './prisma';
import { logger } from '../utils/logger';
import { sendSms, smsReady } from './sms';
import { pushToShop, webPushReady } from './push';
import {
  shopMetrics, composeReport, periodRange, periodLabel, localHour, smsParts,
  type Period,
} from './reports';

/**
 * Sending the periodic business reports.
 *
 * SMS is the expensive channel and the one being optimised for. Four rules do
 * that work, in the order they matter:
 *
 *   1. Push first. An owner with the app installed gets a notification for
 *      nothing; SMS is only for owners we cannot otherwise reach. This is the
 *      largest saving available and costs nothing in reach.
 *   2. Nothing happened, nothing sent. A day with no sales and no expenses
 *      produces a message that says zero four times, which no one needs and
 *      everyone pays for.
 *   3. Daily is off unless asked for. One message per shop per day is 365 a
 *      year each; weekly is 52 and tells an owner most of what daily would.
 *   4. One part. The message is written to fit 160 characters, because 161
 *      costs exactly twice as much as 159.
 *
 * Every send is recorded, including the skips, so the spend is accountable and
 * a quiet day is distinguishable from a failure.
 */

const PERIODS: Period[] = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'];

/** How often the sweep runs. Hourly, because send times are per-shop hours. */
const TICK_MS = 60 * 60_000;

/**
 * Whether this period is due for this shop at this moment.
 *
 * All of them fire at the shop's configured hour; they differ in which day.
 * Monthly waits for the first of the month, quarterly for the first of a
 * quarter, yearly for the first of January, so each reports a period that has
 * actually finished.
 */
function isDue(period: Period, now: Date, zone: string, sendHour: number): boolean {
  if (localHour(zone, now) !== sendHour) return false;

  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  });
  const parts = f.formatToParts(now);
  const num = (t: string) => Number(parts.find(p => p.type === t)!.value);
  const weekday = parts.find(p => p.type === 'weekday')!.value;
  const day = num('day'), month = num('month');

  switch (period) {
    case 'daily':     return true;
    case 'weekly':    return weekday === 'Mon';
    case 'monthly':   return day === 1;
    case 'quarterly': return day === 1 && [1, 4, 7, 10].includes(month);
    case 'yearly':    return day === 1 && month === 1;
  }
}

/** Send one shop's report for one period, if it is due and worth sending. */
async function sendOne(
  shop: { id: string; tradingName: string; timezone: string; phone: string | null },
  period: Period,
  prefPhone: string | null,
  now: Date,
): Promise<void> {
  const { from, to, key } = periodRange(period, now, shop.timezone);

  // The insert is the claim. Several instances run this sweep, and without it
  // a shop could be reported to twice for the same period.
  try {
    await prisma.reportDelivery.create({
      data: { shopId: shop.id, period, periodKey: key, channel: 'pending' },
    });
  } catch {
    return;   // already sent, or another instance got there first
  }

  const metrics = await shopMetrics(shop.id, from, to);

  const record = (channel: string, parts: number) =>
    prisma.reportDelivery.updateMany({
      where: { shopId: shop.id, period, periodKey: key },
      data:  { channel, parts },
    });

  // A period with no sales and no spending is not news. Recorded as a
  // deliberate skip rather than dropped, so "why did I get no report" has an
  // answer.
  if (metrics.quiet) {
    await record('none', 0);
    return;
  }

  const label = periodLabel(period, to, shop.timezone);
  const body  = composeReport(shop.tradingName, period, label, metrics);

  // Push is free and reaches the same person, so it is tried first and SMS is
  // only the fallback. The device check comes before the send, not after:
  // pushToShop resolves happily when a shop has no devices at all, so asking
  // afterwards whether anyone could have received it is the wrong order.
  if (webPushReady && await hasPushDevice(shop.id)) {
    try {
      await pushToShop(shop.id, {
        // The title carries the brand and the window; the body is the same
        // text the SMS would have carried, minus its heading, which the title
        // already says.
        title: `MauzoHalisi ${label} — ${shop.tradingName}`,
        body: body.split('\n').slice(2).join('\n'),
        url: '/reports',
        tag: `report-${period}`,
      });
      await record('push', 0);
      return;
    } catch (err) {
      // Falls through to SMS rather than losing the report.
      logger.warn(`Report push failed for shop ${shop.id}, falling back to SMS: ${(err as Error).message}`);
    }
  }

  const to_ = prefPhone || shop.phone;
  if (!to_ || !smsReady) {
    await record('none', 0);
    return;
  }

  const ok = await sendSms(to_, body);
  await record(ok ? 'sms' : 'failed', ok ? smsParts(body) : 0);
}

/** Whether anyone would actually have received that push. */
async function hasPushDevice(shopId: string): Promise<boolean> {
  const n = await prisma.pushSubscription.count({ where: { shopId } });
  return n > 0;
}

/** One pass over every shop that wants a report right now. */
export async function runReportSweep(now = new Date()): Promise<void> {
  // Only shops belonging to an account in good standing. Reporting business
  // figures to a lapsed subscription is both a service they are not paying for
  // and an SMS charge against us.
  const shops = await prisma.shop.findMany({
    where: {
      isActive: true,
      ownerAccount: { isActive: true, subscriptionActive: true, suspendedAt: null },
    },
    select: {
      id: true, tradingName: true, timezone: true, phone: true,
      reportPreference: true,
      ownerAccount: { select: { phone: true } },
    },
  });

  for (const shop of shops) {
    const pref = shop.reportPreference;
    if (pref && !pref.enabled) continue;

    const sendHour = pref?.sendHour ?? 20;
    const wants: Record<Period, boolean> = {
      daily:     pref?.daily     ?? false,   // opt-in: the expensive one
      weekly:    pref?.weekly    ?? true,
      monthly:   pref?.monthly   ?? true,
      quarterly: pref?.quarterly ?? false,
      yearly:    pref?.yearly    ?? false,
    };

    for (const period of PERIODS) {
      if (!wants[period]) continue;
      if (!isDue(period, now, shop.timezone, sendHour)) continue;
      try {
        await sendOne(
          { id: shop.id, tradingName: shop.tradingName, timezone: shop.timezone,
            phone: shop.phone ?? shop.ownerAccount?.phone ?? null },
          period,
          pref?.phone ?? null,
          now,
        );
      } catch (err) {
        logger.error(`Report ${period} failed for shop ${shop.id}: ${(err as Error).message}`);
      }
    }
  }
}

export function startReportScheduler(): void {
  const tick = () => {
    runReportSweep().catch(err => logger.error(`Report sweep failed: ${err.message}`));
  };
  // Offset from the notice scheduler so the two do not both wake on boot.
  setTimeout(tick, 90_000).unref();
  setInterval(tick, TICK_MS).unref();
  logger.info('Business report scheduler started');
}
