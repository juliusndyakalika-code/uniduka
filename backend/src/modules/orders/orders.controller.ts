/**
 * Shop-side orders inbox for the public storefront.
 *
 * Lifecycle: PENDING → ACCEPTED → FULFILLED, with REJECTED / CANCELLED /
 * EXPIRED as terminal side exits. Inventory is only ever touched on FULFILLED,
 * so an order sitting in the inbox can never affect what the POS shows as
 * available.
 */
import { Response } from 'express';
import { AuthRequest } from '../../types';
import { prisma } from '../../core/prisma';
import * as R from '../../utils/response';
import * as tz from '../../utils/tz';

const shop = (req: AuthRequest) => req.user!.shopId!;

function receiptNo() {
  return `RCP-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

/**
 * Close out any PENDING order whose window has passed. Done lazily on read
 * rather than on a schedule — the inbox is the only place it matters, and this
 * keeps the deployment free of a cron dependency.
 */
async function expireStale(shopId: string) {
  await prisma.order.updateMany({
    where: { shopId, status: 'PENDING', expiresAt: { lt: new Date() } },
    data:  { status: 'EXPIRED', closedAt: new Date() },
  });
}

// ── GET /orders ──────────────────────────────────────────────────────────────
export async function listOrders(req: AuthRequest, res: Response) {
  const sid = shop(req);
  await expireStale(sid);

  const { status, search, from, to, page = '1', limit = '25' } = req.query as Record<string, string>;
  const take = Math.min(Number(limit) || 25, 100);
  const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

  const shopRow = await prisma.shop.findUnique({ where: { id: sid }, select: { timezone: true } });
  const zone = shopRow?.timezone || tz.DEFAULT_TZ;

  const where = {
    shopId: sid,
    ...(status && { status: status as never }),
    ...((from || to) && {
      createdAt: {
        ...(from && { gte: tz.startOfDateString(from, zone) }),
        ...(to   && { lte: tz.endOfDateString(to, zone) }),
      },
    }),
    ...(search && {
      OR: [
        { orderNo:    { contains: search, mode: 'insensitive' as const } },
        { buyerName:  { contains: search, mode: 'insensitive' as const } },
        { buyerPhone: { contains: search, mode: 'insensitive' as const } },
      ],
    }),
  };

  const [orders, total, counts] = await Promise.all([
    prisma.order.findMany({
      where,
      include: { items: true },
      orderBy: { createdAt: 'desc' },
      skip, take,
    }),
    prisma.order.count({ where }),
    // Inbox badge counts are always shop-wide, never narrowed by the filters.
    prisma.order.groupBy({
      by: ['status'],
      where: { shopId: sid },
      _count: { id: true },
    }),
  ]);

  const byStatus: Record<string, number> = {};
  for (const c of counts) byStatus[c.status] = c._count.id;

  return R.ok(res, orders, {
    total, page: Number(page) || 1, limit: take, pages: Math.ceil(total / take),
    counts: byStatus,
  });
}

// ── GET /orders/:id ──────────────────────────────────────────────────────────
export async function getOrder(req: AuthRequest, res: Response) {
  const order = await prisma.order.findFirst({
    where: { id: req.params.id, shopId: shop(req) },
    include: {
      items: { include: { product: { select: { name: true, imageUrl: true } } } },
      customer: { select: { id: true, fullName: true, phone: true } },
    },
  });
  if (!order) return R.notFound(res, 'Order not found');
  return R.ok(res, order);
}

// ── POST /orders/:id/accept ──────────────────────────────────────────────────
export async function acceptOrder(req: AuthRequest, res: Response) {
  const order = await prisma.order.findFirst({
    where: { id: req.params.id, shopId: shop(req) },
  });
  if (!order) return R.notFound(res, 'Order not found');
  if (order.status !== 'PENDING') {
    return R.badRequest(res, `This order is already ${order.status.toLowerCase()}`);
  }

  const updated = await prisma.order.update({
    where: { id: order.id },
    data:  { status: 'ACCEPTED', acceptedAt: new Date() },
  });
  return R.ok(res, updated);
}

// ── POST /orders/:id/reject ──────────────────────────────────────────────────
export async function rejectOrder(req: AuthRequest, res: Response) {
  const { reason } = req.body ?? {};
  const order = await prisma.order.findFirst({
    where: { id: req.params.id, shopId: shop(req) },
  });
  if (!order) return R.notFound(res, 'Order not found');
  if (order.status === 'FULFILLED') {
    return R.badRequest(res, 'A fulfilled order cannot be rejected');
  }
  if (['REJECTED', 'CANCELLED', 'EXPIRED'].includes(order.status)) {
    return R.badRequest(res, `This order is already ${order.status.toLowerCase()}`);
  }

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: {
      status: 'REJECTED',
      cancelReason: reason ? String(reason).slice(0, 300) : null,
      closedAt: new Date(),
    },
  });
  return R.ok(res, updated);
}

// ── POST /orders/:id/fulfil ──────────────────────────────────────────────────
/**
 * The order has been handed over and paid for. This is the only place an order
 * touches inventory, and it converts the order into a Transaction so online
 * sales flow through the same reporting as counter sales.
 */
export async function fulfilOrder(req: AuthRequest, res: Response) {
  const sid = shop(req);
  const order = await prisma.order.findFirst({
    where: { id: req.params.id, shopId: sid },
    include: { items: true },
  });
  if (!order) return R.notFound(res, 'Order not found');
  if (order.status === 'FULFILLED') return R.badRequest(res, 'This order is already fulfilled');
  if (!['PENDING', 'ACCEPTED'].includes(order.status)) {
    return R.badRequest(res, `A ${order.status.toLowerCase()} order cannot be fulfilled`);
  }
  if (order.items.length === 0) return R.badRequest(res, 'This order has no items');

  // Link or create a CRM customer so repeat buyers accumulate history. Deferred
  // to fulfilment on purpose — unconfirmed orders shouldn't populate the CRM.
  let customerId = order.customerId;
  if (!customerId) {
    const existing = await prisma.customer.findFirst({
      where: { shopId: sid, phone: order.buyerPhone },
      select: { id: true },
    });
    customerId = existing?.id ?? (await prisma.customer.create({
      data: {
        shopId: sid,
        fullName: order.buyerName,
        phone: order.buyerPhone,
        email: order.buyerEmail,
        address: order.deliveryAddress,
      },
      select: { id: true },
    })).id;
  }

  // Tax is derived *inclusively* from the listed price. The buyer agreed to the
  // price shown on the storefront, so adding tax on top would change what they
  // owe; POS prices are tax-exclusive, storefront prices are not.
  const taxRules = await prisma.product.findMany({
    where: { id: { in: order.items.map(i => i.productId) } },
    select: { id: true, taxRule: { select: { rate: true } } },
  });
  const rateFor = new Map(taxRules.map(p => [p.id, p.taxRule?.rate ?? 0]));

  const txItems = order.items.map(i => {
    const rate = rateFor.get(i.productId) ?? 0;
    const taxAmount = rate > 0 ? i.lineTotal - i.lineTotal / (1 + rate / 100) : 0;
    return {
      productId: i.productId,
      name: i.name,
      quantity: i.quantity,
      unitLabel: i.unitLabel,
      unitPrice: i.unitPrice,
      discountPct: 0,
      taxAmount,
      lineTotal: i.lineTotal,
    };
  });
  const taxAmount = txItems.reduce((s, i) => s + i.taxAmount, 0);

  // subtotal is goods only; total includes the delivery fee, so the two differ
  // by exactly order.deliveryFee. The Order row keeps the authoritative
  // breakdown and is reachable via transactionId.
  const feeNote = order.deliveryFee > 0
    ? ` · includes ${order.deliveryFee} delivery`
    : '';

  const tx = await prisma.transaction.create({
    data: {
      shopId: sid,
      cashierId: req.user!.sub,
      customerId,
      subtotal: order.subtotal,
      discountAmount: 0,
      taxAmount,
      total: order.total,
      receiptNo: receiptNo(),
      status: 'COMPLETED',
      type: 'SALE',
      customerName: order.buyerName,
      note: `Online order ${order.orderNo}${feeNote}`,
      items: { create: txItems },
      // Pay on delivery/pickup is settled in cash at handover.
      payments: { create: [{ method: 'CASH', amount: order.total }] },
    },
    include: { items: true, payments: true },
  });

  // Deduct stock FIFO across inventory rows — same approach as the POS, so a
  // product spread over several rows is decremented once, not once per row.
  for (const item of order.items) {
    await prisma.stockMovement.create({
      data: {
        shopId: sid, productId: item.productId, type: 'SALE',
        quantity: -item.quantity, reference: tx.id, userId: req.user!.sub,
        note: `Online order ${order.orderNo}`,
      },
    });
    let remaining = item.quantity;
    const rows = await prisma.inventoryItem.findMany({
      where: { shopId: sid, productId: item.productId },
      orderBy: { createdAt: 'asc' },
    });
    for (const row of rows) {
      if (remaining <= 0) break;
      const take = Math.min(row.quantity, remaining);
      await prisma.inventoryItem.update({
        where: { id: row.id },
        data: { quantity: { decrement: take } },
      });
      remaining -= take;
    }
    // Mirror the POS and allow oversell rather than blocking: if the shop is
    // fulfilling, the goods physically changed hands and the record should say
    // so. Any shortfall lands on the first row and shows up as negative stock.
    if (remaining > 0 && rows.length > 0) {
      await prisma.inventoryItem.update({
        where: { id: rows[0].id },
        data: { quantity: { decrement: remaining } },
      });
    }
  }

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: {
      status: 'FULFILLED',
      fulfilledAt: new Date(),
      customerId,
      transactionId: tx.id,
      acceptedAt: order.acceptedAt ?? new Date(),
    },
  });

  return R.ok(res, { order: updated, transaction: { id: tx.id, receiptNo: tx.receiptNo } });
}
