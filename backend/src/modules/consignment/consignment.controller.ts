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
  const { partnerId, from, to } = req.query as Record<string, string>;
  const soldAtFilter: { gte?: Date; lte?: Date } = {};
  if (from) soldAtFilter.gte = new Date(from);
  if (to)   soldAtFilter.lte = new Date(new Date(to).setHours(23, 59, 59, 999));

  const sales = await prisma.consignmentSale.findMany({
    where: {
      shopId: shop(req),
      ...(partnerId && { partnerId }),
      ...(Object.keys(soldAtFilter).length && { soldAt: soldAtFilter }),
    },
    include: {
      partner: { select: { id: true, name: true } },
      soldBy: { select: { id: true, fullName: true } },
      customer: { select: { id: true, fullName: true, phone: true } },
    },
    orderBy: { soldAt: 'desc' },
  });
  return R.ok(res, sales);
}

export async function createSale(req: AuthRequest, res: Response) {
  const { partnerId, productName, costPrice, sellingPrice, qty, notes, soldAt, paymentMethod, customerId } = req.body;

  const partner = await prisma.consignmentPartner.findFirst({
    where: { id: partnerId, shopId: shop(req), isActive: true },
  });
  if (!partner) return R.notFound(res, 'Partner not found');

  const cost = Number(costPrice);
  const sell = Number(sellingPrice);
  const quantity = Number(qty);
  const profit = (sell - cost) * quantity;
  const revenue = sell * quantity;

  const VALID_METHODS = ['CASH', 'CARD', 'MOBILE_MONEY', 'BANK_TRANSFER', 'DEBIT'];
  const method = VALID_METHODS.includes(paymentMethod) ? paymentMethod : 'CASH';
  // A DEBIT (credit) sale starts unpaid; every other method is settled in full at the sale.
  const amountPaid = method === 'DEBIT' ? 0 : revenue;

  // A customer (debtor) is captured only for credit sales, and is required there.
  let linkedCustomerId: string | null = null;
  if (method === 'DEBIT') {
    if (!customerId) return R.badRequest(res, 'A customer is required for a credit (debit) sale');
    const customer = await prisma.customer.findFirst({ where: { id: customerId, shopId: shop(req) } });
    if (!customer) return R.badRequest(res, 'Customer not found');
    linkedCustomerId = customer.id;
  }

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
      paymentMethod: method as never,
      amountPaid,
      customerId: linkedCustomerId,
      soldById: req.user!.sub,
      ...(soldAt && { soldAt: new Date(soldAt) }),
    },
    include: {
      partner: { select: { id: true, name: true } },
      soldBy: { select: { id: true, fullName: true } },
      customer: { select: { id: true, fullName: true, phone: true } },
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

// Record a payment against a credit (debit) consignment sale.
export async function settleSale(req: AuthRequest, res: Response) {
  const amount = Number(req.body.amount);
  if (!amount || amount <= 0) return R.badRequest(res, 'A positive amount is required');

  const sale = await prisma.consignmentSale.findFirst({
    where: { id: req.params.id, shopId: shop(req) },
  });
  if (!sale) return R.notFound(res);

  const revenue = sale.sellingPrice * sale.qty;
  const outstanding = Math.max(0, revenue - sale.amountPaid);
  if (outstanding <= 0) return R.badRequest(res, 'This sale is already fully paid');

  const pay = Math.min(amount, outstanding);
  const updated = await prisma.consignmentSale.update({
    where: { id: sale.id },
    data: { amountPaid: sale.amountPaid + pay },
    include: {
      partner: { select: { id: true, name: true } },
      soldBy: { select: { id: true, fullName: true } },
      customer: { select: { id: true, fullName: true, phone: true } },
    },
  });
  return R.ok(res, { sale: updated, paid: pay, remaining: Math.max(0, revenue - updated.amountPaid) });
}

// ── Profit report (by seller & by payment method) ───────────────────────────

const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'Cash', CARD: 'Card', MOBILE_MONEY: 'Mobile Money', BANK_TRANSFER: 'Bank Transfer',
  VOUCHER: 'Voucher', STORE_CREDIT: 'Store Credit', INSURANCE: 'Insurance',
  ACCOUNT_CREDIT: 'Account Credit', DEBIT: 'Debit',
};

export async function getProfitReport(req: AuthRequest, res: Response) {
  const { from, to } = req.query as Record<string, string>;
  const soldAtFilter: { gte?: Date; lte?: Date } = {};
  if (from) soldAtFilter.gte = new Date(from);
  if (to)   soldAtFilter.lte = new Date(new Date(to).setHours(23, 59, 59, 999));

  const sales = await prisma.consignmentSale.findMany({
    where: {
      shopId: shop(req),
      ...(Object.keys(soldAtFilter).length && { soldAt: soldAtFilter }),
    },
    include: { soldBy: { select: { id: true, fullName: true } } },
  });

  const bySeller: Record<string, {
    sellerId: string; sellerName: string;
    salesCount: number; totalQty: number; totalRevenue: number; totalProfit: number;
  }> = {};

  const byPaymentMethod: Record<string, {
    method: string; label: string;
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

    const method = s.paymentMethod ?? 'CASH';
    if (!byPaymentMethod[method]) {
      byPaymentMethod[method] = { method, label: PAYMENT_LABELS[method] ?? method, salesCount: 0, totalQty: 0, totalRevenue: 0, totalProfit: 0 };
    }
    byPaymentMethod[method].salesCount += 1;
    byPaymentMethod[method].totalQty += s.qty;
    byPaymentMethod[method].totalRevenue += s.sellingPrice * s.qty;
    byPaymentMethod[method].totalProfit += s.profit;
  }

  return R.ok(res, {
    bySeller: Object.values(bySeller).sort((a, b) => b.totalProfit - a.totalProfit),
    byPaymentMethod: Object.values(byPaymentMethod).sort((a, b) => b.totalRevenue - a.totalRevenue),
  });
}
