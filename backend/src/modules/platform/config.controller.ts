import { Response } from 'express';
import { prisma } from '../../core/prisma';
import { AuthRequest } from '../../types';
import * as R from '../../utils/response';
import { logger } from '../../utils/logger';
import { listPlans, invalidatePlans, PLAN_LIMIT_DEFAULTS, type PlanKey } from '../../core/plans';
import {
  listForAdmin, invalidateTemplates, TEMPLATES, LANGUAGES, render,
} from '../../core/templates';

/**
 * Platform configuration: what the tiers cost and what customers are told.
 *
 * Both used to be constants requiring a deploy to change. Everything here is
 * restricted to PLATFORM_ADMIN by the router, and every write invalidates the
 * relevant cache so an edit is visible immediately on this instance and within
 * the cache window on the others.
 */

// ─── PLANS ───────────────────────────────────────────────────────────────────

export async function getPlanConfigs(_req: AuthRequest, res: Response) {
  return R.ok(res, await listPlans());
}

/** Keys the code knows about. Anything else is refused rather than stored. */
const KNOWN_PLANS = Object.keys(PLAN_LIMIT_DEFAULTS) as PlanKey[];

export async function updatePlanConfig(req: AuthRequest, res: Response) {
  const key = String(req.params.key ?? '').toUpperCase() as PlanKey;
  if (!KNOWN_PLANS.includes(key)) return R.badRequest(res, 'Unknown plan');

  const { label, monthlyPrice, shops, branches, staff, registers, support, sortOrder } = req.body ?? {};

  // A limit is a count, so a negative or fractional one is a typo rather than
  // an intention, and a zero would silently stop the plan being usable at all.
  const counts = { shops, branches, staff, registers };
  for (const [name, value] of Object.entries(counts)) {
    if (value === undefined) continue;
    if (!Number.isInteger(value) || value < 1) {
      return R.badRequest(res, `${name} must be a whole number of at least 1`);
    }
  }

  // Null is meaningful: it is what makes a tier priced on application rather
  // than buyable, so it has to survive rather than being coerced to zero.
  let price: number | null | undefined;
  if (monthlyPrice !== undefined) {
    if (monthlyPrice === null || monthlyPrice === '') price = null;
    else if (!Number.isInteger(monthlyPrice) || monthlyPrice < 0) {
      return R.badRequest(res, 'Price must be a whole number of shillings, or empty for "on application"');
    } else price = monthlyPrice;
  }

  const existing = (await listPlans()).find(p => p.key === key)!;

  const row = await prisma.planConfig.upsert({
    where:  { key },
    create: {
      key,
      label:        label        ?? existing.label,
      monthlyPrice: price        !== undefined ? price : existing.monthlyPrice,
      shops:        shops        ?? existing.limits.shops,
      branches:     branches     ?? existing.limits.branches,
      staff:        staff        ?? existing.limits.staff,
      registers:    registers    ?? existing.limits.registers,
      support:      support      ?? existing.support,
      sortOrder:    sortOrder    ?? existing.sortOrder,
      updatedBy:    req.user!.sub,
    },
    update: {
      ...(label !== undefined        && { label }),
      ...(price !== undefined        && { monthlyPrice: price }),
      ...(shops !== undefined        && { shops }),
      ...(branches !== undefined     && { branches }),
      ...(staff !== undefined        && { staff }),
      ...(registers !== undefined    && { registers }),
      ...(support !== undefined      && { support }),
      ...(sortOrder !== undefined    && { sortOrder }),
      updatedBy: req.user!.sub,
    },
  });

  invalidatePlans();
  logger.info(`Plan ${key} updated by ${req.user!.sub}: price ${row.monthlyPrice}, shops ${row.shops}`);
  return R.ok(res, (await listPlans()).find(p => p.key === key));
}

// ─── NOTIFICATION TEMPLATES ──────────────────────────────────────────────────

export async function getTemplates(_req: AuthRequest, res: Response) {
  return R.ok(res, await listForAdmin());
}

/** One SMS part. Longer messages still send, they simply cost more. */
const SMS_PART = 160;

export async function updateTemplate(req: AuthRequest, res: Response) {
  const { key, channel, language, subject, body, isActive } = req.body ?? {};

  const def = TEMPLATES.find(t => t.key === key && t.channel === channel);
  if (!def) return R.badRequest(res, 'Unknown template');
  if (!LANGUAGES.includes(language)) return R.badRequest(res, 'Unsupported language');
  if (typeof body !== 'string' || !body.trim()) {
    return R.badRequest(res, 'The message cannot be empty. Reset it to the default instead.');
  }

  // Refuse a placeholder that will never be filled. It would reach the
  // customer as literal {{braces}}, which is how a template edit becomes a
  // message nobody can read.
  const used = [...body.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map(m => m[1]);
  const unknown = [...new Set(used)].filter(v => !def.variables.includes(v));
  if (unknown.length) {
    return R.badRequest(res,
      `Unknown placeholder${unknown.length > 1 ? 's' : ''}: ${unknown.map(u => `{{${u}}}`).join(', ')}. ` +
      `Available: ${def.variables.map(v => `{{${v}}}`).join(', ')}`);
  }

  const row = await prisma.notificationTemplate.upsert({
    where:  { key_channel_language: { key, channel, language } },
    create: { key, channel, language, subject: subject ?? null, body, isActive: isActive ?? true, updatedBy: req.user!.sub },
    update: {
      body,
      subject: subject ?? null,
      ...(isActive !== undefined && { isActive }),
      updatedBy: req.user!.sub,
    },
  });

  invalidateTemplates();
  logger.info(`Template ${key}/${channel}/${language} updated by ${req.user!.sub}`);

  return R.ok(res, {
    ...row,
    // So the editor can show the cost of what was just saved.
    parts: channel === 'SMS' ? Math.max(1, Math.ceil(body.length / SMS_PART)) : null,
  });
}

/** Drop the override and go back to the wording that ships with the code. */
export async function resetTemplate(req: AuthRequest, res: Response) {
  const { key, channel, language } = req.body ?? {};
  await prisma.notificationTemplate.deleteMany({ where: { key, channel, language } });
  invalidateTemplates();
  logger.info(`Template ${key}/${channel}/${language} reset by ${req.user!.sub}`);
  return R.ok(res, await listForAdmin());
}

/**
 * Render a template against sample values.
 *
 * Wording is hard to judge as a template full of braces, and the SMS cost only
 * becomes real once the placeholders are filled: a number that fits in one
 * part with "GROWTH" may not with a longer plan name.
 */
export async function previewTemplate(req: AuthRequest, res: Response) {
  const { channel, body, subject } = req.body ?? {};
  if (typeof body !== 'string') return R.badRequest(res, 'Nothing to preview');

  const sample: Record<string, string | number> = {
    amount: 'TSh 20,000', plan: 'BUSINESS', period: '3 months',
    until: '29 Dec 2026', date: '29 Dec 2026', days: 7,
    code: '482913', name: 'Asha',
  };

  const rendered = render(body, sample);
  return R.ok(res, {
    subject: subject ? render(subject, sample) : null,
    body:    rendered,
    length:  rendered.length,
    parts:   channel === 'SMS' ? Math.max(1, Math.ceil(rendered.length / SMS_PART)) : null,
  });
}
