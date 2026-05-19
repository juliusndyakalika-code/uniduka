import { Response } from 'express';
import { AuthRequest } from '../../types';
import { prisma } from '../../core/prisma';
import * as R from '../../utils/response';

const shop = (req: AuthRequest) => req.user!.shopId!;

export async function getProgram(req: AuthRequest, res: Response) {
  const p = await prisma.loyaltyProgram.findUnique({ where: { shopId: shop(req) }, include: { tiers: { orderBy: { minPoints: 'asc' } } } });
  return R.ok(res, p);
}

export async function upsertProgram(req: AuthRequest, res: Response) {
  const { name, pointsPerUnit, redeemRate, sharedAcrossBranches, tiers } = req.body;
  const program = await prisma.loyaltyProgram.upsert({
    where: { shopId: shop(req) },
    create: { shopId: shop(req), name: name || 'Loyalty', pointsPerUnit: pointsPerUnit || 1, redeemRate: redeemRate || 100, sharedAcrossBranches: sharedAcrossBranches || false },
    update: { name, pointsPerUnit, redeemRate, sharedAcrossBranches },
    include: { tiers: true },
  });
  if (tiers) {
    await prisma.loyaltyTier.deleteMany({ where: { programId: program.id } });
    await prisma.loyaltyTier.createMany({ data: tiers.map((t: { name: string; minPoints: number; discountPct?: number; bonusMultiplier?: number; perks?: string[] }) => ({ ...t, programId: program.id })) });
  }
  return R.ok(res, program);
}

export async function awardPoints(req: AuthRequest, res: Response) {
  const { customerId, amount } = req.body;
  const program = await prisma.loyaltyProgram.findUnique({ where: { shopId: shop(req) } });
  if (!program) return R.badRequest(res, 'No loyalty program configured');
  const points = amount * program.pointsPerUnit;
  const customer = await prisma.customer.update({ where: { id: customerId }, data: { loyaltyPoints: { increment: points } } });
  return R.ok(res, { pointsAwarded: points, totalPoints: customer.loyaltyPoints });
}

export async function redeemPoints(req: AuthRequest, res: Response) {
  const { customerId, points } = req.body;
  const program = await prisma.loyaltyProgram.findUnique({ where: { shopId: shop(req) } });
  if (!program) return R.badRequest(res, 'No loyalty program configured');
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer || customer.loyaltyPoints < points) return R.badRequest(res, 'Insufficient points');
  const discountValue = points / program.redeemRate;
  await prisma.customer.update({ where: { id: customerId }, data: { loyaltyPoints: { decrement: points } } });
  return R.ok(res, { discountValue, pointsUsed: points });
}

export async function getLoyaltyStats(req: AuthRequest, res: Response) {
  const stats = await prisma.customer.aggregate({ where: { shopId: shop(req) }, _sum: { loyaltyPoints: true }, _avg: { loyaltyPoints: true }, _count: { id: true } });
  return R.ok(res, stats);
}
