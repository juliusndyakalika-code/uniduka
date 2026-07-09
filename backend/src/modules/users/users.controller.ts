import { Response } from 'express';
import bcrypt from 'bcryptjs';
import { AuthRequest } from '../../types';
import { prisma } from '../../core/prisma';
import * as R from '../../utils/response';
import { normalizePhone } from '../../utils/phone';

export async function listUsers(req: AuthRequest, res: Response) {
  const users = await prisma.user.findMany({
    where: { ownerAccountId: req.user!.accountId },
    select: {
      id: true, fullName: true, email: true, phone: true, role: true, isActive: true, lastLoginAt: true,
      shopAccess: {
        select: { shopId: true, shop: { select: { tradingName: true } } },
        take: 1,
      },
    },
    orderBy: { createdAt: 'asc' },
  });
  return R.ok(res, users);
}

const ASSIGNABLE_ROLES: Record<string, string[]> = {
  ACCOUNT_OWNER: ['CASHIER', 'INVENTORY_STAFF', 'RECEPTIONIST'],
};

export async function createUser(req: AuthRequest, res: Response) {
  const { email, password, fullName, role, shopId, shopRole } = req.body;
  const phone = req.body.phone ? normalizePhone(req.body.phone) : undefined;

  const callerRole = req.user!.role;
  const allowed = ASSIGNABLE_ROLES[callerRole] ?? [];
  if (!allowed.includes(role)) {
    return R.forbidden(res, `${callerRole} cannot assign role ${role}`);
  }

  if (!email && !phone) return R.badRequest(res, 'Email or phone number is required');
  if (email) {
    const exists = await prisma.user.findFirst({ where: { email } });
    if (exists) return R.conflict(res, 'Email already in use');
  }
  if (phone) {
    const exists = await prisma.user.findFirst({ where: { phone } });
    if (exists) return R.conflict(res, 'Phone number already in use');
  }
  const hash = await bcrypt.hash(password || 'changeme123', 12);
  const user = await prisma.user.create({
    data: { email: email || null, passwordHash: hash, fullName, phone: phone || null, role, ownerAccountId: req.user!.accountId },
  });
  if (shopId) {
    await prisma.userShopAccess.create({ data: { userId: user.id, shopId, role: shopRole || role } });
  }
  return R.created(res, { id: user.id, email: user.email, fullName: user.fullName, role: user.role });
}

export async function updateUser(req: AuthRequest, res: Response) {
  const { fullName, email, role, isActive } = req.body;
  const phone = req.body.phone ? normalizePhone(req.body.phone) : req.body.phone;

  if (email) {
    const conflict = await prisma.user.findFirst({ where: { email, NOT: { id: req.params.id } } });
    if (conflict) return R.conflict(res, 'Email already in use');
  }
  if (phone) {
    const conflict = await prisma.user.findFirst({ where: { phone, NOT: { id: req.params.id } } });
    if (conflict) return R.conflict(res, 'Phone number already in use');
  }

  await prisma.user.updateMany({
    where: { id: req.params.id, ownerAccountId: req.user!.accountId },
    data: { fullName, email, phone, role, isActive },
  });
  return R.ok(res, { message: 'Updated' });
}

export async function deactivateUser(req: AuthRequest, res: Response) {
  await prisma.user.updateMany({ where: { id: req.params.id, ownerAccountId: req.user!.accountId }, data: { isActive: false } });
  return R.noContent(res);
}

export async function deleteUser(req: AuthRequest, res: Response) {
  const target = await prisma.user.findFirst({
    where: { id: req.params.id, ownerAccountId: req.user!.accountId },
    select: { id: true, role: true },
  });
  if (!target) return R.notFound(res, 'User not found');
  if (target.role === 'ACCOUNT_OWNER') return R.forbidden(res, 'Cannot delete an account owner');
  try {
    await prisma.user.delete({ where: { id: req.params.id } });
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code;
    if (code === 'P2003') {
      // User has transactions — deactivate instead of deleting
      await prisma.user.update({ where: { id: req.params.id }, data: { isActive: false } });
      return R.ok(res, { message: 'User deactivated (has transaction history — cannot be fully deleted)' });
    }
    throw e;
  }
  return R.noContent(res);
}

export async function resetStaffPassword(req: AuthRequest, res: Response) {
  const { newPassword } = req.body;
  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8)
    return R.badRequest(res, 'New password must be at least 8 characters');

  const target = await prisma.user.findFirst({
    where: { id: req.params.id, ownerAccountId: req.user!.accountId },
    select: { id: true, role: true },
  });
  if (!target) return R.notFound(res, 'User not found');
  if (target.role === 'ACCOUNT_OWNER') return R.forbidden(res, 'Cannot reset password of an account owner');

  const hash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id: req.params.id }, data: { passwordHash: hash } });
  return R.ok(res, { message: 'Password reset successfully' });
}

export async function assignShop(req: AuthRequest, res: Response) {
  const { shopId } = req.body;

  // Verify the shop belongs to this account
  const shop = await prisma.shop.findFirst({
    where: { id: shopId, ownerAccountId: req.user!.accountId },
    select: { id: true },
  });
  if (!shop) return R.notFound(res, 'Shop not found');

  // Verify the user belongs to this account
  const user = await prisma.user.findFirst({
    where: { id: req.params.id, ownerAccountId: req.user!.accountId },
    select: { id: true, role: true },
  });
  if (!user) return R.notFound(res, 'User not found');

  // Remove all existing shop assignments for this user, then create the new one
  await prisma.userShopAccess.deleteMany({ where: { userId: req.params.id } });
  await prisma.userShopAccess.create({ data: { userId: req.params.id, shopId, role: user.role } });

  return R.ok(res, { message: 'Shop assigned', shopId });
}

export async function getAuditLog(req: AuthRequest, res: Response) {
  const logs = await prisma.auditLog.findMany({
    where: { userId: { in: (await prisma.user.findMany({ where: { ownerAccountId: req.user!.accountId }, select: { id: true } })).map(u => u.id) } },
    include: { user: { select: { fullName: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return R.ok(res, logs);
}
