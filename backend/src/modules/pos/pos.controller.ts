import { Response } from 'express';
import { AuthRequest } from '../../types';
import { prisma } from '../../core/prisma';
import { io } from '../../app';
import * as R from '../../utils/response';

const shop = (req: AuthRequest) => req.user!.shopId!;

function receiptNo() { return `RCP-${Date.now()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`; }

export async function createTransaction(req: AuthRequest, res: Response) {
  const { items, payments, customerId, registerId, tableNo, coverCount, rxRef, tabId, note, discountAmount = 0, customerTin } = req.body;

  if (!items?.length || !payments?.length) return R.badRequest(res, 'items and payments are required');

  // Calculate totals
  let subtotal = 0;
  const txItems = [];
  for (const item of items) {
    const product = await prisma.product.findFirst({ where: { id: item.productId, shopId: shop(req) }, include: { taxRule: true } });
    if (!product) return R.badRequest(res, `Product ${item.productId} not found`);
    const lineTotal = item.unitPrice * item.quantity * (1 - (item.discountPct || 0) / 100);
    const taxAmt = product.taxRule ? lineTotal * (product.taxRule.rate / 100) : 0;
    subtotal += lineTotal;
    txItems.push({ productId: item.productId, name: product.name, quantity: item.quantity, unitLabel: item.unitLabel || 'ea', unitPrice: item.unitPrice, discountPct: item.discountPct || 0, taxAmount: taxAmt, lineTotal, modifiers: item.modifiers, notes: item.notes });
  }
  const taxAmount = txItems.reduce((s, i) => s + i.taxAmount, 0);
  const total = subtotal - discountAmount + taxAmount;

  const tx = await prisma.transaction.create({
    data: {
      shopId: shop(req), cashierId: req.user!.sub, customerId, registerId, tableNo, coverCount,
      rxRef, tabId, note, customerTin: customerTin || undefined, subtotal, discountAmount, taxAmount, total,
      receiptNo: receiptNo(), status: 'COMPLETED', type: 'SALE',
      items: { create: txItems },
      payments: { create: payments.map((p: { method: string; amount: number; reference?: string }) => ({ method: p.method, amount: p.amount, reference: p.reference })) },
    },
    include: { items: true, payments: true, customer: true },
  });

  // Deduct stock
  for (const item of txItems) {
    await prisma.stockMovement.create({ data: { shopId: shop(req), productId: item.productId, type: 'SALE', quantity: -item.quantity, reference: tx.id } });
    await prisma.inventoryItem.updateMany({ where: { shopId: shop(req), productId: item.productId }, data: { quantity: { decrement: item.quantity } } });
  }

  // Update customer spend
  if (customerId) {
    await prisma.customer.update({ where: { id: customerId }, data: { totalSpend: { increment: total }, visitCount: { increment: 1 }, lastVisitAt: new Date() } });
  }

  // Emit to KDS if restaurant/cafe
  io.to(`shop:${shop(req)}`).emit('new_order', { txId: tx.id, tableNo, items: txItems });

  return R.created(res, tx);
}

export async function listTransactions(req: AuthRequest, res: Response) {
  const { from, to, status, page = '1', limit = '50' } = req.query as Record<string, string>;
  const skip = (Number(page) - 1) * Number(limit);
  const transactions = await prisma.transaction.findMany({
    where: {
      shopId: shop(req),
      ...(status && { status: status as never }),
      ...(from && { createdAt: { gte: new Date(from) } }),
      ...(to && { createdAt: { lte: new Date(to) } }),
    },
    include: { items: true, payments: true, customer: { select: { fullName: true } } },
    orderBy: { createdAt: 'desc' },
    skip, take: Number(limit),
  });
  return R.ok(res, transactions);
}

export async function getTransaction(req: AuthRequest, res: Response) {
  const tx = await prisma.transaction.findFirst({
    where: { id: req.params.id, shopId: shop(req) },
    include: { items: { include: { product: { select: { name: true } } } }, payments: true, customer: true },
  });
  if (!tx) return R.notFound(res);
  return R.ok(res, tx);
}

export async function voidTransaction(req: AuthRequest, res: Response) {
  const { reason } = req.body;
  const tx = await prisma.transaction.findFirst({ where: { id: req.params.id, shopId: shop(req), status: 'COMPLETED' }, include: { items: true } });
  if (!tx) return R.notFound(res, 'Transaction not found or already voided');
  await prisma.transaction.update({ where: { id: tx.id }, data: { status: 'VOIDED', note: reason } });
  for (const item of tx.items) {
    await prisma.stockMovement.create({ data: { shopId: shop(req), productId: item.productId, type: 'RETURN', quantity: item.quantity, reference: tx.id, note: 'Void' } });
  }
  return R.ok(res, { message: 'Transaction voided' });
}

export async function refundTransaction(req: AuthRequest, res: Response) {
  const tx = await prisma.transaction.findFirst({ where: { id: req.params.id, shopId: shop(req) }, include: { items: true, payments: true } });
  if (!tx) return R.notFound(res);
  const refund = await prisma.transaction.create({
    data: {
      shopId: shop(req), cashierId: req.user!.sub, type: 'RETURN', status: 'COMPLETED',
      subtotal: -tx.subtotal, taxAmount: -tx.taxAmount, total: -tx.total, discountAmount: 0,
      receiptNo: receiptNo(), note: `Refund of ${tx.receiptNo}`,
      items: { create: tx.items.map(i => ({
        productId: i.productId, name: i.name, quantity: -i.quantity,
        unitLabel: i.unitLabel, unitPrice: i.unitPrice, discountPct: i.discountPct,
        taxAmount: -i.taxAmount, lineTotal: -i.lineTotal,
        modifiers: i.modifiers ?? undefined, notes: i.notes,
      })) },
      payments: { create: tx.payments.map(p => ({ method: p.method, amount: -p.amount, reference: `REFUND-${p.reference || tx.id}` })) },
    },
  });
  await prisma.transaction.update({ where: { id: tx.id }, data: { status: 'REFUNDED' } });
  return R.created(res, refund);
}

export async function listRegisters(req: AuthRequest, res: Response) {
  return R.ok(res, await prisma.register.findMany({ where: { shopId: shop(req) } }));
}
export async function openRegister(req: AuthRequest, res: Response) {
  const { openingFloat } = req.body;
  await prisma.register.update({ where: { id: req.params.id }, data: { openedAt: new Date(), openingFloat: openingFloat || 0 } });
  return R.ok(res, { message: 'Register opened' });
}
export async function closeRegister(req: AuthRequest, res: Response) {
  const { closingFloat } = req.body;
  await prisma.register.update({ where: { id: req.params.id }, data: { closedAt: new Date(), closingFloat: closingFloat || 0 } });
  return R.ok(res, { message: 'Register closed' });
}

// ── Bar Tabs ──────────────────────────────────────────────────────────────────
export async function getBarTabs(req: AuthRequest, res: Response) {
  return R.ok(res, await prisma.barTab.findMany({ where: { shopId: shop(req), isOpen: true } }));
}
export async function openTab(req: AuthRequest, res: Response) {
  return R.created(res, await prisma.barTab.create({ data: { shopId: shop(req), name: req.body.name || 'Tab' } }));
}
export async function addToTab(req: AuthRequest, res: Response) {
  const { amount } = req.body;
  await prisma.barTab.update({ where: { id: req.params.id }, data: { totalAmount: { increment: amount } } });
  return R.ok(res, { message: 'Added to tab' });
}
export async function closeTab(req: AuthRequest, res: Response) {
  await prisma.barTab.update({ where: { id: req.params.id }, data: { isOpen: false, closedAt: new Date() } });
  return R.ok(res, { message: 'Tab closed' });
}
