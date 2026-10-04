import { Response } from 'express';
import { AuthRequest } from '../../types';
import { prisma } from '../../core/prisma';
import * as R from '../../utils/response';

/**
 * One search across the things a shop actually looks for mid-shift.
 *
 * Pages and commands are matched in the browser, because they are a fixed
 * list and a round trip to find "Expenses" would be slower than the typing.
 * This endpoint is only for the records: products, customers and receipts.
 *
 * Everything is scoped to the shop in the token. The caller does not get to
 * name the shop, because a search box is exactly the sort of place a shop id
 * would otherwise be accepted from.
 */

const shop = (req: AuthRequest) => req.user!.shopId!;

/** Short enough to be fast, long enough that one letter does not scan a table. */
const MIN_QUERY = 2;
const PER_TYPE = 5;

export async function search(req: AuthRequest, res: Response) {
  const q = String(req.query.q ?? '').trim();
  if (q.length < MIN_QUERY) return R.ok(res, { products: [], customers: [], receipts: [] });

  const shopId = shop(req);
  const like = { contains: q, mode: 'insensitive' as const };

  const [products, customers, receipts] = await Promise.all([
    prisma.product.findMany({
      where: {
        shopId, isActive: true,
        OR: [{ name: like }, { sku: like }, { barcode: like }],
      },
      select: {
        id: true, name: true, sku: true, barcode: true, sellPrice: true,
        inventory: { select: { quantity: true } },
      },
      take: PER_TYPE,
      orderBy: { name: 'asc' },
    }),
    prisma.customer.findMany({
      where: { shopId, isActive: true, OR: [{ fullName: like }, { phone: like }] },
      select: { id: true, fullName: true, phone: true, totalSpend: true },
      take: PER_TYPE,
      orderBy: { fullName: 'asc' },
    }),
    // A receipt is looked up by its number, or by who it was for when the
    // number is the thing that has been lost.
    prisma.transaction.findMany({
      where: {
        shopId,
        OR: [{ receiptNo: like }, { customerName: like }, { customer: { fullName: like } }],
      },
      select: {
        id: true, receiptNo: true, total: true, status: true, createdAt: true,
        customerName: true, customer: { select: { fullName: true } },
      },
      take: PER_TYPE,
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  return R.ok(res, {
    products: products.map(p => ({
      id: p.id, name: p.name, sku: p.sku, barcode: p.barcode, price: p.sellPrice,
      stock: p.inventory.reduce((s, i) => s + i.quantity, 0),
    })),
    customers: customers.map(c => ({
      id: c.id, name: c.fullName, phone: c.phone, totalSpend: c.totalSpend,
    })),
    receipts: receipts.map(t => ({
      id: t.id, receiptNo: t.receiptNo, total: t.total, status: t.status,
      createdAt: t.createdAt, who: t.customer?.fullName ?? t.customerName ?? null,
    })),
  });
}
