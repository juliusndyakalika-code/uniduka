import { Response } from 'express';
import { AuthRequest } from '../../types';
import { prisma } from '../../core/prisma';
import { io } from '../../app';
import * as R from '../../utils/response';
import * as tz from '../../utils/tz';

const shop = (req: AuthRequest) => req.user!.shopId!;

function receiptNo() { return `RCP-${Date.now()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`; }

/** The shop's IANA timezone, used to resolve calendar-date filters. */
async function shopTimezone(shopId: string): Promise<string> {
  const s = await prisma.shop.findUnique({ where: { id: shopId }, select: { timezone: true } });
  return s?.timezone || tz.DEFAULT_TZ;
}

export async function createTransaction(req: AuthRequest, res: Response) {
  const { items, payments, customerId, customerName: rawCustomerName, registerId, tableNo, coverCount, rxRef, tabId, note, discountAmount = 0, customerTin } = req.body;

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

  // ── Payment validation (supports split tenders + partial/deposit on credit) ──
  // A sale may carry several tenders (e.g. cash + mobile money). A remaining
  // balance is booked as credit via a DEBIT marker line (amount 0); outstanding
  // is later derived as total − sum(non-DEBIT amounts), matching the debts flow.
  const EPS = 0.5; // TZS tolerance for float math
  const paidTenders = (payments as { method: string; amount: number }[]).filter(p => p.method !== 'DEBIT');
  const paidNonDebit = paidTenders.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const nonCashPaid  = paidTenders.filter(p => p.method !== 'CASH').reduce((s, p) => s + (Number(p.amount) || 0), 0);

  if (nonCashPaid > total + EPS) {
    return R.badRequest(res, 'Card / mobile payments exceed the sale total. Only cash may be over-tendered (for change).');
  }

  const isPartial = paidNonDebit < total - EPS;
  const paymentsToSave = [...(payments as { method: string; amount: number; reference?: string; providerName?: string }[])];
  if (isPartial) {
    if (!customerId) {
      return R.badRequest(res, 'A customer is required when a balance remains on credit.');
    }
    // Ensure a DEBIT marker so the outstanding balance surfaces on the debts page
    if (!paymentsToSave.some(p => p.method === 'DEBIT')) {
      paymentsToSave.push({ method: 'DEBIT', amount: 0 });
    }
  }

  const tx = await prisma.transaction.create({
    data: {
      shopId: shop(req), cashierId: req.user!.sub, customerId, registerId, tableNo, coverCount,
      rxRef, tabId, note,
      customerName: rawCustomerName?.trim() || undefined,
      customerTin:  customerTin || undefined,
      subtotal, discountAmount, taxAmount, total,
      receiptNo: receiptNo(), status: 'COMPLETED', type: 'SALE',
      items: { create: txItems },
      payments: { create: paymentsToSave.map((p: { method: string; amount: number; reference?: string; providerName?: string }) => ({ method: p.method as never, amount: p.amount, reference: p.reference, providerName: p.providerName })) },
    },
    include: { items: true, payments: true, customer: true },
  });

  // Deduct stock — FIFO across inventory rows so multi-row products
  // don't get decremented once per row (which caused negative stock).
  for (const item of txItems) {
    await prisma.stockMovement.create({ data: { shopId: shop(req), productId: item.productId, type: 'SALE', quantity: -item.quantity, reference: tx.id, userId: req.user!.sub } });
    let remaining = item.quantity;
    const rows = await prisma.inventoryItem.findMany({
      where: { shopId: shop(req), productId: item.productId },
      orderBy: { createdAt: 'asc' },
    });
    for (const row of rows) {
      if (remaining <= 0) break;
      const take = Math.min(row.quantity, remaining);
      await prisma.inventoryItem.update({ where: { id: row.id }, data: { quantity: { decrement: take } } });
      remaining -= take;
    }
    // Allow oversell: deduct any leftover from the first row (goes negative)
    if (remaining > 0 && rows.length > 0) {
      await prisma.inventoryItem.update({ where: { id: rows[0].id }, data: { quantity: { decrement: remaining } } });
    }
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
  const { from, to, status, cashierId, search, paymentMethod, page = '1', limit = '50' } = req.query as Record<string, string>;
  const skip = (Number(page) - 1) * Number(limit);
  // `from`/`to` are calendar dates as the user sees them, so resolve them in
  // the shop's timezone rather than UTC.
  const shopTz = await shopTimezone(shop(req));
  const fromDate = from ? tz.startOfDateString(from, shopTz) : undefined;
  const toDate   = to   ? tz.endOfDateString(to, shopTz)     : undefined;

  // Search matches receipt number, customer name, or the cashier who rang it up.
  const like = { contains: search, mode: 'insensitive' as never };
  const where = {
    shopId: shop(req),
    ...(status        && { status:    status as never }),
    ...(cashierId     && { cashierId }),
    ...((fromDate || toDate) && {
      createdAt: {
        ...(fromDate && { gte: fromDate }),
        ...(toDate   && { lte: toDate   }),
      },
    }),
    ...(search && {
      OR: [
        { receiptNo: like },
        { customerName: like },
        { customer: { fullName: like } },
        { cashier:  { fullName: like } },
      ],
    }),
    ...(paymentMethod && { payments: { some: { method: paymentMethod as never } } }),
  };

  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      include: {
        items: { include: { product: { select: { costPrice: true } } } },
        payments: true,
        customer: { select: { fullName: true } },
        cashier: { select: { fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip, take: Number(limit),
    }),
    prisma.transaction.count({ where }),
  ]);

  // Totals across the whole filtered set, not just the current page, so the
  // summary cards stay correct while paging.
  const totalsAgg = await prisma.transaction.aggregate({
    where: { ...where, status: 'COMPLETED' },
    _sum: { total: true },
    _count: { id: true },
  });

  const result = transactions.map(tx => ({
    ...tx,
    cashierName: tx.cashier?.fullName ?? null,
    items: tx.items.map(i => ({
      ...i,
      costPrice: i.product?.costPrice ?? 0,
      product: undefined,
    })),
    cashier: undefined,
  }));
  return R.ok(res, result, {
    total,
    page:  Number(page),
    limit: Number(limit),
    pages: Math.ceil(total / Number(limit)),
    sumCompleted:   totalsAgg._sum.total ?? 0,
    countCompleted: totalsAgg._count.id,
  });
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
  const tx = await prisma.transaction.findFirst({ where: { id: req.params.id, shopId: shop(req), status: 'COMPLETED' }, include: { items: true, payments: true } });
  if (!tx) return R.notFound(res, 'Transaction not found or already voided');
  // Only block void when the transaction is a credit/debt sale that has already
  // had partial cash/mobile payments recorded against it. A fully-paid cash or
  // mobile-money transaction must always be voidable.
  const isDebtSale = tx.payments.some(p => p.method === 'DEBIT');
  if (isDebtSale) {
    const amountSettled = tx.payments.filter(p => p.method !== 'DEBIT').reduce((s, p) => s + p.amount, 0);
    if (amountSettled > 0) return R.badRequest(res, 'Cannot void: this debt has partial payments recorded. Reverse those payments first.');
  }
  await prisma.transaction.update({ where: { id: tx.id }, data: { status: 'VOIDED', note: reason } });
  for (const item of tx.items) {
    // Log the stock movement
    await prisma.stockMovement.create({
      data: { shopId: shop(req), productId: item.productId, type: 'RETURN', quantity: item.quantity, reference: tx.id, note: `Void: ${reason || 'No reason'}`, userId: req.user!.sub },
    });
    // Restore stock to the first inventory row only (mirrors FIFO deduction)
    const firstRow = await prisma.inventoryItem.findFirst({
      where: { shopId: shop(req), productId: item.productId },
      orderBy: { createdAt: 'asc' },
    });
    if (firstRow) {
      await prisma.inventoryItem.update({ where: { id: firstRow.id }, data: { quantity: { increment: item.quantity } } });
    }
  }
  return R.ok(res, { message: 'Transaction voided and stock restored' });
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

// ── Debit management ──────────────────────────────────────────────────────────
export async function listDebts(req: AuthRequest, res: Response) {
  const debts = await prisma.transaction.findMany({
    where: {
      shopId: shop(req),
      status: 'COMPLETED',
      payments: { some: { method: 'DEBIT' } },
    },
    include: {
      payments: true,
      customer: { select: { id: true, fullName: true, phone: true } },
      items: { select: { name: true, quantity: true, unitPrice: true, lineTotal: true, unitLabel: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  // Return ALL debit records with settlement status — outstanding and settled
  const result = debts.map(tx => {
    const paidAmount  = tx.payments.filter(p => p.method !== 'DEBIT').reduce((s, p) => s + p.amount, 0);
    const outstanding = tx.total - paidAmount;
    const isSettled   = outstanding <= 0;
    const settlements = tx.payments.filter(p => p.method !== 'DEBIT');
    return { ...tx, paidAmount, outstanding: Math.max(0, outstanding), isSettled, settlements };
  });
  return R.ok(res, result);
}

export async function settleDebt(req: AuthRequest, res: Response) {
  const { amount, method = 'CASH', reference, providerName } = req.body;
  const tx = await prisma.transaction.findFirst({
    where: { id: req.params.id, shopId: shop(req), status: 'COMPLETED' },
    include: { payments: true },
  });
  if (!tx) return R.notFound(res, 'Transaction not found');
  const alreadyPaid = tx.payments.filter(p => p.method !== 'DEBIT').reduce((s, p) => s + p.amount, 0);
  const remaining   = tx.total - alreadyPaid;
  if (remaining <= 0) return R.badRequest(res, 'Debt already fully paid');
  const payAmount = Math.min(Number(amount) || remaining, remaining);
  await prisma.transactionPayment.create({
    data: { transactionId: tx.id, method: method as never, amount: payAmount, reference, providerName },
  });
  return R.ok(res, { settled: payAmount, remaining: remaining - payAmount });
}
