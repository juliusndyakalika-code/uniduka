import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../../core/prisma';
import { AuthRequest } from '../../types';
import * as R from '../../utils/response';
import { SubscriptionPlan, UserRole } from '@prisma/client';

// GET /api/v1/platform/metrics
export async function getMetrics(_req: Request, res: Response) {
  const [totalAccounts, activeAccounts, totalShops, activeShops, totalUsers, activeUsers] = await Promise.all([
    prisma.ownerAccount.count(),
    prisma.ownerAccount.count({ where: { isActive: true } }),
    prisma.shop.count(),
    prisma.shop.count({ where: { isActive: true } }),
    prisma.user.count({ where: { role: { not: UserRole.PLATFORM_ADMIN } } }),
    prisma.user.count({ where: { isActive: true, role: { not: UserRole.PLATFORM_ADMIN } } }),
  ]);

  const planBreakdown = await prisma.ownerAccount.groupBy({
    by: ['subscriptionPlan'],
    _count: { id: true },
    where: { email: { not: 'platform@internal.uniduka.com' } },
  });

  const recentAccounts = await prisma.ownerAccount.findMany({
    where: { email: { not: 'platform@internal.uniduka.com' } },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { id: true, legalName: true, email: true, subscriptionPlan: true, isActive: true, createdAt: true },
  });

  return R.ok(res, {
    accounts: { total: totalAccounts - 1, active: activeAccounts - 1 }, // exclude platform internal
    shops:    { total: totalShops, active: activeShops },
    users:    { total: totalUsers, active: activeUsers },
    planBreakdown: planBreakdown.map(p => ({ plan: p.subscriptionPlan, count: p._count.id })),
    recentAccounts,
  });
}

// GET /api/v1/platform/accounts
export async function listAccounts(req: Request, res: Response) {
  const { search = '', page = '1', limit = '20' } = req.query as Record<string, string>;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const where = {
    email: { not: 'platform@internal.uniduka.com' },
    ...(search && {
      OR: [
        { legalName: { contains: search, mode: 'insensitive' as const } },
        { email:     { contains: search, mode: 'insensitive' as const } },
      ],
    }),
  };

  const [accounts, total] = await Promise.all([
    prisma.ownerAccount.findMany({
      where,
      skip,
      take: parseInt(limit),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, legalName: true, email: true, phone: true,
        subscriptionPlan: true, subscriptionActive: true, isActive: true, createdAt: true,
        _count: { select: { shops: true, users: true } },
      },
    }),
    prisma.ownerAccount.count({ where }),
  ]);

  return R.ok(res, accounts, { total, page: parseInt(page), limit: parseInt(limit) });
}

// GET /api/v1/platform/accounts/:id
export async function getAccount(req: Request, res: Response) {
  const account = await prisma.ownerAccount.findUnique({
    where: { id: req.params.id },
    include: {
      shops: {
        select: { id: true, tradingName: true, businessType: true, isActive: true, wizardCompleted: true, city: true, country: true, createdAt: true },
      },
      users: {
        where: { role: { not: UserRole.PLATFORM_ADMIN } },
        select: { id: true, fullName: true, email: true, role: true, isActive: true, lastLoginAt: true, createdAt: true },
      },
    },
  });
  if (!account) return R.notFound(res, 'Account not found');
  return R.ok(res, account);
}

// POST /api/v1/platform/accounts/:id/activate
// body: { plan, durationDays }  — durationDays=0 means never expires
export async function activateAccount(req: Request, res: Response, next: NextFunction) {
  try {
    const { plan = 'STARTER', durationDays = 30 } = req.body as { plan?: string; durationDays?: number };
    if (!Object.values(SubscriptionPlan).includes(plan as SubscriptionPlan)) return R.badRequest(res, 'Invalid plan');
    const expiresAt = Number(durationDays) > 0 ? new Date(Date.now() + Number(durationDays) * 86_400_000) : null;
    const [account] = await prisma.$transaction([
      prisma.ownerAccount.update({
        where: { id: req.params.id },
        data:  { subscriptionPlan: plan as SubscriptionPlan, subscriptionActive: true, isActive: true, subscriptionExpiresAt: expiresAt },
        select: { id: true, legalName: true, subscriptionPlan: true, subscriptionActive: true, isActive: true, subscriptionExpiresAt: true },
      }),
      prisma.shop.updateMany({ where: { ownerAccountId: req.params.id }, data: { isActive: true } }),
    ]);
    return R.ok(res, account);
  } catch (err) { next(err); }
}

// keep old route alias for backwards compat
export const approveAccount = activateAccount;

// POST /api/v1/platform/accounts/:id/suspend
export async function suspendAccount(req: Request, res: Response, next: NextFunction) {
  try {
    const [account] = await prisma.$transaction([
      prisma.ownerAccount.update({
        where: { id: req.params.id },
        data:  { subscriptionActive: false, isActive: false },
        select: { id: true, legalName: true, subscriptionActive: true, isActive: true },
      }),
      prisma.shop.updateMany({
        where: { ownerAccountId: req.params.id },
        data:  { isActive: false },
      }),
    ]);
    return R.ok(res, account);
  } catch (err) { next(err); }
}

// PATCH /api/v1/platform/accounts/:id
export async function updateAccount(req: Request, res: Response) {
  const { isActive, subscriptionPlan, subscriptionActive } = req.body;

  if (subscriptionPlan && !Object.values(SubscriptionPlan).includes(subscriptionPlan)) {
    return R.badRequest(res, 'Invalid subscription plan');
  }

  const account = await prisma.ownerAccount.update({
    where: { id: req.params.id },
    data: {
      ...(isActive !== undefined && { isActive }),
      ...(subscriptionActive !== undefined && { subscriptionActive }),
      ...(subscriptionPlan && { subscriptionPlan }),
    },
    select: { id: true, legalName: true, email: true, subscriptionPlan: true, isActive: true, subscriptionActive: true },
  });

  return R.ok(res, account);
}

// GET /api/v1/platform/shops
export async function listShops(req: Request, res: Response) {
  const { search = '', page = '1', limit = '20' } = req.query as Record<string, string>;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const where = search ? {
    OR: [
      { tradingName: { contains: search, mode: 'insensitive' as const } },
      { city:        { contains: search, mode: 'insensitive' as const } },
    ],
  } : {};

  const [shops, total] = await Promise.all([
    prisma.shop.findMany({
      where,
      skip,
      take: parseInt(limit),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, tradingName: true, businessType: true, isActive: true,
        city: true, country: true, currency: true, wizardCompleted: true, createdAt: true,
        ownerAccount: { select: { id: true, legalName: true, email: true } },
      },
    }),
    prisma.shop.count({ where }),
  ]);

  return R.ok(res, shops, { total, page: parseInt(page), limit: parseInt(limit) });
}

// PATCH /api/v1/platform/shops/:id
export async function updateShop(req: Request, res: Response) {
  const { isActive } = req.body;
  const shop = await prisma.shop.update({
    where: { id: req.params.id },
    data: { ...(isActive !== undefined && { isActive }) },
    select: { id: true, tradingName: true, isActive: true },
  });
  return R.ok(res, shop);
}

// GET /api/v1/platform/users
export async function listUsers(req: Request, res: Response) {
  const { search = '', page = '1', limit = '20' } = req.query as Record<string, string>;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const where = {
    role: { not: UserRole.PLATFORM_ADMIN },
    ...(search && {
      OR: [
        { fullName: { contains: search, mode: 'insensitive' as const } },
        { email:    { contains: search, mode: 'insensitive' as const } },
      ],
    }),
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take: parseInt(limit),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, fullName: true, email: true, role: true, isActive: true, lastLoginAt: true, createdAt: true,
        ownerAccount: { select: { id: true, legalName: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);

  return R.ok(res, users, { total, page: parseInt(page), limit: parseInt(limit) });
}

// PATCH /api/v1/platform/users/:id  — activate / deactivate
export async function updateUser(req: Request, res: Response) {
  const { isActive } = req.body;
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: { ...(isActive !== undefined && { isActive }) },
    select: { id: true, fullName: true, email: true, role: true, isActive: true },
  });
  return R.ok(res, user);
}

// POST /api/v1/platform/accounts  — create a new tenant account + owner user
export async function createAccount(req: AuthRequest, res: Response) {
  const { legalName, email, phone, ownerName, ownerEmail, ownerPassword, subscriptionPlan } = req.body;

  if (!legalName || !email || !ownerName || !ownerEmail || !ownerPassword) {
    return R.badRequest(res, 'legalName, email, ownerName, ownerEmail and ownerPassword are required');
  }

  const exists = await prisma.ownerAccount.findUnique({ where: { email } });
  if (exists) return R.conflict(res, 'Account email already registered');

  const ownerExists = await prisma.user.findUnique({ where: { email: ownerEmail } });
  if (ownerExists) return R.conflict(res, 'Owner email already in use');

  const passwordHash = await bcrypt.hash(ownerPassword, 12);

  const account = await prisma.ownerAccount.create({
    data: {
      legalName,
      email,
      phone,
      subscriptionPlan: (subscriptionPlan as SubscriptionPlan) || SubscriptionPlan.STARTER,
      subscriptionActive: true, // platform admin creates accounts pre-approved
      users: {
        create: { fullName: ownerName, email: ownerEmail, passwordHash, role: UserRole.ACCOUNT_OWNER },
      },
    },
    include: { users: { select: { id: true, fullName: true, email: true, role: true } } },
  });

  return R.created(res, account);
}

// POST /api/v1/platform/shops/:shopId/reset
// Wipes all business data for a shop but keeps the shop, account, users, tax rules, and settings.
export async function resetShopData(req: Request, res: Response) {
  const { shopId } = req.params;

  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: { id: true, tradingName: true, ownerAccountId: true },
  });
  if (!shop) return R.notFound(res, 'Shop not found');

  // Cascade order matters — delete children before parents
  await prisma.$transaction([
    // Appointments
    prisma.appointmentService.deleteMany({ where: { appointment: { shopId } } }),
    prisma.appointment.deleteMany({ where: { shopId } }),
    // KDS
    prisma.kdsOrder.deleteMany({ where: { shopId } }),
    // Work orders
    prisma.workOrderPart.deleteMany({ where: { workOrder: { shopId } } }),
    prisma.workOrder.deleteMany({ where: { shopId } }),
    // Hotel
    prisma.roomCharge.deleteMany({ where: { folio: { room: { shopId } } } }),
    prisma.roomFolio.deleteMany({ where: { room: { shopId } } }),
    prisma.room.deleteMany({ where: { shopId } }),
    // Consignment
    prisma.consignmentSale.deleteMany({ where: { shopId } }),
    prisma.consignmentPartner.deleteMany({ where: { shopId } }),
    // Timeclock
    prisma.timeClock.deleteMany({ where: { shopId } }),
    // Transactions
    prisma.transactionPayment.deleteMany({ where: { transaction: { shopId } } }),
    prisma.transactionItem.deleteMany({ where: { transaction: { shopId } } }),
    prisma.transaction.deleteMany({ where: { shopId } }),
    // Customers
    prisma.customer.deleteMany({ where: { shopId } }),
    // Purchase orders
    prisma.purchaseOrderLine.deleteMany({ where: { purchaseOrder: { shopId } } }),
    prisma.purchaseOrder.deleteMany({ where: { shopId } }),
    // Stock
    prisma.stockMovement.deleteMany({ where: { shopId } }),
    prisma.inventoryItem.deleteMany({ where: { product: { shopId } } }),
    // Recipes
    prisma.recipeLine.deleteMany({ where: { recipe: { shopId } } }),
    prisma.recipe.deleteMany({ where: { shopId } }),
    // Suppliers
    prisma.supplier.deleteMany({ where: { shopId } }),
    // Products
    prisma.product.deleteMany({ where: { shopId } }),
    // Audit logs
    prisma.auditLog.deleteMany({ where: { shopId } }),
  ]);

  return R.ok(res, {
    shopId: shop.id,
    tradingName: shop.tradingName,
    message: 'All business data wiped. Shop, account, users and settings retained.',
  });
}
