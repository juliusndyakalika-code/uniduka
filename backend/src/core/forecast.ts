import { prisma } from './prisma';

/**
 * When each product runs out, and how much to order.
 *
 * Plain arithmetic on the shop's own sales, no model involved: the rate is
 * what sold over the last four weeks, divided by the days the product was
 * actually on sale. An owner can check every figure by hand, which is the
 * point. A forecast that cannot be explained is not one they will act on.
 *
 *   days left  = stock / daily rate
 *   order qty  = daily rate x (lead time + cover) - stock, rounded up
 *
 * Lead time is how long a supplier takes to deliver; cover is how long the
 * new stock should last once it arrives. Both are deliberately simple
 * defaults until shops can set them per supplier.
 */

export const WINDOW_DAYS = 28;
export const LEAD_DAYS = 7;
export const COVER_DAYS = 14;
/** Days of stock at or below which a product needs ordering now. */
export const URGENT_DAYS = LEAD_DAYS;

export interface ForecastRow {
  productId: string;
  name: string;
  unit: string | null;
  stock: number;
  /** Units sold per day over the window. */
  dailyRate: number;
  soldInWindow: number;
  /** Null when nothing sold: the product is not running out, it is not moving. */
  daysLeft: number | null;
  suggestedQty: number;
  unitCost: number;
  supplierId: string | null;
  supplierName: string | null;
  reorderPoint: number;
  /** Below the shop's own reorder point, or out within the lead time. */
  urgent: boolean;
}

export async function stockForecast(shopId: string, now = new Date()): Promise<ForecastRow[]> {
  const since = new Date(now.getTime() - WINDOW_DAYS * 86_400_000);

  const [products, sold] = await Promise.all([
    prisma.product.findMany({
      where: { shopId, isActive: true, trackStock: true },
      select: {
        id: true, name: true, unit: true, costPrice: true, createdAt: true,
        reorderPoint: true, reorderQty: true,
        supplierId: true, supplier: { select: { name: true } },
        inventory: { select: { quantity: true } },
      },
    }),
    prisma.transactionItem.groupBy({
      by: ['productId'],
      where: { transaction: { shopId, status: 'COMPLETED', createdAt: { gte: since } } },
      _sum: { quantity: true },
    }),
  ]);

  const soldBy = new Map(sold.map(s => [s.productId, s._sum.quantity ?? 0]));

  return products.map(p => {
    const stock = Math.max(0, p.inventory.reduce((s, i) => s + i.quantity, 0));
    const soldInWindow = soldBy.get(p.id) ?? 0;

    // A product added ten days ago has had ten days to sell, not twenty-eight.
    // Floored at a week so one lucky first day does not read as a trend.
    const ageDays = (now.getTime() - p.createdAt.getTime()) / 86_400_000;
    const days = Math.min(WINDOW_DAYS, Math.max(7, ageDays));
    const dailyRate = soldInWindow / days;

    const daysLeft = dailyRate > 0 ? stock / dailyRate : null;
    const need = Math.ceil(dailyRate * (LEAD_DAYS + COVER_DAYS) - stock);
    // The owner's own reorder quantity wins when it asks for more: they may
    // know a case holds 24.
    const suggestedQty = need > 0 ? Math.max(need, p.reorderQty || 0) : 0;

    const belowPoint = p.reorderPoint > 0 && stock <= p.reorderPoint;
    const outSoon = daysLeft !== null && daysLeft <= URGENT_DAYS;

    return {
      productId: p.id,
      name: p.name,
      unit: p.unit,
      stock,
      dailyRate: round(dailyRate, 2),
      soldInWindow,
      daysLeft: daysLeft === null ? null : round(daysLeft, 1),
      suggestedQty: suggestedQty || (belowPoint ? Math.max(p.reorderQty || 0, 1) : 0),
      unitCost: p.costPrice,
      supplierId: p.supplierId,
      supplierName: p.supplier?.name ?? null,
      reorderPoint: p.reorderPoint,
      urgent: belowPoint || outSoon,
    };
  }).sort((a, b) => (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity));
}

const round = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp;
