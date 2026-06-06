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

// ── Batches ───────────────────────────────────────────────────────────────────

export async function listBatches(req: AuthRequest, res: Response) {
  const { partnerId, status } = req.query as Record<string, string>;
  const batches = await prisma.consignmentBatch.findMany({
    where: {
      shopId: shop(req),
      ...(partnerId && { partnerId }),
      ...(status && { status: status as 'ACTIVE' | 'PARTIAL' | 'SETTLED' }),
    },
    include: {
      partner: { select: { id: true, name: true } },
      settlements: { select: { qtySold: true, amountPaid: true } },
    },
    orderBy: { receivedAt: 'desc' },
  });

  const enriched = batches.map(b => {
    const settledQty = b.settlements.reduce((s, x) => s + x.qtySold, 0);
    const settledAmount = b.settlements.reduce((s, x) => s + x.amountPaid, 0);
    const qtyRemaining = b.qtyReceived - b.qtySold;
    const totalOwed = b.qtySold * b.costPrice;
    const outstanding = totalOwed - settledAmount;
    return { ...b, settledQty, settledAmount, qtyRemaining, totalOwed, outstanding };
  });

  return R.ok(res, enriched);
}

export async function createBatch(req: AuthRequest, res: Response) {
  const { partnerId, productName, costPrice, sellingPrice, qtyReceived, notes, receivedAt } = req.body;
  const partner = await prisma.consignmentPartner.findFirst({
    where: { id: partnerId, shopId: shop(req), isActive: true },
  });
  if (!partner) return R.notFound(res, 'Partner not found');

  const batch = await prisma.consignmentBatch.create({
    data: {
      shopId: shop(req),
      partnerId,
      productName,
      costPrice: Number(costPrice),
      sellingPrice: Number(sellingPrice),
      qtyReceived: Number(qtyReceived),
      notes,
      ...(receivedAt && { receivedAt: new Date(receivedAt) }),
    },
    include: { partner: { select: { id: true, name: true } } },
  });
  return R.created(res, batch);
}

export async function updateBatchSold(req: AuthRequest, res: Response) {
  const { qtySold } = req.body;
  const batch = await prisma.consignmentBatch.findFirst({
    where: { id: req.params.id, shopId: shop(req) },
  });
  if (!batch) return R.notFound(res);

  const newQtySold = Number(qtySold);
  if (newQtySold < 0 || newQtySold > batch.qtyReceived) {
    return R.badRequest(res, `qtySold must be between 0 and ${batch.qtyReceived}`);
  }

  const totalSettled = (await prisma.consignmentSettlement.aggregate({
    where: { batchId: batch.id },
    _sum: { qtySold: true },
  }))._sum.qtySold ?? 0;

  let status: 'ACTIVE' | 'PARTIAL' | 'SETTLED' = 'ACTIVE';
  if (newQtySold > 0 && newQtySold > totalSettled) status = 'PARTIAL';
  if (totalSettled >= newQtySold && newQtySold > 0) status = 'SETTLED';

  const updated = await prisma.consignmentBatch.update({
    where: { id: batch.id },
    data: { qtySold: newQtySold, status },
    include: { partner: { select: { id: true, name: true } } },
  });
  return R.ok(res, updated);
}

// ── Liability ─────────────────────────────────────────────────────────────────

export async function getLiability(req: AuthRequest, res: Response) {
  const batches = await prisma.consignmentBatch.findMany({
    where: { shopId: shop(req), status: { in: ['ACTIVE', 'PARTIAL'] } },
    include: {
      partner: { select: { id: true, name: true, phone: true } },
      settlements: { select: { qtySold: true, amountPaid: true } },
    },
  });

  // Group by partner
  const byPartner: Record<string, {
    partnerId: string; partnerName: string; phone?: string | null;
    totalOwed: number; totalPaid: number; outstanding: number; batches: number;
  }> = {};

  for (const b of batches) {
    const settled = b.settlements.reduce((s, x) => s + x.amountPaid, 0);
    const owed = b.qtySold * b.costPrice;
    const outstanding = owed - settled;
    const pid = b.partner.id;
    if (!byPartner[pid]) {
      byPartner[pid] = { partnerId: pid, partnerName: b.partner.name, phone: b.partner.phone, totalOwed: 0, totalPaid: 0, outstanding: 0, batches: 0 };
    }
    byPartner[pid].totalOwed += owed;
    byPartner[pid].totalPaid += settled;
    byPartner[pid].outstanding += outstanding;
    byPartner[pid].batches += 1;
  }

  return R.ok(res, Object.values(byPartner).sort((a, b) => b.outstanding - a.outstanding));
}

// ── Settlements ───────────────────────────────────────────────────────────────

export async function listSettlements(req: AuthRequest, res: Response) {
  const { batchId } = req.query as Record<string, string>;
  const settlements = await prisma.consignmentSettlement.findMany({
    where: {
      shopId: shop(req),
      ...(batchId && { batchId }),
    },
    include: {
      batch: { select: { id: true, productName: true, partner: { select: { name: true } } } },
    },
    orderBy: { paidAt: 'desc' },
  });
  return R.ok(res, settlements);
}

export async function createSettlement(req: AuthRequest, res: Response) {
  const { batchId, qtySold, amountPaid, notes, paidAt } = req.body;

  const batch = await prisma.consignmentBatch.findFirst({
    where: { id: batchId, shopId: shop(req) },
    include: { settlements: { select: { qtySold: true, amountPaid: true } } },
  });
  if (!batch) return R.notFound(res, 'Batch not found');

  const qty = Number(qtySold);
  const paid = Number(amountPaid);
  const amountOwed = qty * batch.costPrice;

  const settlement = await prisma.consignmentSettlement.create({
    data: {
      shopId: shop(req),
      batchId,
      qtySold: qty,
      amountOwed,
      amountPaid: paid,
      notes,
      ...(paidAt && { paidAt: new Date(paidAt) }),
    },
    include: {
      batch: { select: { productName: true, partner: { select: { name: true } } } },
    },
  });

  // Recalculate batch status
  const allSettled = [...batch.settlements, { qtySold: qty, amountPaid: paid }];
  const totalSettledQty = allSettled.reduce((s, x) => s + x.qtySold, 0);
  const newStatus = totalSettledQty >= batch.qtySold ? 'SETTLED' : 'PARTIAL';
  await prisma.consignmentBatch.update({
    where: { id: batchId },
    data: { qtySold: Math.max(batch.qtySold, totalSettledQty), status: newStatus },
  });

  return R.created(res, settlement);
}
