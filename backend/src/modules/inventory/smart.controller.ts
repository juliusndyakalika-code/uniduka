import { Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../../types';
import { prisma } from '../../core/prisma';
import * as R from '../../utils/response';
import { stockForecast, LEAD_DAYS, COVER_DAYS, WINDOW_DAYS } from '../../core/forecast';
import { aiReady, aiReadImage, allowanceLeft, type AiImage } from '../../core/ai';
import { receiveStock } from './inventory.controller';

const shop = (req: AuthRequest) => req.user!.shopId!;

// ─── FORECAST ────────────────────────────────────────────────────────────────

/** GET /inventory/forecast: days of stock left and what to order, per product. */
export async function getForecast(req: AuthRequest, res: Response) {
  const rows = await stockForecast(shop(req));
  const only = String(req.query.only ?? '');
  return R.ok(res, {
    assumptions: { windowDays: WINDOW_DAYS, leadDays: LEAD_DAYS, coverDays: COVER_DAYS },
    items: only === 'reorder' ? rows.filter(r => r.urgent && r.suggestedQty > 0) : rows,
  });
}

/**
 * POST /inventory/forecast/reorder: draft purchase orders from the forecast.
 *
 * One draft per supplier, because that is how an order is actually placed.
 * Drafts only: nothing is sent and nothing is owed until the owner opens one
 * and moves it on. Optional `productIds` narrows it to what they ticked.
 */
export async function draftReorder(req: AuthRequest, res: Response) {
  const sid = shop(req);
  const pick: string[] | null = Array.isArray(req.body?.productIds) ? req.body.productIds.map(String) : null;

  const rows = (await stockForecast(sid))
    .filter(r => r.suggestedQty > 0 && (pick ? pick.includes(r.productId) : r.urgent));
  if (!rows.length) return R.badRequest(res, 'Nothing needs ordering right now.');

  const bySupplier = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = r.supplierId ?? '';
    bySupplier.set(k, [...(bySupplier.get(k) ?? []), r]);
  }

  const created = [];
  let n = 0;
  for (const [supplierId, lines] of bySupplier) {
    const total = lines.reduce((s, l) => s + l.suggestedQty * l.unitCost, 0);
    created.push(await prisma.purchaseOrder.create({
      data: {
        shopId: sid,
        supplierId: supplierId || undefined,
        poNumber: `PO-${Date.now()}-${++n}`,
        status: 'DRAFT',
        notes: `Reorder suggested from the last ${WINDOW_DAYS} days of sales`,
        totalAmount: total,
        amountPaid: 0,
        lines: {
          create: lines.map(l => ({
            productId: l.productId, style: l.name, orderedQty: l.suggestedQty, unitCost: l.unitCost,
          })),
        },
      },
      select: { id: true, poNumber: true, totalAmount: true, supplier: { select: { name: true } }, _count: { select: { lines: true } } },
    }));
  }
  return R.created(res, { orders: created });
}

// ─── INVOICE SCAN ────────────────────────────────────────────────────────────

const InvoiceSchema = z.object({
  readable: z.boolean().describe('False if this is not a supplier invoice or receipt, or cannot be read'),
  supplier: z.string().nullable(),
  invoiceNo: z.string().nullable(),
  date: z.string().nullable().describe('As printed, or YYYY-MM-DD if clear'),
  currency: z.string().nullable(),
  lines: z.array(z.object({
    name: z.string().describe('Item description exactly as printed'),
    quantity: z.number().nullable(),
    unit: z.string().nullable().describe('e.g. pcs, ctn, kg, dz, as printed'),
    unitCost: z.number().nullable().describe('Price per unit as printed, without currency symbols'),
    lineTotal: z.number().nullable(),
    unsure: z.boolean().describe('True if any value on this line was hard to read'),
  })),
});

const SCAN_SYSTEM =
  'You read supplier invoices and delivery notes photographed in Tanzanian shops. ' +
  'Item names may be in Swahili or English and handwritten. Transcribe only what is ' +
  'printed or written: never guess a quantity or price that is not visible, use null ' +
  'instead, and mark the line unsure. Skip subtotal, VAT, discount and total rows. ' +
  'Numbers are written without thousands separators in your output.';

const MAX_BASE64 = 1_900_000;   // under the 2mb JSON body limit

/** Bigram overlap, 0..1. Good enough to pair "Sukari 1kg" with "SUKARI KILO 1". */
function similarity(a: string, b: string): number {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const grams = (s: string) => {
    const t = norm(s); const out: string[] = [];
    for (let i = 0; i < t.length - 1; i++) out.push(t.slice(i, i + 2));
    return out;
  };
  const A = grams(a), B = grams(b);
  if (!A.length || !B.length) return norm(a) === norm(b) ? 1 : 0;
  const pool = [...B]; let hit = 0;
  for (const g of A) { const i = pool.indexOf(g); if (i >= 0) { hit++; pool.splice(i, 1); } }
  return (2 * hit) / (A.length + B.length);
}

/** GET /inventory/invoice-scan: whether scanning is available and how many are left today. */
export async function scanStatus(req: AuthRequest, res: Response) {
  return R.ok(res, { available: aiReady, left: aiReady ? await allowanceLeft(shop(req), 'invoice') : 0 });
}

/**
 * POST /inventory/invoice-scan: read a photo of a supplier invoice.
 *
 * Returns the lines with a suggested product match each. Nothing is written:
 * the owner reviews every line, and only what they confirm is applied.
 */
export async function scanInvoice(req: AuthRequest, res: Response) {
  if (!aiReady) return R.badRequest(res, 'Invoice scanning is not switched on for this server.');
  const sid = shop(req);

  const raw = String(req.body?.image ?? '');
  const m = raw.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  const image: AiImage = m
    ? { mediaType: m[1] as AiImage['mediaType'], data: m[2] }
    : { mediaType: 'image/jpeg', data: raw };
  if (!image.data || image.data.length > MAX_BASE64 || !/^[A-Za-z0-9+/=]+$/.test(image.data.slice(0, 200))) {
    return R.badRequest(res, 'Send one photo, under about 1.4 MB.');
  }

  if ((await allowanceLeft(sid, 'invoice')) <= 0) {
    return res.status(429).json({ success: false, message: 'Today\'s invoice scans are used up. Try again tomorrow.' });
  }

  const read = await aiReadImage({
    kind: 'invoice', shopId: sid, system: SCAN_SYSTEM, image, schema: InvoiceSchema,
    prompt: 'Read this invoice and list every item line.',
  });
  if (!read) return R.badRequest(res, 'Could not read that photo. Try again in good light, flat and in focus.');
  if (!read.readable || !read.lines.length) {
    return R.badRequest(res, 'That does not look like an invoice with item lines.');
  }

  const products = await prisma.product.findMany({
    where: { shopId: sid, isActive: true },
    select: { id: true, name: true, sku: true, barcode: true, costPrice: true, sellPrice: true, unit: true },
  });

  const lines = read.lines.map((l, i) => {
    let best: { id: string; name: string; score: number } | null = null;
    for (const p of products) {
      const exact = (p.sku && l.name.includes(p.sku)) || (p.barcode && l.name.includes(p.barcode));
      const score = exact ? 1 : similarity(l.name, p.name);
      if (!best || score > best.score) best = { id: p.id, name: p.name, score };
    }
    // A derived unit cost is plain division of two printed figures, flagged
    // so the screen can say where it came from.
    const derived = l.unitCost === null && l.lineTotal !== null && l.quantity ? l.lineTotal / l.quantity : null;
    return {
      index: i,
      name: l.name,
      quantity: l.quantity,
      unit: l.unit,
      unitCost: l.unitCost ?? (derived !== null ? Math.round(derived * 100) / 100 : null),
      unitCostDerived: derived !== null,
      lineTotal: l.lineTotal,
      unsure: l.unsure,
      match: best && best.score >= 0.45 ? { productId: best.id, name: best.name, score: Math.round(best.score * 100) / 100 } : null,
    };
  });

  return R.ok(res, {
    supplier: read.supplier, invoiceNo: read.invoiceNo, date: read.date, currency: read.currency,
    lines,
    left: await allowanceLeft(sid, 'invoice'),
  });
}

const ApplySchema = z.object({
  supplier: z.string().max(120).nullish(),
  invoiceNo: z.string().max(60).nullish(),
  lines: z.array(z.object({
    productId: z.string().min(1),
    quantity: z.number().positive().max(1_000_000),
    unitCost: z.number().min(0).max(1_000_000_000),
  })).min(1).max(200),
});

/** POST /inventory/invoice-scan/apply: book the confirmed lines into stock. */
export async function applyInvoice(req: AuthRequest, res: Response) {
  const parsed = ApplySchema.safeParse(req.body);
  if (!parsed.success) return R.badRequest(res, 'Check the quantities and prices, then try again.');
  const { supplier, invoiceNo, lines } = parsed.data;
  const sid = shop(req);

  const ids = [...new Set(lines.map(l => l.productId))];
  const owned = await prisma.product.count({ where: { id: { in: ids }, shopId: sid } });
  if (owned !== ids.length) return R.badRequest(res, 'One of those products is not in this shop.');

  const note = ['Invoice', invoiceNo, supplier && `from ${supplier}`].filter(Boolean).join(' ');
  await prisma.$transaction(async tx => {
    for (const l of lines) {
      await receiveStock(tx, {
        shopId: sid, userId: req.user!.sub, productId: l.productId, qty: l.quantity, cost: l.unitCost, note,
      });
      if (l.unitCost > 0) await tx.product.update({ where: { id: l.productId }, data: { costPrice: l.unitCost } });
    }
  });

  return R.ok(res, { applied: lines.length });
}
