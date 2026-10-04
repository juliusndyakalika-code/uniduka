import { Response } from 'express';
import { AuthRequest } from '../../types';
import { prisma } from '../../core/prisma';
import { io } from '../../app';
import * as R from '../../utils/response';

const shop = (req: AuthRequest) => req.user!.shopId!;

/**
 * One ticket, in the shape the kitchen screen renders.
 *
 * The stored row and the screen use different words for the same things —
 * orderNo/receiptNo, sentAt/createdAt, PREPARING/IN_PROGRESS — and the lines
 * inside `items` are free-form JSON written by whatever created the ticket.
 * Translating here keeps that mess in one place instead of in the screen.
 */
function forDisplay(o: {
  id: string; orderNo: string; status: string; tableNo: string | null;
  sentAt: Date; items: unknown;
}) {
  const raw = Array.isArray(o.items) ? o.items as Record<string, unknown>[] : [];
  return {
    id: o.id,
    receiptNo: o.tableNo ? `${o.orderNo} · Meza ${o.tableNo}` : o.orderNo,
    status: o.status === 'PREPARING' ? 'IN_PROGRESS' : o.status,
    createdAt: o.sentAt,
    items: raw.map((line, i) => ({
      id: String(line.id ?? `${o.id}-${i}`),
      productName: String(line.productName ?? line.name ?? ''),
      qty: Number(line.qty ?? line.quantity ?? 1),
      notes: line.notes ? String(line.notes) : undefined,
      status: String(line.status ?? o.status),
    })),
  };
}

export async function listOrders(req: AuthRequest, res: Response) {
  // The screen's own toggle: "active" is what the kitchen is still cooking,
  // "all" includes what has already gone out, for checking back on a ticket.
  const all = req.query.filter === 'all';
  const orders = await prisma.kdsOrder.findMany({
    where: {
      shopId: shop(req),
      ...(all ? {} : { status: { in: ['PENDING', 'PREPARING'] } }),
    },
    orderBy: [{ priority: 'desc' }, { sentAt: 'asc' }],
  });
  return R.ok(res, orders.map(forDisplay));
}

export async function updateOrderStatus(req: AuthRequest, res: Response) {
  // The screen says IN_PROGRESS; the column says PREPARING. Same state.
  const status = req.body.status === 'IN_PROGRESS' ? 'PREPARING' : req.body.status;
  const order = await prisma.kdsOrder.update({
    where: { id: req.params.id },
    data: { status, ...(status === 'READY' && { readyAt: new Date() }), ...(status === 'SERVED' && { servedAt: new Date() }) },
  });
  io.to(`shop:${shop(req)}`).emit('kds_update', order);
  return R.ok(res, forDisplay(order));
}
