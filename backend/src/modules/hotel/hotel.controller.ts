import { Response } from 'express';
import { AuthRequest } from '../../types';
import { prisma } from '../../core/prisma';
import * as R from '../../utils/response';

const shop = (req: AuthRequest) => req.user!.shopId!;

// ── ROOMS ──────────────────────────────────────────────────────────────────

export async function listRooms(req: AuthRequest, res: Response) {
  const rooms = await prisma.room.findMany({
    where: { shopId: shop(req) },
    include: {
      folios: {
        where: { checkOut: null },
        orderBy: { checkIn: 'desc' },
        take: 1,
      },
    },
    orderBy: [{ floor: 'asc' }, { roomNo: 'asc' }],
  });
  return R.ok(res, rooms);
}

export async function createRoom(req: AuthRequest, res: Response) {
  const { roomNo, roomType, floor, ratePerNight } = req.body;
  const room = await prisma.room.create({
    data: { shopId: shop(req), roomNo, roomType, floor: floor ? Number(floor) : null, ratePerNight: Number(ratePerNight) },
  });
  return R.created(res, room);
}

export async function updateRoom(req: AuthRequest, res: Response) {
  const room = await prisma.room.findFirst({ where: { id: req.params.id, shopId: shop(req) } });
  if (!room) return R.notFound(res);
  const { roomNo, roomType, floor, ratePerNight, status } = req.body;
  const updated = await prisma.room.update({
    where: { id: req.params.id },
    data: { roomNo, roomType, floor: floor ? Number(floor) : undefined, ratePerNight: ratePerNight ? Number(ratePerNight) : undefined, status },
  });
  return R.ok(res, updated);
}

export async function deleteRoom(req: AuthRequest, res: Response) {
  const room = await prisma.room.findFirst({ where: { id: req.params.id, shopId: shop(req) } });
  if (!room) return R.notFound(res);
  await prisma.room.delete({ where: { id: req.params.id } });
  return R.noContent(res);
}

// ── FOLIOS (check-in / check-out) ─────────────────────────────────────────

export async function listFolios(req: AuthRequest, res: Response) {
  const { active } = req.query as Record<string, string>;
  const folios = await prisma.roomFolio.findMany({
    where: {
      room: { shopId: shop(req) },
      ...(active === 'true' && { checkOut: null }),
    },
    include: { room: { select: { roomNo: true, roomType: true } }, charges: true },
    orderBy: { checkIn: 'desc' },
    take: 100,
  });
  return R.ok(res, folios);
}

export async function checkIn(req: AuthRequest, res: Response) {
  const { roomId, guestName, guestEmail, nights } = req.body;
  const room = await prisma.room.findFirst({ where: { id: roomId, shopId: shop(req) } });
  if (!room) return R.notFound(res, 'Room not found');
  if (room.status !== 'AVAILABLE') return R.badRequest(res, 'Room is not available');

  const n = Number(nights) || 1;
  const roomTotal = room.ratePerNight * n;
  const folio = await prisma.roomFolio.create({
    data: {
      roomId, guestName, guestEmail, checkIn: new Date(), nights: n, roomTotal, grandTotal: roomTotal,
      charges: { create: { description: `Room rate × ${n} night${n > 1 ? 's' : ''}`, amount: roomTotal, chargeType: 'room_rate' } },
    },
    include: { room: true, charges: true },
  });
  await prisma.room.update({ where: { id: roomId }, data: { status: 'OCCUPIED' } });
  return R.created(res, folio);
}

export async function getFolio(req: AuthRequest, res: Response) {
  const folio = await prisma.roomFolio.findFirst({
    where: { id: req.params.id, room: { shopId: shop(req) } },
    include: { room: true, charges: true },
  });
  if (!folio) return R.notFound(res);
  return R.ok(res, folio);
}

export async function addCharge(req: AuthRequest, res: Response) {
  const { description, amount, chargeType } = req.body;
  const folio = await prisma.roomFolio.findFirst({
    where: { id: req.params.id, room: { shopId: shop(req) }, checkOut: null },
  });
  if (!folio) return R.notFound(res);
  const charge = await prisma.roomCharge.create({
    data: { folioId: folio.id, description, amount: Number(amount), chargeType: chargeType || 'service' },
  });
  const allCharges = await prisma.roomCharge.findMany({ where: { folioId: folio.id } });
  const grandTotal = allCharges.reduce((s, c) => s + c.amount, 0);
  await prisma.roomFolio.update({ where: { id: folio.id }, data: { grandTotal } });
  return R.created(res, charge);
}

export async function checkOut(req: AuthRequest, res: Response) {
  const folio = await prisma.roomFolio.findFirst({
    where: { id: req.params.id, room: { shopId: shop(req) }, checkOut: null },
    include: { charges: true },
  });
  if (!folio) return R.notFound(res);
  const grandTotal = folio.charges.reduce((s, c) => s + c.amount, 0);
  const updated = await prisma.roomFolio.update({
    where: { id: folio.id },
    data: { checkOut: new Date(), grandTotal, isPaid: req.body.isPaid ?? false },
    include: { room: true, charges: true },
  });
  await prisma.room.update({ where: { id: folio.roomId }, data: { status: 'AVAILABLE' } });
  return R.ok(res, updated);
}
