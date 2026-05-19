import { Response } from 'express';
import { AuthRequest } from '../../types';
import { prisma } from '../../core/prisma';
import * as R from '../../utils/response';

export async function listUnits(req: AuthRequest, res: Response) {
  const { shopId } = req.user!;
  if (!shopId) return R.badRequest(res, 'No active shop');
  const units = await prisma.unitProfile.findMany({ where: { shopId }, orderBy: { dimension: 'asc' } });
  return R.ok(res, units);
}

export async function createUnit(req: AuthRequest, res: Response) {
  const { shopId } = req.user!;
  if (!shopId) return R.badRequest(res, 'No active shop');
  const { name, abbreviation, dimension, conversionFactor, baseUnit, isDefault, showInPos, showOnPO } = req.body;
  const unit = await prisma.unitProfile.create({
    data: { shopId, name, abbreviation, dimension, conversionFactor: conversionFactor || 1, baseUnit, isDefault: isDefault || false, showInPos: showInPos !== false, showOnPO: showOnPO !== false, isCustom: true },
  });
  return R.created(res, unit);
}

export async function updateUnit(req: AuthRequest, res: Response) {
  const unit = await prisma.unitProfile.updateMany({
    where: { id: req.params.id, shopId: req.user!.shopId },
    data: req.body,
  });
  if (!unit.count) return R.notFound(res);
  return R.ok(res, { message: 'Unit updated' });
}

export async function deleteUnit(req: AuthRequest, res: Response) {
  await prisma.unitProfile.deleteMany({ where: { id: req.params.id, shopId: req.user!.shopId, isCustom: true } });
  return R.noContent(res);
}
