/**
 * PUBLIC storefront API — the only unauthenticated surface in the app.
 *
 * Everything here is reachable by anyone on the internet, so three rules hold
 * throughout:
 *   1. Only ever read from shops with storefrontEnabled AND isActive, and only
 *      products with isPublished AND isActive. Opt-in, never opt-out.
 *   2. Never leak internal fields — costPrice, margins, supplier, exact stock
 *      counts, staff names, or any id that isn't needed to place an order.
 *   3. Never trust client-supplied money. Prices and totals are always
 *      recomputed from the database.
 */
import { Request, Response } from 'express';
import { prisma } from '../../core/prisma';
import { io } from '../../app';
import * as R from '../../utils/response';

const LOW_STOCK_THRESHOLD = 5;
const ORDER_TTL_HOURS     = 48;

function orderNo() {
  return `ORD-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

/** Normalise a TZ phone number so "0712…", "+255712…" and "255712…" match. */
function normalisePhone(raw: string): string {
  const digits = String(raw).replace(/\D/g, '');
  if (digits.startsWith('255')) return `+${digits}`;
  if (digits.startsWith('0'))   return `+255${digits.slice(1)}`;
  if (digits.length === 9)      return `+255${digits}`;
  return `+${digits}`;
}

function isValidPhone(raw: string): boolean {
  return /^\+\d{10,15}$/.test(normalisePhone(raw));
}

/** The public shape of a product. Deliberately narrow. */
function publicProduct(
  p: { id: string; name: string; description: string | null; imageUrl: string | null;
       category: string | null; brand: string | null; unit: string | null;
       sellPrice: number; publicPrice: number | null; trackStock: boolean;
       inventory: { quantity: number }[] },
) {
  const stock = p.inventory.reduce((s, i) => s + i.quantity, 0);
  return {
    id:          p.id,
    name:        p.name,
    description: p.description,
    imageUrl:    p.imageUrl,
    category:    p.category,
    brand:       p.brand,
    unit:        p.unit ?? 'pcs',
    price:       p.publicPrice ?? p.sellPrice,
    // Availability only — never the actual count.
    inStock:  p.trackStock ? stock > 0 : true,
    lowStock: p.trackStock && stock > 0 && stock <= LOW_STOCK_THRESHOLD,
  };
}

/** Look up a live storefront by slug, or null. */
async function liveShop(slug: string) {
  return prisma.shop.findFirst({
    where: { slug, storefrontEnabled: true, isActive: true },
  });
}

// ── GET /public/shops/:slug ──────────────────────────────────────────────────
export async function getStorefront(req: Request, res: Response) {
  const shop = await liveShop(req.params.slug);
  if (!shop) return R.notFound(res, 'Storefront not found');

  const categories = await prisma.product.findMany({
    where: { shopId: shop.id, isPublished: true, isActive: true, category: { not: null } },
    select: { category: true },
    distinct: ['category'],
  });

  return R.ok(res, {
    slug:         shop.slug,
    name:         shop.tradingName,
    bio:          shop.storefrontBio,
    logoUrl:      shop.logoUrl,
    bannerUrl:    shop.storefrontBanner,
    phone:        shop.phone,
    city:         shop.city,
    region:       shop.region,
    addressLine1: shop.addressLine1,
    currency:     shop.currency,
    businessType: shop.businessType,
    acceptsDelivery: shop.acceptsDelivery,
    acceptsPickup:   shop.acceptsPickup,
    deliveryFee:     shop.deliveryFee,
    deliveryNote:    shop.deliveryNote,
    minOrderValue:   shop.minOrderValue,
    categories: categories.map(c => c.category).filter(Boolean),
  });
}

// ── GET /public/shops/:slug/products ─────────────────────────────────────────
export async function listPublicProducts(req: Request, res: Response) {
  const shop = await liveShop(req.params.slug);
  if (!shop) return R.notFound(res, 'Storefront not found');

  const { search, category, page = '1', limit = '24' } = req.query as Record<string, string>;
  const take = Math.min(Number(limit) || 24, 48);   // cap page size — public endpoint
  const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

  const where = {
    shopId: shop.id,
    isPublished: true,
    isActive: true,
    ...(category && { category }),
    ...(search && {
      OR: [
        { name:  { contains: search, mode: 'insensitive' as const } },
        { brand: { contains: search, mode: 'insensitive' as const } },
      ],
    }),
  };

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      select: {
        id: true, name: true, description: true, imageUrl: true,
        category: true, brand: true, unit: true,
        sellPrice: true, publicPrice: true, trackStock: true,
        inventory: { select: { quantity: true } },
      },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
      skip, take,
    }),
    prisma.product.count({ where }),
  ]);

  return R.ok(res, products.map(publicProduct), {
    total, page: Number(page) || 1, limit: take, pages: Math.ceil(total / take),
  });
}

// ── POST /public/shops/:slug/orders ──────────────────────────────────────────
export async function placeOrder(req: Request, res: Response) {
  const shop = await liveShop(req.params.slug);
  if (!shop) return R.notFound(res, 'Storefront not found');

  const { buyerName, buyerPhone, buyerEmail, fulfilment, deliveryAddress, note, items } = req.body ?? {};

  if (!buyerName || String(buyerName).trim().length < 2) return R.badRequest(res, 'Your name is required');
  if (!buyerPhone || !isValidPhone(buyerPhone))          return R.badRequest(res, 'A valid phone number is required');
  if (!Array.isArray(items) || items.length === 0)       return R.badRequest(res, 'Your cart is empty');
  if (items.length > 50)                                 return R.badRequest(res, 'Too many items in one order');

  const mode: 'DELIVERY' | 'PICKUP' = fulfilment === 'PICKUP' ? 'PICKUP' : 'DELIVERY';
  if (mode === 'DELIVERY' && !shop.acceptsDelivery) return R.badRequest(res, 'This shop does not offer delivery');
  if (mode === 'PICKUP'   && !shop.acceptsPickup)   return R.badRequest(res, 'This shop does not offer pickup');
  if (mode === 'DELIVERY' && !String(deliveryAddress ?? '').trim()) {
    return R.badRequest(res, 'A delivery address is required');
  }

  // Collapse duplicate lines, and reject malformed quantities up front.
  const wanted = new Map<string, number>();
  for (const line of items) {
    const id  = String(line?.productId ?? '');
    const qty = Number(line?.quantity);
    if (!id) return R.badRequest(res, 'Invalid item in cart');
    if (!Number.isFinite(qty) || qty <= 0 || qty > 1000) {
      return R.badRequest(res, 'Invalid quantity in cart');
    }
    wanted.set(id, (wanted.get(id) ?? 0) + qty);
  }

  // Re-read every product from the database. Client-supplied prices are ignored.
  const products = await prisma.product.findMany({
    where: { id: { in: [...wanted.keys()] }, shopId: shop.id, isPublished: true, isActive: true },
    select: {
      id: true, name: true, unit: true, sellPrice: true, publicPrice: true,
      trackStock: true, inventory: { select: { quantity: true } },
    },
  });
  if (products.length !== wanted.size) {
    return R.badRequest(res, 'Some items are no longer available. Please refresh and try again.');
  }

  const orderItems = [];
  for (const p of products) {
    const qty = wanted.get(p.id)!;
    // Soft availability check. Stock is NOT reserved here — an unaccepted order
    // must never move real inventory, or fake orders could empty the shop's POS.
    if (p.trackStock) {
      const stock = p.inventory.reduce((s, i) => s + i.quantity, 0);
      if (stock <= 0) return R.badRequest(res, `${p.name} is out of stock`);
    }
    const unitPrice = p.publicPrice ?? p.sellPrice;
    orderItems.push({
      productId: p.id,
      name:      p.name,
      quantity:  qty,
      unitLabel: p.unit ?? 'pcs',
      unitPrice,
      lineTotal: unitPrice * qty,
    });
  }

  const subtotal    = orderItems.reduce((s, i) => s + i.lineTotal, 0);
  const deliveryFee = mode === 'DELIVERY' ? shop.deliveryFee : 0;

  if (shop.minOrderValue > 0 && subtotal < shop.minOrderValue) {
    return R.badRequest(res, `Minimum order for this shop is ${shop.minOrderValue.toLocaleString()} ${shop.currency}`);
  }

  const phone = normalisePhone(buyerPhone);

  // Opportunistically link to an existing CRM record for this shop so repeat
  // buyers accumulate history. Never creates one — that happens on fulfilment.
  const existingCustomer = await prisma.customer.findFirst({
    where: { shopId: shop.id, phone },
    select: { id: true },
  });

  const order = await prisma.order.create({
    data: {
      shopId:   shop.id,
      orderNo:  orderNo(),
      // No SMS provider is wired up yet, so orders land straight in the shop's
      // inbox as PENDING. Once OTP is live this becomes PENDING_VERIFICATION
      // and phoneVerified gates the transition.
      status:   'PENDING',
      fulfilment: mode,
      buyerName:  String(buyerName).trim().slice(0, 120),
      buyerPhone: phone,
      buyerEmail: buyerEmail ? String(buyerEmail).trim().slice(0, 160) : null,
      customerId: existingCustomer?.id ?? null,
      deliveryAddress: mode === 'DELIVERY' ? String(deliveryAddress).trim().slice(0, 400) : null,
      note: note ? String(note).trim().slice(0, 500) : null,
      subtotal,
      deliveryFee,
      total: subtotal + deliveryFee,
      expiresAt: new Date(Date.now() + ORDER_TTL_HOURS * 3_600_000),
      items: { create: orderItems },
    },
    select: { id: true, orderNo: true, status: true, total: true, createdAt: true },
  });

  // Tell any open dashboard so the shop hears about this without refreshing.
  // Emitting must never break order placement — the order is already committed.
  try {
    io.to(`shop:${shop.id}`).emit('order:new', {
      id: order.id,
      orderNo: order.orderNo,
      buyerName: String(buyerName).trim(),
      total: order.total,
      itemCount: orderItems.length,
      fulfilment: mode,
    });
  } catch { /* socket layer unavailable; the order still stands */ }

  // Deliberately minimal response — enough to show a confirmation, nothing more.
  return R.created(res, {
    orderNo:   order.orderNo,
    status:    order.status,
    total:     order.total,
    placedAt:  order.createdAt,
    shopName:  shop.tradingName,
    shopPhone: shop.phone,
  });
}

// ── GET /public/orders/:orderNo?phone=… ──────────────────────────────────────
// Order tracking. The phone number must match, so an order number alone is not
// enough to read someone else's details.
export async function trackOrder(req: Request, res: Response) {
  const { phone } = req.query as Record<string, string>;
  if (!phone) return R.badRequest(res, 'Phone number is required');

  const order = await prisma.order.findFirst({
    where: { orderNo: req.params.orderNo, buyerPhone: normalisePhone(phone) },
    select: {
      orderNo: true, status: true, fulfilment: true, subtotal: true,
      deliveryFee: true, total: true, createdAt: true, acceptedAt: true,
      fulfilledAt: true, cancelReason: true,
      shop:  { select: { tradingName: true, phone: true } },
      items: { select: { name: true, quantity: true, unitLabel: true, unitPrice: true, lineTotal: true } },
    },
  });
  if (!order) return R.notFound(res, 'Order not found');
  return R.ok(res, order);
}
