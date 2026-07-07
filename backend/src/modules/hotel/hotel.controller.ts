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
      reservation: true,
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
  const { active, from, to, checkedInBy } = req.query as Record<string, string>;
  const dateFilter = from && to
    ? { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T23:59:59.999Z`) }
    : from
    ? { gte: new Date(`${from}T00:00:00.000Z`) }
    : undefined;

  const folios = await prisma.roomFolio.findMany({
    where: {
      room: { shopId: shop(req) },
      ...(active === 'true' && { checkOut: null }),
      ...(dateFilter && { createdAt: dateFilter }),
      ...(checkedInBy && { checkedInBy }),
    },
    include: { room: { select: { roomNo: true, roomType: true } }, charges: true },
    orderBy: { checkIn: 'desc' },
    take: 200,
  });
  return R.ok(res, folios);
}

export async function checkIn(req: AuthRequest, res: Response) {
  const { roomId, guestName, guestEmail, guestId, guestPhone, nights } = req.body;
  const room = await prisma.room.findFirst({ where: { id: roomId, shopId: shop(req) } });
  if (!room) return R.notFound(res, 'Room not found');
  if (room.status !== 'AVAILABLE') return R.badRequest(res, 'Room is not available');

  // Create or find guest as a Customer record so they appear in the Guests page
  let customerId: string | undefined;
  try {
    const existing = guestPhone
      ? await prisma.customer.findFirst({ where: { shopId: shop(req), phone: guestPhone } })
      : null;
    if (existing) {
      await prisma.customer.update({
        where: { id: existing.id },
        data: {
          fullName: guestName,
          email: guestEmail || existing.email || undefined,
          lastVisitAt: new Date(),
          visitCount: { increment: 1 },
          ...(guestId && { notes: `ID: ${guestId}` }),
        },
      });
      customerId = existing.id;
    } else {
      const created = await prisma.customer.create({
        data: {
          shopId: shop(req),
          fullName: guestName,
          email: guestEmail || null,
          phone: guestPhone || null,
          ...(guestId && { notes: `ID: ${guestId}` }),
          lastVisitAt: new Date(),
          visitCount: 1,
        },
      });
      customerId = created.id;
    }
  } catch { /* non-fatal — folio still creates */ }

  const receptionist = await prisma.user.findUnique({ where: { id: req.user!.sub }, select: { fullName: true } }).catch(() => null);
  const checkedInByName = receptionist?.fullName ?? 'Unknown';

  const n = Number(nights) || 1;
  const roomTotal = room.ratePerNight * n;
  const folio = await prisma.roomFolio.create({
    data: {
      roomId,
      guestName,
      guestEmail,
      guestId,
      guestPhone,
      customerId,
      checkedInBy:     req.user!.sub,
      checkedInByName: checkedInByName,
      checkIn: new Date(),
      nights: n,
      roomTotal,
      grandTotal: roomTotal,
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
  const { isPaid = false, paymentMethod } = req.body;
  const updated = await prisma.roomFolio.update({
    where: { id: folio.id },
    data: {
      checkOut: new Date(),
      grandTotal,
      isPaid: Boolean(isPaid),
      ...(isPaid && paymentMethod ? { paymentMethod } : {}),
    },
    include: { room: true, charges: true },
  });
  await prisma.room.update({ where: { id: folio.roomId }, data: { status: 'AVAILABLE' } });
  return R.ok(res, updated);
}

// ── RESERVATIONS ──────────────────────────────────────────────────────────

export async function createReservation(req: AuthRequest, res: Response) {
  const { roomId, guestName, guestPhone, guestEmail, guestId, notes, checkInDate, nights } = req.body;
  const room = await prisma.room.findFirst({ where: { id: roomId, shopId: shop(req) } });
  if (!room) return R.notFound(res, 'Room not found');
  if (room.status === 'OCCUPIED') return R.badRequest(res, 'Room is currently occupied');

  const existing = await prisma.roomReservation.findUnique({ where: { roomId } });
  if (existing) return R.conflict(res, 'Room already has a reservation');

  const reservation = await prisma.roomReservation.create({
    data: { roomId, guestName, guestPhone, guestEmail, guestId, notes, checkInDate: new Date(checkInDate), nights: Number(nights) || 1 },
  });
  await prisma.room.update({ where: { id: roomId }, data: { status: 'RESERVED' } });
  return R.created(res, reservation);
}

export async function updateReservation(req: AuthRequest, res: Response) {
  const reservation = await prisma.roomReservation.findFirst({
    where: { id: req.params.id, room: { shopId: shop(req) } },
  });
  if (!reservation) return R.notFound(res, 'Reservation not found');
  const { guestName, guestPhone, guestEmail, guestId, notes, checkInDate, nights } = req.body;
  const updated = await prisma.roomReservation.update({
    where: { id: req.params.id },
    data: {
      ...(guestName && { guestName }),
      ...(guestPhone !== undefined && { guestPhone }),
      ...(guestEmail !== undefined && { guestEmail }),
      ...(guestId !== undefined && { guestId }),
      ...(notes !== undefined && { notes }),
      ...(checkInDate && { checkInDate: new Date(checkInDate) }),
      ...(nights && { nights: Number(nights) }),
    },
  });
  return R.ok(res, updated);
}

export async function cancelReservation(req: AuthRequest, res: Response) {
  const reservation = await prisma.roomReservation.findFirst({
    where: { id: req.params.id, room: { shopId: shop(req) } },
  });
  if (!reservation) return R.notFound(res, 'Reservation not found');
  await prisma.roomReservation.delete({ where: { id: req.params.id } });
  await prisma.room.update({ where: { id: reservation.roomId }, data: { status: 'AVAILABLE' } });
  return R.noContent(res);
}

export async function checkInFromReservation(req: AuthRequest, res: Response) {
  const reservation = await prisma.roomReservation.findFirst({
    where: { id: req.params.id, room: { shopId: shop(req) } },
    include: { room: true },
  });
  if (!reservation) return R.notFound(res, 'Reservation not found');
  if (reservation.room.status === 'OCCUPIED') return R.badRequest(res, 'Room is already occupied');

  const receptionist = await prisma.user.findUnique({ where: { id: req.user!.sub }, select: { fullName: true } }).catch(() => null);
  const checkedInByName = receptionist?.fullName ?? 'Unknown';

  // Upsert customer record for the guest
  let customerId: string | undefined;
  try {
    const existing = reservation.guestPhone
      ? await prisma.customer.findFirst({ where: { shopId: shop(req), phone: reservation.guestPhone } })
      : null;
    if (existing) {
      await prisma.customer.update({
        where: { id: existing.id },
        data: { fullName: reservation.guestName, lastVisitAt: new Date(), visitCount: { increment: 1 } },
      });
      customerId = existing.id;
    } else {
      const created = await prisma.customer.create({
        data: { shopId: shop(req), fullName: reservation.guestName, phone: reservation.guestPhone || null, email: reservation.guestEmail || null, lastVisitAt: new Date(), visitCount: 1 },
      });
      customerId = created.id;
    }
  } catch { /* non-fatal */ }

  const n = reservation.nights;
  const roomTotal = reservation.room.ratePerNight * n;
  const folio = await prisma.roomFolio.create({
    data: {
      roomId: reservation.roomId,
      guestName: reservation.guestName,
      guestEmail: reservation.guestEmail,
      guestId: reservation.guestId,
      guestPhone: reservation.guestPhone,
      customerId,
      checkedInBy: req.user!.sub,
      checkedInByName,
      checkIn: new Date(),
      nights: n,
      roomTotal,
      grandTotal: roomTotal,
      charges: { create: { description: `Room rate × ${n} night${n > 1 ? 's' : ''}`, amount: roomTotal, chargeType: 'room_rate' } },
    },
    include: { room: true, charges: true },
  });
  await prisma.roomReservation.delete({ where: { id: req.params.id } });
  await prisma.room.update({ where: { id: reservation.roomId }, data: { status: 'OCCUPIED' } });
  return R.created(res, folio);
}

export async function deleteCharge(req: AuthRequest, res: Response) {
  const { folioId, chargeId } = req.params;
  const folio = await prisma.roomFolio.findFirst({
    where: { id: folioId, room: { shopId: shop(req) }, isPaid: false },
  });
  if (!folio) return R.notFound(res, 'Folio not found or already paid');
  const charge = await prisma.roomCharge.findFirst({ where: { id: chargeId, folioId } });
  if (!charge) return R.notFound(res, 'Charge not found');
  await prisma.roomCharge.delete({ where: { id: chargeId } });
  const remaining = await prisma.roomCharge.findMany({ where: { folioId } });
  const grandTotal = remaining.reduce((s, c) => s + c.amount, 0);
  await prisma.roomFolio.update({ where: { id: folioId }, data: { grandTotal } });
  return R.noContent(res);
}

export async function cancelFolio(req: AuthRequest, res: Response) {
  const folio = await prisma.roomFolio.findFirst({
    where: { id: req.params.id, room: { shopId: shop(req) }, checkOut: null },
  });
  if (!folio) return R.notFound(res, 'Active check-in not found');
  await prisma.room.update({ where: { id: folio.roomId }, data: { status: 'AVAILABLE' } });
  await prisma.roomFolio.delete({ where: { id: folio.id } });
  return R.noContent(res);
}

// Settle a debt folio (already checked out but unpaid)
export async function settleFolio(req: AuthRequest, res: Response) {
  const folio = await prisma.roomFolio.findFirst({
    where: { id: req.params.id, room: { shopId: shop(req) }, checkOut: { not: null }, isPaid: false },
    include: { charges: true, room: true },
  });
  if (!folio) return R.notFound(res, 'Unpaid folio not found');
  const { paymentMethod } = req.body;
  if (!paymentMethod) return R.badRequest(res, 'paymentMethod is required');
  const updated = await prisma.roomFolio.update({
    where: { id: folio.id },
    data: { isPaid: true, paymentMethod },
    include: { room: true, charges: true },
  });
  return R.ok(res, updated);
}

// List unpaid checked-out folios (debts)
export async function listDebts(req: AuthRequest, res: Response) {
  const debts = await prisma.roomFolio.findMany({
    where: { room: { shopId: shop(req) }, checkOut: { not: null }, isPaid: false },
    include: { room: { select: { roomNo: true, roomType: true } }, charges: true },
    orderBy: { checkOut: 'desc' },
  });
  return R.ok(res, debts);
}
