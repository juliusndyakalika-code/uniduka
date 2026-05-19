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
    const { period = 'day' } = req.query as Record<string, string>;

    const transactions = await prisma.transaction.findMany({
      where: { shopId: shop(req), status: 'COMPLETED', createdAt: range },
      include: {
        items: { include: { product: { select: { costPrice: true } } } },
        payments: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    // Summary
    const revenue   = transactions.reduce((s, t) => s + t.total, 0);
    const txCount   = transactions.length;
    const avgTicket = txCount > 0 ? revenue / txCount : 0;
    const grossProfit = transactions.reduce((s, t) => {
      const cost = t.items.reduce((cs, i) => cs + (i.product?.costPrice ?? 0) * i.quantity, 0);
      return s + t.total - cost;
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
      grouped[key].revenue += tx.total;
      grouped[key].txCount++;
    }

    // Payment methods → array
    const pmMap: Record<string, { method: string; total: number; count: number }> = {};
    for (const tx of transactions) {
      for (const p of tx.payments) {
        if (!pmMap[p.method]) pmMap[p.method] = { method: p.method, total: 0, count: 0 };
        pmMap[p.method].total  += p.amount;
        pmMap[p.method].count  += 1;
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
  const [stock, lowStock, expiring, movements] = await Promise.all([
    prisma.inventoryItem.findMany({ where: { shopId: shop(req) }, include: { product: { select: { name: true, sku: true, sellPrice: true, costPrice: true } } } }),
    prisma.product.findMany({ where: { shopId: shop(req), isActive: true, reorderPoint: { gt: 0 } } }),
    prisma.inventoryItem.findMany({ where: { shopId: shop(req), expiryDate: { lte: new Date(Date.now() + 30 * 86400000), gte: new Date() } }, include: { product: { select: { name: true } } }, orderBy: { expiryDate: 'asc' } }),
    prisma.stockMovement.findMany({ where: { shopId: shop(req), createdAt: dateRange(req) }, include: { product: { select: { name: true } } }, take: 100 }),
  ]);
  const stockValue = stock.reduce((s, i) => s + i.quantity * i.costPrice, 0);
  return R.ok(res, { stock, stockValue, lowStock: lowStock.length, expiring, movements });
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
  const users = await prisma.user.findMany({ where: { id: { in: staffIds } }, select: { id: true, fullName: true } });
  const result = byStaff.map(s => ({ ...s, name: users.find(u => u.id === s.cashierId)?.fullName || 'Unknown' }));
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
