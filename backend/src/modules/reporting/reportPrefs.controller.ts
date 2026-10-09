import { Response } from 'express';
import { prisma } from '../../core/prisma';
import { AuthRequest } from '../../types';
import * as R from '../../utils/response';
import { shopMetrics, composeReport, periodRange, periodLabel, smsParts, type Period } from '../../core/reports';
import { sendSms, smsReady } from '../../core/sms';
import { prisma as db } from '../../core/prisma';
import { logger } from '../../utils/logger';

/**
 * Which periodic reports a shop wants, and a preview of what one looks like.
 *
 * The preview exists because the cost is per message: an owner deciding
 * whether to switch daily on should see the actual text and be told plainly
 * that it is one SMS a day.
 */

const PERIODS: Period[] = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'];

// The active shop comes from the token, as everywhere else in this module.
// Reading it from a header instead would let a caller name any shop they
// liked, which is the whole reason the rest of the codebase does not.
function shopId(req: AuthRequest): string | null {
  return req.user?.shopId ?? null;
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


/**
 * POST /reporting/schedule/test — send one report now, to prove the path works.
 *
 * Exists because the scheduled send is the worst possible place to discover
 * that a sender name is unapproved or a number is wrong: it happens once a day
 * at a fixed hour, to everyone, and silently. This makes the same journey on
 * demand, through the same composer and the same gateway.
 *
 * Deliberately SMS rather than push. The thing that needs proving is the
 * expensive, externally-dependent channel; push working tells you nothing
 * about whether Textify will accept your sender name.
 */
export async function sendTestReport(req: AuthRequest, res: Response) {
  const id = shopId(req);
  if (!id) return R.forbidden(res, 'No active shop context');
  if (!smsReady) return R.badRequest(res, 'SMS is not configured on this server');

  const period = String(req.body?.period ?? 'daily') as Period;
  if (!PERIODS.includes(period)) return R.badRequest(res, 'Unknown report period');

  const shop = await db.shop.findUnique({
    where:  { id },
    select: {
      tradingName: true, timezone: true, phone: true,
      reportPreference: { select: { phone: true } },
      ownerAccount: { select: { phone: true } },
    },
  });
  if (!shop) return R.notFound(res, 'Shop not found');

  const to = req.body?.phone || shop.reportPreference?.phone || shop.phone || shop.ownerAccount?.phone;
  if (!to) return R.badRequest(res, 'No phone number to send to. Add one above first.');

  // A test costs a real message, so it is capped. Five a day is enough to
  // check a number and a sender name without becoming a way to spend balance.
  const since = new Date(Date.now() - 24 * 60 * 60_000);
  const recent = await db.reportDelivery.count({
    where: { shopId: id, period: 'test', sentAt: { gte: since } },
  });
  if (recent >= 5) {
    return res.status(429).json({
      success: false,
      message: 'Five test reports have been sent today. Try again tomorrow.',
    });
  }

  const { from, to: periodEnd } = periodRange(period, new Date(), shop.timezone);
  const metrics = await shopMetrics(id, from, periodEnd);
  const label   = periodLabel(period, periodEnd, shop.timezone);
  // Sent even when the period is quiet: the point is proving delivery, and a
  // test that silently sends nothing teaches the opposite of what it should.
  const body    = composeReport(shop.tradingName, period, label, metrics);

  const ok = await sendSms(to, body);

  await db.reportDelivery.create({
    data: {
      shopId: id, period: 'test', periodKey: `${Date.now()}`,
      channel: ok ? 'sms' : 'failed', parts: ok ? smsParts(body) : 0,
    },
  }).catch(() => { /* the record is for accounting, not for the send */ });

  if (!ok) {
    logger.error(`Test report failed for shop ${id}`);
    return R.serverError(res, 'The gateway would not take the message. Check the sender name is approved and the account has balance.');
  }

  return R.ok(res, { sent: true, to: maskPhone(to), parts: smsParts(body), body });
}

/** +255764628075 → +255764•••075 */
function maskPhone(phone: string): string {
  return phone.length < 7 ? '•••' : `${phone.slice(0, phone.length - 6)}•••${phone.slice(-3)}`;
}
