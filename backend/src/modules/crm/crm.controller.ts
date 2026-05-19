import { Response } from 'express';
import { AuthRequest } from '../../types';
import { prisma } from '../../core/prisma';
import * as R from '../../utils/response';

const shop = (req: AuthRequest) => req.user!.shopId!;

export async function listCustomers(req: AuthRequest, res: Response) {
  const { search, tag, page = '1', limit = '50' } = req.query as Record<string, string>;
  const skip = (Number(page) - 1) * Number(limit);
  const [customers, total] = await Promise.all([
    prisma.customer.findMany({
      where: {
        shopId: shop(req),
        isActive: true,
        ...(search && { OR: [{ fullName: { contains: search, mode: 'insensitive' } }, { email: { contains: search, mode: 'insensitive' } }, { phone: { contains: search } }] }),
        ...(tag && { tags: { has: tag } }),
      },
      skip, take: Number(limit),
      orderBy: { lastVisitAt: 'desc' },
    }),
    prisma.customer.count({ where: { shopId: shop(req), isActive: true } }),
  ]);
  return R.ok(res, customers, { total, page: Number(page), limit: Number(limit) });
}

export async function getCustomer(req: AuthRequest, res: Response) {
  const c = await prisma.customer.findFirst({ where: { id: req.params.id, shopId: shop(req) } });
  if (!c) return R.notFound(res);
  return R.ok(res, c);
}

export async function createCustomer(req: AuthRequest, res: Response) {
  const customer = await prisma.customer.create({ data: { ...req.body, shopId: shop(req) } });
  return R.created(res, customer);
}

export async function updateCustomer(req: AuthRequest, res: Response) {
  const r = await prisma.customer.updateMany({ where: { id: req.params.id, shopId: shop(req) }, data: req.body });
  if (!r.count) return R.notFound(res);
  return R.ok(res, { message: 'Updated' });
}

export async function deleteCustomer(req: AuthRequest, res: Response) {
  await prisma.customer.updateMany({ where: { id: req.params.id, shopId: shop(req) }, data: { isActive: false } });
  return R.noContent(res);
}

export async function getCustomerHistory(req: AuthRequest, res: Response) {
  const [transactions, appointments] = await Promise.all([
    prisma.transaction.findMany({ where: { customerId: req.params.id, shopId: shop(req) }, include: { items: true }, orderBy: { createdAt: 'desc' }, take: 20 }),
    prisma.appointment.findMany({ where: { customerId: req.params.id, shopId: shop(req) }, include: { services: true }, orderBy: { startTime: 'desc' }, take: 10 }),
  ]);
  return R.ok(res, { transactions, appointments });
}
