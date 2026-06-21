import { Response } from 'express';
import { AuthRequest } from '../../types';
import { prisma } from '../../core/prisma';
import * as R from '../../utils/response';

const shop = (req: AuthRequest) => req.user!.shopId!;

function padNum(n: number) { return String(n).padStart(5, '0'); }

export async function listWorkOrders(req: AuthRequest, res: Response) {
  const { status, technicianId, q } = req.query as Record<string, string>;
  const orders = await prisma.workOrder.findMany({
    where: {
      shopId: shop(req),
      ...(status && { status: status as never }),
      ...(technicianId && { technicianId }),
      ...(q && {
        OR: [
          { jobNo: { contains: q, mode: 'insensitive' } },
          { deviceDesc: { contains: q, mode: 'insensitive' } },
          { fault: { contains: q, mode: 'insensitive' } },
        ],
      }),
    },
    include: { parts: true },
    orderBy: { createdAt: 'desc' },
  });
  return R.ok(res, orders);
}

export async function getWorkOrder(req: AuthRequest, res: Response) {
  const wo = await prisma.workOrder.findFirst({
    where: { id: req.params.id, shopId: shop(req) },
    include: { parts: true },
  });
  if (!wo) return R.notFound(res);
  return R.ok(res, wo);
}

export async function createWorkOrder(req: AuthRequest, res: Response) {
  const { customerId, deviceDesc, fault, technicianId, labourHours, labourRate, serialNo, parts = [] } = req.body;
  const count = await prisma.workOrder.count({ where: { shopId: shop(req) } });
  const jobNo = `WO-${padNum(count + 1)}`;
  const labHrs  = parseFloat(labourHours  ?? 0);
  const labRate = parseFloat(labourRate ?? 0);
  const labourTotal = labHrs * labRate;
  const partsTotal  = (parts as { unitCost: number; quantity: number; markup: number }[]).reduce(
    (s, p) => s + p.unitCost * p.quantity * (1 + (p.markup || 0) / 100), 0
  );
  const wo = await prisma.workOrder.create({
    data: {
      shopId: shop(req), jobNo, customerId, deviceDesc, fault, technicianId, serialNo,
      labourHours: labHrs, labourRate: labRate,
      partsTotal, totalAmount: labourTotal + partsTotal,
      parts: { create: parts.map((p: { productId: string; quantity: number; unitCost: number; markup: number }) => ({
        productId: p.productId, quantity: p.quantity, unitCost: p.unitCost, markup: p.markup || 0,
      })) },
    },
    include: { parts: true },
  });
  return R.created(res, wo);
}

export async function updateWorkOrder(req: AuthRequest, res: Response) {
  const { deviceDesc, fault, diagnosis, status, technicianId, labourHours, labourRate, serialNo, parts } = req.body;
  const existing = await prisma.workOrder.findFirst({ where: { id: req.params.id, shopId: shop(req) } });
  if (!existing) return R.notFound(res);

  const labHrs  = parseFloat(labourHours  ?? existing.labourHours);
  const labRate = parseFloat(labourRate ?? existing.labourRate);
  const labourTotal = labHrs * labRate;

  let partsTotal = existing.partsTotal;
  if (parts) {
    await prisma.workOrderPart.deleteMany({ where: { workOrderId: existing.id } });
    partsTotal = (parts as { unitCost: number; quantity: number; markup: number }[]).reduce(
      (s, p) => s + p.unitCost * p.quantity * (1 + (p.markup || 0) / 100), 0
    );
    await prisma.workOrderPart.createMany({
      data: parts.map((p: { productId: string; quantity: number; unitCost: number; markup: number }) => ({
        workOrderId: existing.id, productId: p.productId,
        quantity: p.quantity, unitCost: p.unitCost, markup: p.markup || 0,
      })),
    });
  }

  const wo = await prisma.workOrder.update({
    where: { id: existing.id },
    data: { deviceDesc, fault, diagnosis, status, technicianId, serialNo, labourHours: labHrs, labourRate: labRate, partsTotal, totalAmount: labourTotal + partsTotal },
    include: { parts: true },
  });
  return R.ok(res, wo);
}

export async function deleteWorkOrder(req: AuthRequest, res: Response) {
  const wo = await prisma.workOrder.findFirst({ where: { id: req.params.id, shopId: shop(req) } });
  if (!wo) return R.notFound(res);
  await prisma.workOrder.delete({ where: { id: req.params.id } });
  return R.noContent(res);
}
