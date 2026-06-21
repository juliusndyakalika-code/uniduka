import { Response } from 'express';
import { AuthRequest } from '../../types';
import { prisma } from '../../core/prisma';
import * as R from '../../utils/response';

const shop = (req: AuthRequest) => req.user!.shopId!;
const uid  = (req: AuthRequest) => req.user!.sub;

/** Current user's open shift (if any) */
export async function getStatus(req: AuthRequest, res: Response) {
  const open = await prisma.timeClock.findFirst({
    where: { shopId: shop(req), userId: uid(req), clockOut: null },
    orderBy: { clockIn: 'desc' },
  });
  return R.ok(res, open ?? null);
}

/** Clock in */
export async function clockIn(req: AuthRequest, res: Response) {
  const existing = await prisma.timeClock.findFirst({
    where: { shopId: shop(req), userId: uid(req), clockOut: null },
  });
  if (existing) return R.badRequest(res, 'Already clocked in');
  const entry = await prisma.timeClock.create({
    data: { shopId: shop(req), userId: uid(req), clockIn: new Date(), note: req.body.note },
  });
  return R.created(res, entry);
}

/** Clock out */
export async function clockOut(req: AuthRequest, res: Response) {
  const open = await prisma.timeClock.findFirst({
    where: { shopId: shop(req), userId: uid(req), clockOut: null },
    orderBy: { clockIn: 'desc' },
  });
  if (!open) return R.badRequest(res, 'Not clocked in');
  const now = new Date();
  const totalMins = Math.round((now.getTime() - open.clockIn.getTime()) / 60000);
  const updated = await prisma.timeClock.update({
    where: { id: open.id },
    data: { clockOut: now, totalMins, note: req.body.note ?? open.note },
  });
  return R.ok(res, updated);
}

/** List shifts — owner sees all staff, others see own */
export async function listShifts(req: AuthRequest, res: Response) {
  const { userId, from, to } = req.query as Record<string, string>;
  const isOwner = req.user!.role === 'ACCOUNT_OWNER';
  const shifts = await prisma.timeClock.findMany({
    where: {
      shopId: shop(req),
      userId: isOwner ? (userId || undefined) : uid(req),
      ...(from && { clockIn: { gte: new Date(from) } }),
      ...(to   && { clockIn: { lte: new Date(to) } }),
    },
    include: { user: { select: { fullName: true, email: true } } },
    orderBy: { clockIn: 'desc' },
    take: 200,
  });
  return R.ok(res, shifts);
}

/** Delete shift (owner only) */
export async function deleteShift(req: AuthRequest, res: Response) {
  const shift = await prisma.timeClock.findFirst({ where: { id: req.params.id, shopId: shop(req) } });
  if (!shift) return R.notFound(res);
  await prisma.timeClock.delete({ where: { id: req.params.id } });
  return R.noContent(res);
}
