import { Response } from 'express';
import { AuthRequest } from '../../types';
import { prisma } from '../../core/prisma';
import { io } from '../../app';
import * as R from '../../utils/response';

const shop = (req: AuthRequest) => req.user!.shopId!;

export async function listOrders(req: AuthRequest, res: Response) {
  const orders = await prisma.kdsOrder.findMany({
    where: { shopId: shop(req), status: { in: ['PENDING', 'PREPARING'] } },
    orderBy: [{ priority: 'desc' }, { sentAt: 'asc' }],
  });
  return R.ok(res, orders);
}

export async function updateOrderStatus(req: AuthRequest, res: Response) {
  const { status } = req.body;
  const order = await prisma.kdsOrder.update({
    where: { id: req.params.id },
    data: { status, ...(status === 'READY' && { readyAt: new Date() }), ...(status === 'SERVED' && { servedAt: new Date() }) },
  });
  io.to(`shop:${shop(req)}`).emit('kds_update', order);
  return R.ok(res, order);
}
