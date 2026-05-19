import { Response } from 'express';
import { AuthRequest } from '../../types';
import { prisma } from '../../core/prisma';
import * as R from '../../utils/response';

const shop = (req: AuthRequest) => req.user!.shopId!;

export async function listAppointments(req: AuthRequest, res: Response) {
  const { from, to, staffId, status } = req.query as Record<string, string>;
  const appointments = await prisma.appointment.findMany({
    where: {
      shopId: shop(req),
      ...(staffId && { staffId }),
      ...(status && { status: status as never }),
      ...(from && { startTime: { gte: new Date(from) } }),
      ...(to && { startTime: { lte: new Date(to) } }),
    },
    include: { customer: { select: { fullName: true, phone: true } }, staff: { select: { fullName: true } }, services: { include: { product: { select: { name: true } } } } },
    orderBy: { startTime: 'asc' },
  });
  return R.ok(res, appointments);
}

export async function getCalendar(req: AuthRequest, res: Response) {
  const { week } = req.query as Record<string, string>;
  const start = week ? new Date(week) : new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 7);
  const appts = await prisma.appointment.findMany({
    where: { shopId: shop(req), startTime: { gte: start, lt: end } },
    include: { customer: { select: { fullName: true } }, staff: { select: { fullName: true } }, services: true },
    orderBy: { startTime: 'asc' },
  });
  return R.ok(res, appts);
}

export async function getAppointment(req: AuthRequest, res: Response) {
  const a = await prisma.appointment.findFirst({ where: { id: req.params.id, shopId: shop(req) }, include: { customer: true, staff: true, services: true } });
  if (!a) return R.notFound(res);
  return R.ok(res, a);
}

export async function createAppointment(req: AuthRequest, res: Response) {
  const { customerId, staffId, startTime, endTime, services, deposit, notes } = req.body;
  const total = services?.reduce((s: number, sv: { price: number }) => s + sv.price, 0) || 0;
  const appt = await prisma.appointment.create({
    data: {
      shopId: shop(req), customerId, staffId, notes, deposit: deposit || 0, totalAmount: total,
      startTime: new Date(startTime), endTime: new Date(endTime),
      services: { create: services || [] },
    },
    include: { services: true },
  });
  return R.created(res, appt);
}

export async function updateAppointment(req: AuthRequest, res: Response) {
  await prisma.appointment.updateMany({ where: { id: req.params.id, shopId: shop(req) }, data: req.body });
  return R.ok(res, { message: 'Updated' });
}

export async function cancelAppointment(req: AuthRequest, res: Response) {
  await prisma.appointment.updateMany({ where: { id: req.params.id, shopId: shop(req) }, data: { status: 'CANCELLED' } });
  return R.ok(res, { message: 'Cancelled' });
}
