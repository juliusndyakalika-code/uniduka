import { Response } from 'express';
import { AuthRequest } from '../../types';
import { prisma } from '../../core/prisma';
import * as R from '../../utils/response';
import {
  retentionDays, sweepErrorLogs, RETENTION_KEY, RETENTION_CHOICES,
} from '../../core/errorLog';

/**
 * The admin portal's view of what is going wrong.
 *
 * Grouped errors, newest first, filterable by how recently they last
 * happened and by text. Everything here was masked on the way in, so the
 * page can show messages as they are.
 */

const RANGES: Record<string, number> = { '24h': 1, '7d': 7, '30d': 30 };

export async function listErrors(req: AuthRequest, res: Response) {
  const range = String(req.query.range ?? '7d');
  const q = String(req.query.q ?? '').trim();
  const days = RANGES[range];

  const where = {
    ...(days ? { lastAt: { gte: new Date(Date.now() - days * 86_400_000) } } : {}),
    ...(q ? { message: { contains: q, mode: 'insensitive' as const } } : {}),
  };

  const since24h = new Date(Date.now() - 86_400_000);
  const [items, total, last24h, retention] = await Promise.all([
    prisma.errorLog.findMany({ where, orderBy: { lastAt: 'desc' }, take: 200 }),
    prisma.errorLog.count({ where }),
    prisma.errorLog.aggregate({ where: { lastAt: { gte: since24h } }, _count: true, _sum: { count: true } }),
    retentionDays(),
  ]);

  return R.ok(res, {
    items,
    total,
    stats: { groups24h: last24h._count, occurrences24h: last24h._sum.count ?? 0 },
    retention: { days: retention, choices: RETENTION_CHOICES },
  });
}

/** Changing the window takes effect immediately rather than at the next sweep. */
export async function setRetention(req: AuthRequest, res: Response) {
  const days = Number(req.body?.days);
  if (!(RETENTION_CHOICES as readonly number[]).includes(days)) {
    return R.badRequest(res, `Retention must be one of ${RETENTION_CHOICES.join(', ')} days`);
  }
  await prisma.appSetting.upsert({
    where:  { key: RETENTION_KEY },
    create: { key: RETENTION_KEY, value: String(days), updatedBy: req.user!.sub },
    update: { value: String(days), updatedBy: req.user!.sub },
  });
  const swept = await sweepErrorLogs();
  return R.ok(res, { days, ...swept });
}

/** Clear one group once it has been dealt with. If it recurs, it comes back. */
export async function dismissError(req: AuthRequest, res: Response) {
  const { count } = await prisma.errorLog.deleteMany({ where: { id: req.params.id } });
  if (!count) return R.notFound(res, 'Already cleared');
  return R.ok(res, { dismissed: true });
}
