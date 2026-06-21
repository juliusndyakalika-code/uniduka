import { Response } from 'express';
import { AuthRequest } from '../../types';
import { prisma } from '../../core/prisma';
import * as R from '../../utils/response';

const PLAN_LIMITS = {
  STARTER:    { shops: 1,  branches: 1,  staff: 3,  registers: 1 },
  GROWTH:     { shops: 3,  branches: 3,  staff: 15, registers: 3 },
  BUSINESS:   { shops: 10, branches: 999, staff: 100, registers: 999 },
  ENTERPRISE: { shops: 999, branches: 999, staff: 999, registers: 999 },
};

export async function getAccount(req: AuthRequest, res: Response) {
  const account = await prisma.ownerAccount.findUnique({
    where: { id: req.user!.accountId },
    include: { shops: { select: { id: true, tradingName: true, businessType: true, isActive: true, wizardCompleted: true, configScore: true } } },
  });
  if (!account) return R.notFound(res, 'Account not found');
  const daysRemaining = account.subscriptionExpiresAt
    ? Math.max(0, Math.ceil((account.subscriptionExpiresAt.getTime() - Date.now()) / 86_400_000))
    : null;
  return R.ok(res, { ...account, limits: PLAN_LIMITS[account.subscriptionPlan], daysRemaining });
}

export async function updateAccount(req: AuthRequest, res: Response) {
  const { legalName, phone, billingEmail } = req.body;
  const account = await prisma.ownerAccount.update({
    where: { id: req.user!.accountId },
    data: { legalName, phone, billingEmail },
  });
  return R.ok(res, account);
}

export async function getSubscriptionPlans(_req: AuthRequest, res: Response) {
  return R.ok(res, [
    { plan: 'STARTER',    ...PLAN_LIMITS.STARTER,    price: 0,    label: 'Starter',    support: 'Email' },
    { plan: 'GROWTH',     ...PLAN_LIMITS.GROWTH,     price: 29,   label: 'Growth',     support: 'Priority Chat' },
    { plan: 'BUSINESS',   ...PLAN_LIMITS.BUSINESS,   price: 99,   label: 'Business',   support: 'Dedicated Manager' },
    { plan: 'ENTERPRISE', ...PLAN_LIMITS.ENTERPRISE, price: null, label: 'Enterprise', support: '24/7 Phone SLA' },
  ]);
}

export async function upgradeSubscription(req: AuthRequest, res: Response) {
  const { plan } = req.body;
  if (!['STARTER', 'GROWTH', 'BUSINESS', 'ENTERPRISE'].includes(plan)) return R.badRequest(res, 'Invalid plan');
  const account = await prisma.ownerAccount.update({
    where: { id: req.user!.accountId },
    data: { subscriptionPlan: plan },
  });
  return R.ok(res, { plan: account.subscriptionPlan });
}

export async function getNotifications(req: AuthRequest, res: Response) {
  const shopId = req.user!.shopId;
  if (!shopId) return R.ok(res, { data: [] });

  const [products, debts] = await Promise.all([
    prisma.product.findMany({
      where: { shopId, isActive: true },
      select: { id: true, name: true, reorderPoint: true, inventory: { select: { quantity: true } } },
    }),
    prisma.transaction.findMany({
      where: { shopId, status: 'COMPLETED', payments: { some: { method: 'DEBIT' } } },
      include: { payments: { select: { method: true, amount: true } } },
    }),
  ]);

  const notifications: { id: string; type: string; title: string; body: string; href: string; severity: string }[] = [];

  const lowStockItems = products
    .map(p => ({ ...p, qty: p.inventory.reduce((s, i) => s + i.quantity, 0) }))
    .filter(p => p.qty <= p.reorderPoint)
    .sort((a, b) => a.qty - b.qty)
    .slice(0, 5);

  for (const p of lowStockItems) {
    notifications.push({
      id: `low-stock-${p.id}`,
      type: 'LOW_STOCK',
      title: p.name,
      body: p.qty === 0 ? 'Out of stock' : `${p.qty} unit${p.qty === 1 ? '' : 's'} left`,
      href: '/inventory/products',
      severity: p.qty === 0 ? 'critical' : 'warning',
    });
  }

  const unpaidDebts = debts.filter(tx => {
    const paid = tx.payments.filter(p => p.method !== 'DEBIT').reduce((s, p) => s + p.amount, 0);
    return tx.total - paid > 0;
  });

  if (unpaidDebts.length > 0) {
    const totalOwed = unpaidDebts.reduce((s, tx) => {
      const paid = tx.payments.filter(p => p.method !== 'DEBIT').reduce((a, p) => a + p.amount, 0);
      return s + (tx.total - paid);
    }, 0);
    notifications.push({
      id: `debts-${unpaidDebts.length}`,
      type: 'DEBT',
      title: `${unpaidDebts.length} unpaid debt${unpaidDebts.length === 1 ? '' : 's'}`,
      body: `TZS ${Math.round(totalOwed).toLocaleString()} outstanding`,
      href: '/pos/debts',
      severity: 'info',
    });
  }

  return R.ok(res, { data: notifications });
}

export async function getDashboard(req: AuthRequest, res: Response) {
  const shopId = req.user!.shopId;
  if (!shopId) return R.ok(res, { revenue: { today: 0, week: 0, month: 0 }, transactions: { today: 0, week: 0 }, customers: { total: 0, new: 0 }, lowStock: 0, topProducts: [], recentTransactions: [], salesChart: [] });

  const now = new Date();
  const startOfDay   = new Date(now); startOfDay.setHours(0,0,0,0);
  const startOfWeek  = new Date(now); startOfWeek.setDate(now.getDate() - 7);
  const startOfMonth = new Date(now); startOfMonth.setDate(now.getDate() - 30);
  const startOf14d   = new Date(now); startOf14d.setDate(now.getDate() - 14);

  const [todayAgg, weekAgg, monthAgg, todayTx, weekTx, totalCustomers, newCustomers, products] = await Promise.all([
    prisma.transaction.aggregate({ where: { shopId, status: 'COMPLETED', createdAt: { gte: startOfDay } }, _sum: { total: true } }),
    prisma.transaction.aggregate({ where: { shopId, status: 'COMPLETED', createdAt: { gte: startOfWeek } }, _sum: { total: true }, _count: { id: true } }),
    prisma.transaction.aggregate({ where: { shopId, status: 'COMPLETED', createdAt: { gte: startOfMonth } }, _sum: { total: true } }),
    prisma.transaction.count({ where: { shopId, status: 'COMPLETED', createdAt: { gte: startOfDay } } }),
    prisma.transaction.count({ where: { shopId, status: 'COMPLETED', createdAt: { gte: startOfWeek } } }),
    prisma.customer.count({ where: { shopId } }),
    prisma.customer.count({ where: { shopId, createdAt: { gte: startOfMonth } } }),
    prisma.product.findMany({ where: { shopId, isActive: true }, select: { id: true, name: true, minStockLevel: true, reorderPoint: true, inventory: { select: { quantity: true } } } }),
  ]);

  const lowStock = products.filter(p => {
    const qty = p.inventory.reduce((s, i) => s + i.quantity, 0);
    return qty <= p.reorderPoint;
  }).length;

  const recentTx = await prisma.transaction.findMany({
    where: { shopId, status: 'COMPLETED' },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { id: true, receiptNo: true, total: true, createdAt: true, payments: { select: { method: true }, take: 1 } },
  });

  const topItems = await prisma.transactionItem.groupBy({
    by: ['productId'],
    where: { transaction: { shopId, status: 'COMPLETED', createdAt: { gte: startOfMonth } } },
    _sum: { quantity: true, lineTotal: true },
    orderBy: { _sum: { lineTotal: 'desc' } },
    take: 6,
  });
  const productNames = await prisma.product.findMany({ where: { id: { in: topItems.map(i => i.productId).filter(Boolean) as string[] } }, select: { id: true, name: true } });
  const nameMap = Object.fromEntries(productNames.map(p => [p.id, p.name]));

  // Sales chart: last 14 days
  const dailyTx = await prisma.transaction.findMany({
    where: { shopId, status: 'COMPLETED', createdAt: { gte: startOf14d } },
    select: { total: true, createdAt: true },
  });
  const chartMap: Record<string, number> = {};
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now); d.setDate(now.getDate() - i);
    chartMap[d.toISOString().split('T')[0]] = 0;
  }
  dailyTx.forEach(tx => { const k = tx.createdAt.toISOString().split('T')[0]; if (chartMap[k] !== undefined) chartMap[k] += tx.total; });
  const salesChart = Object.entries(chartMap).map(([date, revenue]) => ({ label: date.slice(5), revenue }));

  return R.ok(res, {
    revenue: { today: todayAgg._sum.total ?? 0, week: weekAgg._sum.total ?? 0, month: monthAgg._sum.total ?? 0 },
    transactions: { today: todayTx, week: weekTx },
    customers: { total: totalCustomers, new: newCustomers },
    lowStock,
    topProducts: topItems.map(i => ({ name: nameMap[i.productId ?? ''] ?? '—', qty: i._sum.quantity ?? 0, revenue: i._sum.lineTotal ?? 0 })),
    recentTransactions: recentTx.map(tx => ({ id: tx.id, receiptNo: tx.receiptNo, total: tx.total, paymentMethod: tx.payments[0]?.method?.toString() ?? 'CASH', createdAt: tx.createdAt })),
    salesChart,
  });
}
