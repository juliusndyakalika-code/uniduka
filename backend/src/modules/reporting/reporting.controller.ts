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

async function hotelSalesReport(req: AuthRequest, res: Response, range: { gte: Date; lte: Date }, period: string) {
  const folios = await prisma.roomFolio.findMany({
    where: { room: { shopId: shop(req) }, createdAt: range },
    include: { room: { select: { roomType: true, roomNo: true } }, charges: true },
    orderBy: { createdAt: 'asc' },
  });

  const revenue = folios.reduce((s, f) => s + f.grandTotal, 0);
  const folioCount = folios.length;

  // Group by period
  const grouped: Record<string, { date: string; revenue: number; txCount: number; grossProfit: number }> = {};
  for (const folio of folios) {
    const d = folio.createdAt;
    let key: string;
    if (period === 'month') {
      key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    } else if (period === 'week') {
      const wk = new Date(d); wk.setDate(wk.getDate() - wk.getDay()); key = wk.toISOString().slice(0, 10);
    } else {
      key = d.toISOString().slice(0, 10);
    }
    if (!grouped[key]) grouped[key] = { date: key, revenue: 0, txCount: 0, grossProfit: 0 };
    grouped[key].revenue     += folio.grandTotal;
    grouped[key].grossProfit += folio.grandTotal; // no product cost for room stays
    grouped[key].txCount++;
  }

  // Room types as "top products"
  const roomTypeMap: Record<string, { name: string; revenue: number; qty: number }> = {};
  for (const folio of folios) {
    const type = folio.room?.roomType || 'Room';
    if (!roomTypeMap[type]) roomTypeMap[type] = { name: type, revenue: 0, qty: 0 };
    roomTypeMap[type].revenue += folio.grandTotal;
    roomTypeMap[type].qty     += folio.nights;
  }

  // Payment method breakdown: paid vs unpaid
  const paid   = folios.filter(f => f.isPaid).reduce((s, f) => s + f.grandTotal, 0);
  const unpaid = folios.filter(f => !f.isPaid).reduce((s, f) => s + f.grandTotal, 0);
  const byPaymentMethod = [
    { method: 'PAID', label: 'Paid', total: paid, count: folios.filter(f => f.isPaid).length },
    { method: 'UNPAID', label: 'Unpaid / Active', total: unpaid, count: folios.filter(f => !f.isPaid).length },
  ].filter(p => p.count > 0);

  // Operating expenses for the same period → net profit
  const expenseAgg = await prisma.expense.aggregate({
    where: { shopId: shop(req), incurredAt: range },
    _sum: { amount: true },
  });
  const expenses  = expenseAgg._sum.amount ?? 0;
  const grossProfit = revenue; // no product cost for room stays
  const netProfit = grossProfit - expenses;

  // Consignment profit for the same period (kept for parity with the POS report)
  const consignAgg = await prisma.consignmentSale.aggregate({
    where: { shopId: shop(req), soldAt: range },
    _sum: { profit: true },
  });
  const consignmentProfit = consignAgg._sum.profit ?? 0;
  const totalGrossProfit  = grossProfit + consignmentProfit;
  const totalNetProfit    = totalGrossProfit - expenses;

  return R.ok(res, {
    summary: {
      revenue, transactions: folioCount,
      avgTicket: folioCount > 0 ? revenue / folioCount : 0,
      grossProfit,
      debtAmount: unpaid,        // unpaid folios (guests not yet settled)
      debtGrossProfit: unpaid,   // no COGS on rooms, so unpaid profit == unpaid revenue
      expenses, netProfit,
      consignmentProfit, totalGrossProfit, totalNetProfit,
    },
    byDay:           Object.values(grouped),
    byPaymentMethod,
    topProducts:     Object.values(roomTypeMap).sort((a, b) => b.revenue - a.revenue).slice(0, 10),
  });
}

export async function salesReport(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const range = dateRange(req);
    const { period = 'day', paymentMethod } = req.query as Record<string, string>;

    // Hotel/Guesthouse revenue lives in RoomFolio, not Transaction
    const shopData = await prisma.shop.findUnique({ where: { id: shop(req) }, select: { businessType: true } });
    if (shopData?.businessType === 'HOTEL_GUESTHOUSE') {
      return hotelSalesReport(req, res, range, period);
    }

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

    // Summary — revenue = full value of all sales made (accrual basis).
    // A credit sale is still a sale; the unpaid part is tracked separately as debtAmount.
    const revenue = transactions.reduce((s, t) => s + t.total, 0);
    // debtAmount = portion of revenue not yet collected (unpaid credit sales)
    const debtAmount = transactions.reduce((s, t) => {
      const hasDebit = t.payments.some(p => p.method === 'DEBIT');
      if (!hasDebit) return s;
      const received = t.payments.filter(p => p.method !== 'DEBIT').reduce((ps, p) => ps + p.amount, 0);
      return s + Math.max(0, t.total - received);
    }, 0);
    const txCount   = transactions.length;
    const avgTicket = txCount > 0 ? revenue / txCount : 0;
    const grossProfit = transactions.reduce((s, t) => {
      const cost = t.items.reduce((cs, i) => cs + (i.product?.costPrice ?? 0) * i.quantity, 0);
      return s + t.total - cost; // full sale total minus cost of goods sold
    }, 0);
    // Gross profit still tied up in unpaid debt (informational — the profit not yet collected)
    const debtGrossProfit = transactions.reduce((s, t) => {
      const hasDebit = t.payments.some(p => p.method === 'DEBIT');
      if (!hasDebit) return s;
      const received = t.payments.filter(p => p.method !== 'DEBIT').reduce((ps, p) => ps + p.amount, 0);
      const outstanding = Math.max(0, t.total - received);
      if (outstanding <= 0) return s;
      const cost = t.items.reduce((cs, i) => cs + (i.product?.costPrice ?? 0) * i.quantity, 0);
      const marginRate = t.total > 0 ? (t.total - cost) / t.total : 0;
      return s + outstanding * marginRate;
    }, 0);

    // Operating expenses for the same period → net profit
    const expenseAgg = await prisma.expense.aggregate({
      where: { shopId: shop(req), incurredAt: range },
      _sum: { amount: true },
    });
    const expenses  = expenseAgg._sum.amount ?? 0;
    const netProfit = grossProfit - expenses;

    // Consignment profit for the same period (goods sold on behalf of partners).
    // Expenses are deducted once against the combined pool → total net profit.
    const consignAgg = await prisma.consignmentSale.aggregate({
      where: { shopId: shop(req), soldAt: range },
      _sum: { profit: true },
    });
    const consignmentProfit = consignAgg._sum.profit ?? 0;
    const totalGrossProfit  = grossProfit + consignmentProfit;
    const totalNetProfit    = totalGrossProfit - expenses;

    // Stock investment: LOCAL POs in TZS, IMPORT POs converted CNY→TZS via exchangeRate
    // Falls back to orderedAt then createdAt when receivedAt is null (older POs or manual status updates)
    const receivedPOs = await prisma.purchaseOrder.findMany({
      where: {
        shopId: shop(req), status: 'RECEIVED',
        OR: [
          { receivedAt: range },
          { receivedAt: null, orderedAt: range },
          { receivedAt: null, orderedAt: null, createdAt: range },
        ],
      },
      select: { totalAmount: true, type: true, exchangeRate: true },
    });
    const stockPurchased = receivedPOs.reduce((sum, po) => {
      const tzs = po.type === 'IMPORT' && po.exchangeRate
        ? po.totalAmount * po.exchangeRate
        : po.totalAmount;
      return sum + tzs;
    }, 0);

    // Current inventory value at cost — active products only, matching the Inventory Dashboard
    const inventoryItems = await prisma.inventoryItem.findMany({
      where: { shopId: shop(req), product: { isActive: true } },
      select: { quantity: true, costPrice: true },
    });
    const inventoryValue = inventoryItems.reduce((s, i) => s + i.quantity * i.costPrice, 0);

    // Group by period → byDay
    const grouped: Record<string, { date: string; revenue: number; txCount: number; grossProfit: number }> = {};
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
      if (!grouped[key]) grouped[key] = { date: key, revenue: 0, txCount: 0, grossProfit: 0 };
      const txCost     = tx.items.reduce((cs, i) => cs + (i.product?.costPrice ?? 0) * i.quantity, 0);
      grouped[key].revenue     += tx.total;            // full sale value (accrual)
      grouped[key].grossProfit += tx.total - txCost;   // profit on all goods sold
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
      summary: { revenue, transactions: txCount, avgTicket, grossProfit, debtAmount, debtGrossProfit, expenses, netProfit, consignmentProfit, totalGrossProfit, totalNetProfit, stockPurchased, inventoryValue },
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

  // Accumulate qty and value per batch so products with multiple batches
  // (different cost prices) are valued correctly — matches the dashboard's
  // stock investment figure (Σ qty × costPrice per inventory row).
  const stockByProduct: Record<string, number> = {};
  const valueByProduct: Record<string, number> = {};
  for (const i of items) {
    stockByProduct[i.productId] = (stockByProduct[i.productId] ?? 0) + i.quantity;
    valueByProduct[i.productId] = (valueByProduct[i.productId] ?? 0) + i.quantity * i.costPrice;
  }

  const enriched = products.map(p => {
    const stock = stockByProduct[p.id] ?? 0;
    const value = valueByProduct[p.id] ?? 0;
    // Effective (weighted-average) unit cost for display/export
    const costPrice = stock > 0 ? value / stock : p.costPrice;
    return { ...p, stock, value, costPrice };
  });

  const lowStock = enriched
    .filter(p => p.stock <= p.reorderPoint)
    .map(p => ({ id: p.id, name: p.name, sku: p.sku, stock: p.stock, reorderPoint: p.reorderPoint, unit: p.unit ?? 'ea' }));

  const valuation = enriched
    .map(p => ({ name: p.name, stock: p.stock, costPrice: p.costPrice, value: p.value }))
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

  // Hotel: group folios by receptionist (checkedInBy) instead of POS cashier
  const shopData = await prisma.shop.findUnique({ where: { id: shop(req) }, select: { businessType: true } });
  if (shopData?.businessType === 'HOTEL_GUESTHOUSE') {
    const folios = await prisma.roomFolio.findMany({
      where: { room: { shopId: shop(req) }, createdAt: range },
    });
    const map: Record<string, { userId: string; fullName: string; role: string; transactionCount: number; revenue: number; grossProfit: number }> = {};
    for (const f of folios) {
      const id = f.checkedInBy ?? 'unknown';
      if (!map[id]) map[id] = { userId: id, fullName: f.checkedInByName ?? 'Unknown', role: 'CASHIER', transactionCount: 0, revenue: 0, grossProfit: 0 };
      map[id].transactionCount++;
      map[id].revenue     += f.grandTotal;
      map[id].grossProfit += f.grandTotal;
    }
    return R.ok(res, Object.values(map).map(s => ({ ...s, avgTicket: s.transactionCount > 0 ? s.revenue / s.transactionCount : 0 })));
  }

  const transactions = await prisma.transaction.findMany({
    where: { shopId: shop(req), status: 'COMPLETED', createdAt: range },
    include: {
      items: { include: { product: { select: { costPrice: true } } } },
      cashier: { select: { id: true, fullName: true, role: true } },
    },
  });

  const map: Record<string, { userId: string; fullName: string; role: string; transactionCount: number; revenue: number; grossProfit: number }> = {};
  for (const tx of transactions) {
    const id = tx.cashierId;
    if (!map[id]) {
      map[id] = {
        userId: id,
        fullName: tx.cashier?.fullName ?? 'Unknown',
        role: (tx.cashier?.role as string) ?? 'CASHIER',
        transactionCount: 0,
        revenue: 0,
        grossProfit: 0,
      };
    }
    const cost = tx.items.reduce((s, i) => s + (i.product?.costPrice ?? 0) * i.quantity, 0);
    map[id].transactionCount++;
    map[id].revenue      += tx.total;
    map[id].grossProfit  += tx.total - cost;
  }

  const result = Object.values(map).map(s => ({
    ...s,
    avgTicket: s.transactionCount > 0 ? s.revenue / s.transactionCount : 0,
  }));
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
