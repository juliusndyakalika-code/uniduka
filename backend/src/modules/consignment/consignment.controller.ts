import { Response } from 'express';
import { AuthRequest } from '../../types';
import { prisma } from '../../core/prisma';
import * as R from '../../utils/response';

const shop = (req: AuthRequest) => req.user!.shopId!;

// ── Partners ─────────────────────────────────────────────────────────────────

export async function listPartners(req: AuthRequest, res: Response) {
  const partners = await prisma.consignmentPartner.findMany({
    where: { shopId: shop(req), isActive: true },
    orderBy: { name: 'asc' },
  });
  return R.ok(res, partners);
}

export async function createPartner(req: AuthRequest, res: Response) {
  const partner = await prisma.consignmentPartner.create({
    data: { ...req.body, shopId: shop(req) },
  });
  return R.created(res, partner);
}

export async function updatePartner(req: AuthRequest, res: Response) {
  const r = await prisma.consignmentPartner.updateMany({
    where: { id: req.params.id, shopId: shop(req) },
    data: req.body,
  });
  if (!r.count) return R.notFound(res);
  return R.ok(res, { message: 'Updated' });
}

export async function deletePartner(req: AuthRequest, res: Response) {
  await prisma.consignmentPartner.updateMany({
    where: { id: req.params.id, shopId: shop(req) },
    data: { isActive: false },
  });
  return R.noContent(res);
}

// ── Sales ─────────────────────────────────────────────────────────────────────

export async function listSales(req: AuthRequest, res: Response) {
  const { partnerId } = req.query as Record<string, string>;
  const sales = await prisma.consignmentSale.findMany({
    where: {
      shopId: shop(req),
      ...(partnerId && { partnerId }),
    },
    include: {
      partner: { select: { id: true, name: true } },
      soldBy: { select: { id: true, fullName: true } },
    },
    orderBy: { soldAt: 'desc' },
  });
  return R.ok(res, sales);
}

export async function createSale(req: AuthRequest, res: Response) {
  const { partnerId, productName, costPrice, sellingPrice, qty, notes, soldAt } = req.body;

  const partner = await prisma.consignmentPartner.findFirst({
    where: { id: partnerId, shopId: shop(req), isActive: true },
  });
  if (!partner) return R.notFound(res, 'Partner not found');

  const cost = Number(costPrice);
  const sell = Number(sellingPrice);
  const quantity = Number(qty);
  const profit = (sell - cost) * quantity;

  const sale = await prisma.consignmentSale.create({
    data: {
      shopId: shop(req),
      partnerId,
      productName,
      costPrice: cost,
      sellingPrice: sell,
      qty: quantity,
      profit,
      notes,
      soldById: req.user!.sub,
      ...(soldAt && { soldAt: new Date(soldAt) }),
    },
    include: {
      partner: { select: { id: true, name: true } },
      soldBy: { select: { id: true, fullName: true } },
    },
  });
  return R.created(res, sale);
}

export async function deleteSale(req: AuthRequest, res: Response) {
  const r = await prisma.consignmentSale.deleteMany({
    where: { id: req.params.id, shopId: shop(req) },
  });
  if (!r.count) return R.notFound(res);
  return R.noContent(res);
}

// ── Profit report (by seller) ───────────────────────────────────────────────

export async function getProfitReport(req: AuthRequest, res: Response) {
  const sales = await prisma.consignmentSale.findMany({
    where: { shopId: shop(req) },
    include: { soldBy: { select: { id: true, fullName: true } } },
  });

  const bySeller: Record<string, {
    sellerId: string; sellerName: string;
    salesCount: number; totalQty: number; totalRevenue: number; totalProfit: number;
  }> = {};

  for (const s of sales) {
    const id = s.soldBy.id;
    if (!bySeller[id]) {
      bySeller[id] = { sellerId: id, sellerName: s.soldBy.fullName, salesCount: 0, totalQty: 0, totalRevenue: 0, totalProfit: 0 };
    }
    bySeller[id].salesCount += 1;
    bySeller[id].totalQty += s.qty;
    bySeller[id].totalRevenue += s.sellingPrice * s.qty;
    bySeller[id].totalProfit += s.profit;
  }

  return R.ok(res, Object.values(bySeller).sort((a, b) => b.totalProfit - a.totalProfit));
}
