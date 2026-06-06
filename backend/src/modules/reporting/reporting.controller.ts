import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../types';
import { prisma } from '../../core/prisma';
import * as R from '../../utils/response';

const shop = (req: AuthRequest) => req.user!.shopId!;
const dateRange = (req: AuthRequest) => {
  const { from, to } = req.query as Record<string, string>;
  const start = from ? new Date(`${from}T00:00:00.000Z`) : new Date(Date.now() - 30 * 86_400_000);
  // end = end-of-day so a single-day range includes all transactions on that day
  const end = to ? new Date(`${to}T23:59:59.999Z`) : new Date();
  return { gte: start, lte: end };
};

export async function dashboardStats(req: AuthRequest, res: Response) {
  const range = dateRange(req);
  const [txAgg, txCount, customerCount, lowStockCount, topProducts] = await Promise.all([
    prisma.transaction.aggregate({ where: { shopId: shop(req), status: 'COMPLETED', createdAt: range }, _sum: { total: true, taxAmount: true, discountAmount: true } }),
    prisma.transaction.count({ where: { shopId: shop(req), status: 'COMPLETED', createdAt: range } }),
    prisma.customer.count({ where: { shopId: shop(req), isActive: true } }),
    prisma.product.count({ where: { shopId: shop(req), isActive: true } }),
    prisma.transactionItem.groupBy({ by: ['productId', 'name'], where: { transaction: { shopId: shop(req), status: 'COMPLETED', createdAt: range } }, _sum: { quantity: true, lineTotal: true }, orderBy: { _sum: { lineTotal: 'desc' } }, take: 5 }),
  ]);
  return R.ok(res, {
    revenue: txAgg._sum.total ?? 0,
    tax: txAgg._sum.taxAmount ?? 0,
    discounts: txAgg._sum.discountAmount ?? 0,
    transactions: txCount,
    customers: customerCount,
    products: lowStockCount,
    topProducts,
  });
}

export async function salesReport(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const range = dateRange(req);
    const { period = 'day', paymentMethod } = req.query as Record<string, string>;

    const transactions = await prisma.transaction.findMany({
      where: {
        shopId: shop(req),
        status: 'COMPLETED',
        createdAt: range,
        ...(paymentMethod && { payments: { some: { method: paymentMethod as never } } }),
      },
      include: {
        items: { include: { product: { select: { costPrice: true } } } },
        payments: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    // Summary — revenue = actual cash received (sum of non-DEBIT payments)
    // DEBIT transactions only count when settlement payments exist
    const revenue = transactions.reduce((s, t) => {
      const received = t.payments.filter(p => p.method !== 'DEBIT').reduce((ps, p) => ps + p.amount, 0);
      // If no DEBIT payment exists, it's a normal sale — use total
      const hasDebit = t.payments.some(p => p.method === 'DEBIT');
      return s + (hasDebit ? received : t.total);
    }, 0);
    const txCount   = transactions.length;
    const avgTicket = txCount > 0 ? revenue / txCount : 0;
    const grossProfit = transactions.reduce((s, t) => {
      const hasDebit  = t.payments.some(p => p.method === 'DEBIT');
      const received  = t.payments.filter(p => p.method !== 'DEBIT').reduce((ps, p) => ps + p.amount, 0);
      const txRevenue = hasDebit ? received : t.total;
      const cost      = t.items.reduce((cs, i) => cs + (i.product?.costPrice ?? 0) * i.quantity, 0);
      return s + txRevenue - cost;
    }, 0);

    // Group by period → byDay
    const grouped: Record<string, { date: string; revenue: number; txCount: number }> = {};
    for (const tx of transactions) {
      const d = tx.createdAt;
      let key: string;
      if (period === 'month') {
        key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      } else if (period === 'week') {
        const wk = new Date(d); wk.setDate(wk.getDate() - wk.getDay()); key = wk.toISOString().slice(0, 10);
      } else {
        key = d.toISOString().slice(0, 10);
      }
      if (!grouped[key]) grouped[key] = { date: key, revenue: 0, txCount: 0 };
      const txHasDebit   = tx.payments.some(p => p.method === 'DEBIT');
      const txReceived   = tx.payments.filter(p => p.method !== 'DEBIT').reduce((s, p) => s + p.amount, 0);
      grouped[key].revenue += txHasDebit ? txReceived : tx.total;
      grouped[key].txCount++;
    }

    // Payment methods → array (use providerName for mobile money display label)
    const pmMap: Record<string, { method: string; label: string; total: number; count: number }> = {};
    for (const tx of transactions) {
      for (const p of tx.payments) {
        // For mobile money, group by provider name; for debit use tx.total (not p.amount which is 0)
        const label = p.method === 'MOBILE_MONEY' && p.providerName ? p.providerName : p.method;
        const amount = p.method === 'DEBIT' ? 0 : p.amount;
        if (!pmMap[label]) pmMap[label] = { method: p.method, label, total: 0, count: 0 };
        pmMap[label].total += amount;
        pmMap[label].count += 1;
      }
    }

    // Top products by revenue
    const productMap: Record<string, { name: string; revenue: number; qty: number }> = {};
    for (const tx of transactions) {
      for (const item of tx.items) {
        if (!productMap[item.name]) productMap[item.name] = { name: item.name, revenue: 0, qty: 0 };
        productMap[item.name].revenue += item.lineTotal;
        productMap[item.name].qty     += item.quantity;
      }
    }
    const topProducts = Object.values(productMap).sort((a, b) => b.revenue - a.revenue).slice(0, 10);

    return R.ok(res, {
      summary:         { revenue, transactions: txCount, avgTicket, grossProfit },
      byDay:           Object.values(grouped),
      byPaymentMethod: Object.values(pmMap),
      topProducts,
    });
  } catch (err) { next(err); }
}

export async function inventoryReport(req: AuthRequest, res: Response) {
  const sid = shop(req);

  const [items, products, expiringItems] = await Promise.all([
    prisma.inventoryItem.findMany({
      where: { shopId: sid },
      select: { productId: true, quantity: true, costPrice: true, expiryDate: true, batchNo: true },
    }),
    prisma.product.findMany({
      where: { shopId: sid, isActive: true },
      select: { id: true, name: true, sku: true, unit: true, costPrice: true, reorderPoint: true },
    }),
    prisma.inventoryItem.findMany({
      where: { shopId: sid, expiryDate: { lte: new Date(Date.now() + 30 * 86_400_000), gte: new Date() } },
      include: { product: { select: { name: true } } },
      orderBy: { expiryDate: 'asc' },
    }),
  ]);

  const stockByProduct: Record<string, number> = {};
  const costByProduct: Record<string, number> = {};
  for (const i of items) {
    stockByProduct[i.productId] = (stockByProduct[i.productId] ?? 0) + i.quantity;
    costByProduct[i.productId]  = i.costPrice;
  }

  const enriched = products.map(p => ({
    ...p,
    stock:     stockByProduct[p.id] ?? 0,
    costPrice: costByProduct[p.id]  ?? p.costPrice,
  }));

  const lowStock = enriched
    .filter(p => p.stock <= p.reorderPoint)
    .map(p => ({ id: p.id, name: p.name, sku: p.sku, stock: p.stock, reorderPoint: p.reorderPoint, unit: p.unit ?? 'ea' }));

  const valuation = enriched
    .map(p => ({ name: p.name, stock: p.stock, costPrice: p.costPrice, value: p.stock * p.costPrice }))
    .sort((a, b) => b.value - a.value);

  return R.ok(res, {
    summary: {
      totalProducts:   products.length,
      totalValue:      valuation.reduce((s, p) => s + p.value, 0),
      lowStockCount:   lowStock.length,
      outOfStockCount: enriched.filter(p => p.stock <= 0).length,
    },
    lowStock,
    expiring: expiringItems.map(i => ({
      id: i.id, name: i.product.name, batchNo: i.batchNo ?? undefined,
      qty: i.quantity, expiresAt: i.expiryDate!.toISOString(),
    })),
    valuation,
  });
}

export async function staffReport(req: AuthRequest, res: Response) {
  const range = dateRange(req);
  const byStaff = await prisma.transaction.groupBy({
    by: ['cashierId'],
    where: { shopId: shop(req), status: 'COMPLETED', createdAt: range },
    _sum: { total: true },
    _count: { id: true },
  });
  const staffIds = byStaff.map(s => s.cashierId);
  const users = await prisma.user.findMany({ where: { id: { in: staffIds } }, select: { id: true, fullName: true, role: true } });
  const result = byStaff.map(s => {
    const u = users.find(u => u.id === s.cashierId);
    return {
      userId: s.cashierId,
      fullName: u?.fullName || 'Unknown',
      role: u?.role || 'CASHIER',
      transactionCount: s._count.id,
      revenue: s._sum.total ?? 0,
      avgTicket: s._count.id > 0 ? (s._sum.total ?? 0) / s._count.id : 0,
    };
  });
  return R.ok(res, result);
}

export async function businessTypeReport(req: AuthRequest, res: Response) {
  const shopData = await prisma.shop.findUnique({ where: { id: shop(req) }, select: { businessType: true } });
  const type = shopData?.businessType;
  const range = dateRange(req);

  if (type === 'RESTAURANT' || type === 'CAFE_QSR') {
    const covers = await prisma.transaction.aggregate({ where: { shopId: shop(req), createdAt: range }, _sum: { coverCount: true }, _avg: { total: true } });
    return R.ok(res, { type, covers: covers._sum.coverCount, avgCheck: covers._avg.total });
  }
  if (type === 'SALON_SPA' || type === 'CLINIC_MEDICAL') {
    const appts = await prisma.appointment.findMany({ where: { shopId: shop(req), startTime: { gte: range.gte, lte: range.lte } }, include: { services: true } });
    return R.ok(res, { type, appointments: appts.length, completed: appts.filter(a => a.status === 'COMPLETED').length });
  }
  if (type === 'REPAIR_WORKSHOP') {
    const jobs = await prisma.workOrder.findMany({ where: { shopId: shop(req), createdAt: range } });
    return R.ok(res, { type, jobs: jobs.length, completed: jobs.filter(j => j.status === 'COMPLETED').length });
  }
  if (type === 'HOTEL_GUESTHOUSE') {
    const folios = await prisma.roomFolio.findMany({ where: { room: { shopId: shop(req) }, createdAt: range } });
    return R.ok(res, { type, checkins: folios.length, revenue: folios.reduce((s, f) => s + f.grandTotal, 0) });
  }
  if (type === 'PHARMACY_CHEMIST') {
    const rx = await prisma.transaction.count({ where: { shopId: shop(req), createdAt: range, rxRef: { not: null } } });
    return R.ok(res, { type, rxTransactions: rx });
  }
  return R.ok(res, { type, message: 'Standard sales data applies' });
}
