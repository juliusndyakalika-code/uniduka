import { Response } from 'express';
import { prisma } from '../../core/prisma';
import { AuthRequest } from '../../types';
import * as R from '../../utils/response';
import { shopMetrics, composeReport, periodRange, periodLabel, smsParts, type Period } from '../../core/reports';

/**
 * Which periodic reports a shop wants, and a preview of what one looks like.
 *
 * The preview exists because the cost is per message: an owner deciding
 * whether to switch daily on should see the actual text and be told plainly
 * that it is one SMS a day.
 */

const PERIODS: Period[] = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'];

function shopId(req: AuthRequest): string | null {
  return (req.headers['x-shop-id'] as string) || req.user?.shopId || null;
}

export async function getReportPrefs(req: AuthRequest, res: Response) {
  const id = shopId(req);
  if (!id) return R.forbidden(res, 'No active shop context');

  const pref = await prisma.reportPreference.findUnique({ where: { shopId: id } });

  // Defaults live in one place, and they are what an absent row means: weekly
  // and monthly on, daily off, because daily is the one that costs 365 sends a
  // year per shop.
  return R.ok(res, {
    daily:     pref?.daily     ?? false,
    weekly:    pref?.weekly    ?? true,
    monthly:   pref?.monthly   ?? true,
    quarterly: pref?.quarterly ?? false,
    yearly:    pref?.yearly    ?? false,
    sendHour:  pref?.sendHour  ?? 20,
    phone:     pref?.phone     ?? null,
    enabled:   pref?.enabled   ?? true,
  });
}

export async function updateReportPrefs(req: AuthRequest, res: Response) {
  const id = shopId(req);
  if (!id) return R.forbidden(res, 'No active shop context');

  const { daily, weekly, monthly, quarterly, yearly, sendHour, phone, enabled } = req.body ?? {};

  if (sendHour !== undefined && (!Number.isInteger(sendHour) || sendHour < 0 || sendHour > 23)) {
    return R.badRequest(res, 'Send hour must be between 0 and 23');
  }

  const data = {
    ...(daily     !== undefined && { daily:     Boolean(daily) }),
    ...(weekly    !== undefined && { weekly:    Boolean(weekly) }),
    ...(monthly   !== undefined && { monthly:   Boolean(monthly) }),
    ...(quarterly !== undefined && { quarterly: Boolean(quarterly) }),
    ...(yearly    !== undefined && { yearly:    Boolean(yearly) }),
    ...(sendHour  !== undefined && { sendHour }),
    ...(enabled   !== undefined && { enabled:   Boolean(enabled) }),
    ...(phone     !== undefined && { phone: phone || null }),
  };

  const pref = await prisma.reportPreference.upsert({
    where:  { shopId: id },
    create: { shopId: id, ...data },
    update: data,
  });
  return R.ok(res, pref);
}

/**
 * What the next report would say, using this shop's real figures.
 *
 * Rendered by the same functions the scheduler uses, so the preview is the
 * message rather than an impression of it, down to the billed part count.
 */
export async function previewReport(req: AuthRequest, res: Response) {
  const id = shopId(req);
  if (!id) return R.forbidden(res, 'No active shop context');

  const period = String(req.query.period ?? 'daily') as Period;
  if (!PERIODS.includes(period)) return R.badRequest(res, 'Unknown report period');

  const shop = await prisma.shop.findUnique({
    where: { id }, select: { tradingName: true, timezone: true },
  });
  if (!shop) return R.notFound(res, 'Shop not found');

  const { from, to } = periodRange(period, new Date(), shop.timezone);
  const metrics = await shopMetrics(id, from, to);
  const label   = periodLabel(period, to, shop.timezone);
  const body    = composeReport(shop.tradingName, period, label, metrics);

  return R.ok(res, {
    period,
    covers: { from, to },
    body,
    characters: body.length,
    parts: smsParts(body),
    // A quiet period is not sent at all, and the owner should know that before
    // wondering why nothing arrived.
    wouldSend: !metrics.quiet,
    metrics,
  });
}
