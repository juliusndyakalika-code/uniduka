/**
 * The marketplace: every live MauzoHalisi store's listed products in one
 * place, at /shops.
 *
 * Same rules as the single-store API (live stores and published products
 * only, nothing internal exposed, money from the database). Two things are
 * particular to a marketplace:
 *
 *   Random but stable. The client sends a seed, chosen once per page load:
 *   ordering by md5(id || seed) shuffles differently on every reload, yet
 *   "Load more" continues the same shuffle instead of repeating products.
 *
 *   Mixed across shops. Products are dealt round-robin, one per shop per
 *   round, so a shop with 500 products does not fill the first screen and
 *   a shop with five still gets seen. Within a shop, ones with a photo come
 *   first, because a grid of placeholders sells nothing.
 *
 * Search matches every word against the name, category, brand and
 * description, and against the photo's look tags (its colours, plus AI
 * descriptions when a key is configured).
 */
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../core/prisma';
import * as R from '../../utils/response';
import { publicProduct, liveShop } from './storefront.controller';

/** Live stores, the same definition as liveWhere(), as SQL for the raw queries. */
const LIVE = Prisma.sql`
  SELECT s.id FROM shops s JOIN owner_accounts o ON o.id = s."ownerAccountId"
  WHERE s."storefrontEnabled" AND s."isActive" AND s.slug IS NOT NULL
    AND o."isActive" AND o."suspendedAt" IS NULL AND o."subscriptionActive"
    AND (o."subscriptionExpiresAt" IS NULL OR o."subscriptionExpiresAt" > now())`;

const seedOf = (raw: unknown) => String(raw ?? '').replace(/[^a-z0-9]/gi, '').slice(0, 16) || 'mauzo';
const pageOf = (raw: unknown) => Math.max(1, Math.min(200, Number(raw) || 1));

/** The words a search is made of: lowercase, at most six, no wildcards. */
function words(q: unknown): string[] {
  return String(q ?? '').toLowerCase().replace(/[%_\\]/g, ' ').split(/\s+/).filter(w => w.length >= 2).slice(0, 6);
}

const productSelect = {
  id: true, name: true, publicName: true, description: true, imageUrl: true,
  category: true, brand: true, unit: true,
  sellPrice: true, publicPrice: true, trackStock: true,
  inventory: { select: { quantity: true } },
  image: { select: { status: true } },
  shop: { select: { slug: true, tradingName: true, city: true, currency: true } },
} as const;

// ── GET /public/market/products?seed=&page=&q=&category= ─────────────────────
export async function marketProducts(req: Request, res: Response) {
  const seed = seedOf(req.query.seed);
  const page = pageOf(req.query.page);
  const take = 24;
  const category = String(req.query.category ?? '').trim().slice(0, 60);
  const terms = words(req.query.q);

  const conditions: Prisma.Sql[] = [
    Prisma.sql`p."isPublished" AND p."isActive"`,
    Prisma.sql`p."shopId" IN (${LIVE})`,
  ];
  if (category) conditions.push(Prisma.sql`p.category = ${category}`);
  for (const t of terms) {
    const like = `%${t}%`;
    conditions.push(Prisma.sql`(
      p.name ILIKE ${like} OR p."publicName" ILIKE ${like} OR p.category ILIKE ${like} OR p.brand ILIKE ${like} OR p.description ILIKE ${like}
      OR (pi.status = 'APPROVED' AND ${t} = ANY(pi.tags))
    )`);
  }

  // One more than a page, to know whether there is a next one without a count.
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT p.id
    FROM products p
    LEFT JOIN product_images pi ON pi."productId" = p.id
    WHERE ${Prisma.join(conditions, ' AND ')}
    ORDER BY
      row_number() OVER (
        PARTITION BY p."shopId"
        ORDER BY (pi.status = 'APPROVED') DESC NULLS LAST, md5(p.id || ${seed})
      ),
      md5(p.id || ${seed})
    LIMIT ${take + 1} OFFSET ${(page - 1) * take}`;

  const ids = rows.slice(0, take).map(r => r.id);
  const found = await prisma.product.findMany({ where: { id: { in: ids } }, select: productSelect });
  const byId = new Map(found.map(p => [p.id, p]));

  return R.ok(res, ids.map(id => byId.get(id)).filter(Boolean).map(p => ({
    ...publicProduct(p!),
    shop: { slug: p!.shop.slug, name: p!.shop.tradingName, city: p!.shop.city, currency: p!.shop.currency },
  })), { page, hasMore: rows.length > take });
}

// ── GET /public/market/shops?seed=&page= ─────────────────────────────────────
export async function marketShops(req: Request, res: Response) {
  const seed = seedOf(req.query.seed);
  const page = pageOf(req.query.page);
  const take = 5;

  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT s.id FROM shops s
    WHERE s.id IN (${LIVE})
      AND EXISTS (SELECT 1 FROM products p WHERE p."shopId" = s.id AND p."isPublished" AND p."isActive")
    ORDER BY md5(s.id || ${seed})
    LIMIT ${take + 1} OFFSET ${(page - 1) * take}`;
  const ids = rows.slice(0, take).map(r => r.id);

  const shops = await prisma.shop.findMany({
    where: { id: { in: ids } },
    select: {
      id: true, slug: true, tradingName: true, storefrontBio: true, logoUrl: true,
      city: true, region: true, acceptsDelivery: true, acceptsPickup: true, deliveryFee: true, currency: true,
      _count: { select: { products: { where: { isPublished: true, isActive: true } } } },
      products: {
        where: { isPublished: true, isActive: true, image: { status: 'APPROVED' } },
        select: { imageUrl: true }, take: 4, orderBy: { updatedAt: 'desc' },
      },
    },
  });
  const byId = new Map(shops.map(s => [s.id, s]));

  return R.ok(res, ids.map(id => byId.get(id)).filter(Boolean).map(s => ({
    slug: s!.slug, name: s!.tradingName, bio: s!.storefrontBio, logoUrl: s!.logoUrl,
    city: s!.city, region: s!.region,
    acceptsDelivery: s!.acceptsDelivery, acceptsPickup: s!.acceptsPickup,
    deliveryFee: s!.deliveryFee, currency: s!.currency,
    productCount: s!._count.products,
    previews: s!.products.map(p => p.imageUrl),
  })), { page, hasMore: rows.length > take });
}

// ── GET /public/market/categories ────────────────────────────────────────────
/** The categories shoppers can browse, most stocked first. */
export async function marketCategories(_req: Request, res: Response) {
  const rows = await prisma.$queryRaw<{ category: string; n: bigint }[]>`
    SELECT p.category, count(*) AS n
    FROM products p
    WHERE p."isPublished" AND p."isActive" AND p.category IS NOT NULL AND p.category <> ''
      AND p."shopId" IN (${LIVE})
    GROUP BY p.category
    ORDER BY n DESC, p.category
    LIMIT 24`;
  const stats = await prisma.$queryRaw<{ shops: bigint; products: bigint }[]>`
    SELECT count(DISTINCT p."shopId") AS shops, count(*) AS products
    FROM products p
    WHERE p."isPublished" AND p."isActive" AND p."shopId" IN (${LIVE})`;
  return R.ok(res, {
    categories: rows.map(r => ({ name: r.category, count: Number(r.n) })),
    shops: Number(stats[0]?.shops ?? 0),
    products: Number(stats[0]?.products ?? 0),
  });
}

// ── GET /public/shops/:slug/products/:id ─────────────────────────────────────
/** One listed product, so a marketplace tap can open it inside its store. */
export async function publicProductById(req: Request, res: Response) {
  const shop = await liveShop(req.params.slug);
  if (!shop) return R.notFound(res, 'Storefront not found');
  const p = await prisma.product.findFirst({
    where: { id: req.params.id, shopId: shop.id, isPublished: true, isActive: true },
    select: productSelect,
  });
  if (!p) return R.notFound(res, 'Product not found');
  return R.ok(res, publicProduct(p));
}
