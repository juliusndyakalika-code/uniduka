import { Response } from 'express';
import { AuthRequest } from '../../types';
import { prisma } from '../../core/prisma';
import * as R from '../../utils/response';

export async function listBranches(req: AuthRequest, res: Response) {
  const shops = await prisma.shop.findMany({
    where: { ownerAccountId: req.user!.accountId, wizardCompleted: true },
    select: {
      id: true, tradingName: true, city: true, country: true, businessType: true,
      branchMode: true, isActive: true, parentShopId: true, wizardCompleted: true,
      childShops: { select: { id: true, tradingName: true, city: true, isActive: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
  return R.ok(res, shops);
}

export async function createBranch(req: AuthRequest, res: Response) {
  const { tradingName, city, country, branchMode } = req.body;
  const parentShopId = req.body.parentShopId || req.user!.shopId;
  const parent = await prisma.shop.findFirst({ where: { id: parentShopId, ownerAccountId: req.user!.accountId, wizardCompleted: true } });
  if (!parent) return R.notFound(res, 'Parent shop not found or setup not complete');
  const branch = await prisma.shop.create({
    data: {
      ownerAccountId: req.user!.accountId,
      parentShopId, tradingName, city, country: country || parent.country,
      businessType: parent.businessType, inventoryModel: parent.inventoryModel,
      pricingMode: parent.pricingMode, taxMode: parent.taxMode,
      branchMode: branchMode || 'INDEPENDENT', currency: parent.currency, timezone: parent.timezone,
    },
  });
  return R.created(res, branch);
}

export async function updateBranchMode(req: AuthRequest, res: Response) {
  const { branchMode } = req.body;
  await prisma.shop.updateMany({ where: { id: req.params.id, ownerAccountId: req.user!.accountId }, data: { branchMode } });
  return R.ok(res, { message: 'Branch mode updated' });
}

export async function transferStock(req: AuthRequest, res: Response) {
  const { fromShopId, toShopId, productId, quantity, note } = req.body;
  await prisma.stockMovement.createMany({
    data: [
      { shopId: fromShopId, productId, type: 'TRANSFER_OUT', quantity: -quantity, note },
      { shopId: toShopId,   productId, type: 'TRANSFER_IN',  quantity:  quantity, note },
    ],
  });
  return R.ok(res, { message: 'Transfer recorded' });
}
