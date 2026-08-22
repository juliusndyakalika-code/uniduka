/**
 * Invoicing.
 *
 * Two distinct things live here:
 *   1. Invoice — a bill issued to a customer, usually before payment. It moves
 *      no stock and books no revenue until fulfilment, so an unpaid or
 *      cancelled invoice can never distort inventory or reporting.
 *   2. Tax invoice numbers — a formal number assigned on demand to an already
 *      completed sale, for buyers who need a compliant document.
 *
 * Payment and fulfilment are independent. Wholesale commonly delivers first and
 * is paid on terms; other trades take payment before releasing goods. Neither
 * order is privileged.
 *
 * Numbers are assigned at creation and invoices are never hard-deleted, only
 * cancelled — a cancelled document keeps its number, which is what tax
 * authorities expect. Deleting would leave a gap in the sequence.
 */
import { Response } from 'express';
import { AuthRequest } from '../../types';
import { prisma } from '../../core/prisma';
import * as R from '../../utils/response';
import * as tz from '../../utils/tz';

const shop = (req: AuthRequest) => req.user!.shopId!;
const EPS = 0.5; // TZS tolerance for float comparisons

function receiptNo() {
  return `RCP-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

/**
 * Next number in a shop's document sequence. The increment is atomic at the
 * database level; the surrounding upsert is retried once because two concurrent
 * first-time callers can collide on the unique constraint.
 */
async function nextDocNumber(shopId: string, kind: 'INVOICE' | 'TAX_INVOICE', fallbackPrefix: string) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await prisma.documentSequence.upsert({
        where:  { shopId_kind: { shopId, kind } },
        create: { shopId, kind, prefix: fallbackPrefix, next: 1 },
        update: {},
      });
      break;
    } catch {
      if (attempt === 1) throw new Error('Could not allocate a document number');
    }
  }
  const seq = await prisma.documentSequence.update({
    where: { shopId_kind: { shopId, kind } },
    data:  { next: { increment: 1 } },
  });
  // `next` is the value *after* incrementing, so the number just claimed is one less.
  return `${seq.prefix}-${String(seq.next - 1).padStart(6, '0')}`;
}

/**
 * What can still be promised for a set of products.
 *
 * Raw stock is not the answer on its own: an invoice is a promise, and open
 * invoices that have not yet been delivered have already spoken for some of it.
 * Without subtracting those, five invoices could each claim the full shelf.
 *
 * `excludeInvoiceId` lets an invoice being edited ignore its own lines, so a
 * draft for 7 of 10 does not read as only 3 remaining while you adjust it.
 */
async function availability(shopId: string, productIds: string[], excludeInvoiceId?: string) {
  const out = new Map<string, { stock: number; committed: number; available: number; name: string }>();
  if (productIds.length === 0) return out;

  const [products, openLines] = await Promise.all([
    prisma.product.findMany({
      where: { id: { in: productIds }, shopId },
      select: { id: true, name: true, trackStock: true, type: true, inventory: { select: { quantity: true } } },
    }),
    prisma.invoiceItem.findMany({
      where: {
        productId: { in: productIds },
        invoice: {
          shopId,
          fulfilledAt: null,                              // not yet delivered
          status: { notIn: ['CANCELLED'] },               // cancelled promises nothing
          ...(excludeInvoiceId && { id: { not: excludeInvoiceId } }),
        },
      },
      select: { productId: true, quantity: true },
    }),
  ]);

  const committedBy = new Map<string, number>();
  for (const l of openLines) {
    if (!l.productId) continue;
    committedBy.set(l.productId, (committedBy.get(l.productId) ?? 0) + l.quantity);
  }

  for (const p of products) {
    const stock = p.inventory.reduce((s, i) => s + i.quantity, 0);
    const committed = committedBy.get(p.id) ?? 0;
    // Services have nothing to run out of. So do products explicitly marked as
    // untracked (made to order, drop-shipped). Constraining either would stop a
    // salon or clinic invoicing at all, since their lines never carry stock.
    const unlimited = !p.trackStock || p.type === 'SERVICE';
    out.set(p.id, {
      name: p.name,
      stock,
      committed,
      available: unlimited ? Number.POSITIVE_INFINITY : stock - committed,
    });
  }
  return out;
}

/** Money for one line. Tax is exclusive, matching the POS convention. */
function priceLine(input: {
  quantity: number; unitPrice: number; discountPct?: number; taxRate?: number;
}) {
  const gross     = input.unitPrice * input.quantity;
  const lineTotal = gross * (1 - (input.discountPct ?? 0) / 100);
  const taxAmount = lineTotal * ((input.taxRate ?? 0) / 100);
  return { lineTotal, taxAmount };
}

/** Everything derived rather than stored, so it can never go stale. */
function decorate<T extends {
  total: number; status: string; dueAt: Date | null; fulfilledAt: Date | null;
  payments: { amount: number }[];
}>(inv: T) {
  const amountPaid = inv.payments.reduce((s, p) => s + p.amount, 0);
  const balance    = Math.max(0, inv.total - amountPaid);
  const isOpen     = inv.status === 'SENT' || inv.status === 'PARTIALLY_PAID';
  return {
    ...inv,
    amountPaid,
    balance,
    isOverdue: isOpen && !!inv.dueAt && inv.dueAt.getTime() < Date.now(),
    isFulfilled: !!inv.fulfilledAt,
  };
}

const INVOICE_INCLUDE = {
  items: { include: { product: { select: { name: true, sku: true } } } },
  payments: {
    include: { recordedBy: { select: { fullName: true } } },
    orderBy: { paidAt: 'asc' as const },
  },
  customer: { select: { id: true, fullName: true, phone: true, email: true } },
  createdBy: { select: { fullName: true } },
};

// ── GET /invoices ────────────────────────────────────────────────────────────
export async function listInvoices(req: AuthRequest, res: Response) {
  const sid = shop(req);
  const { status, search, from, to, overdue, page = '1', limit = '25' } = req.query as Record<string, string>;
  const take = Math.min(Number(limit) || 25, 100);
  const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

  const shopRow = await prisma.shop.findUnique({ where: { id: sid }, select: { timezone: true } });
  const zone = shopRow?.timezone || tz.DEFAULT_TZ;

  const where = {
    shopId: sid,
    ...(status && { status: status as never }),
    // Overdue is derived, so it is expressed as a query rather than a stored flag.
    ...(overdue === 'true' && {
      status: { in: ['SENT', 'PARTIALLY_PAID'] as never[] },
      dueAt: { lt: new Date() },
    }),
    ...((from || to) && {
      createdAt: {
        ...(from && { gte: tz.startOfDateString(from, zone) }),
        ...(to   && { lte: tz.endOfDateString(to, zone) }),
      },
    }),
    ...(search && {
      OR: [
        { invoiceNo:   { contains: search, mode: 'insensitive' as const } },
        { billToName:  { contains: search, mode: 'insensitive' as const } },
        { billToPhone: { contains: search, mode: 'insensitive' as const } },
      ],
    }),
  };

  const [rows, total, statusCounts] = await Promise.all([
    prisma.invoice.findMany({
      where, include: INVOICE_INCLUDE, orderBy: { createdAt: 'desc' }, skip, take,
    }),
    prisma.invoice.count({ where }),
    prisma.invoice.groupBy({ by: ['status'], where: { shopId: sid }, _count: { id: true } }),
  ]);

  const invoices = rows.map(decorate);

  // Headline figures cover every open invoice in the shop, not just this page.
  const open = await prisma.invoice.findMany({
    where: { shopId: sid, status: { in: ['SENT', 'PARTIALLY_PAID'] } },
    select: { total: true, dueAt: true, payments: { select: { amount: true } } },
  });
  let outstanding = 0, overdueAmount = 0;
  for (const o of open) {
    const bal = Math.max(0, o.total - o.payments.reduce((s, p) => s + p.amount, 0));
    outstanding += bal;
    if (o.dueAt && o.dueAt.getTime() < Date.now()) overdueAmount += bal;
  }

  const counts: Record<string, number> = {};
  for (const c of statusCounts) counts[c.status] = c._count.id;

  return R.ok(res, invoices, {
    total, page: Number(page) || 1, limit: take, pages: Math.ceil(total / take),
    counts, outstanding, overdueAmount,
  });
}

// ── GET /invoices/availability ───────────────────────────────────────────────
// What each product can still be promised for, so the picker can grey out what
// is spoken for instead of letting someone pick it and fail on save.
export async function getAvailability(req: AuthRequest, res: Response) {
  const sid = shop(req);
  const { exclude } = req.query as Record<string, string>;

  const products = await prisma.product.findMany({
    where: { shopId: sid, isActive: true },
    select: { id: true },
  });
  const map = await availability(sid, products.map(p => p.id), exclude || undefined);

  const out: Record<string, { stock: number; committed: number; available: number | null }> = {};
  for (const [id, v] of map) {
    out[id] = {
      stock: v.stock,
      committed: v.committed,
      // JSON has no Infinity; null means "not stock-tracked, no limit".
      available: Number.isFinite(v.available) ? v.available : null,
    };
  }
  return R.ok(res, out);
}

// ── GET /invoices/:id ────────────────────────────────────────────────────────
export async function getInvoice(req: AuthRequest, res: Response) {
  const inv = await prisma.invoice.findFirst({
    where: { id: req.params.id, shopId: shop(req) },
    include: INVOICE_INCLUDE,
  });
  if (!inv) return R.notFound(res, 'Invoice not found');

  // The shop's own details, needed to render the document.
  const shopRow = await prisma.shop.findUnique({
    where: { id: shop(req) },
    select: {
      tradingName: true, legalName: true, logoUrl: true, phone: true, contactEmail: true,
      addressLine1: true, city: true, region: true, tin: true, vrn: true, currency: true,
    },
  });

  return R.ok(res, { ...decorate(inv), shop: shopRow });
}

// ── POST /invoices ───────────────────────────────────────────────────────────
export async function createInvoice(req: AuthRequest, res: Response) {
  const sid = shop(req);
  const {
    customerId, billToName, billToTin, billToPhone, billToEmail, billToAddress,
    items, discountAmount = 0, notes, terms, dueAt,
  } = req.body ?? {};

  if (!Array.isArray(items) || items.length === 0) return R.badRequest(res, 'Add at least one line');
  if (items.length > 200) return R.badRequest(res, 'Too many lines on one invoice');

  // Bill-to may come from a CRM record or be typed in for a one-off buyer.
  let name = String(billToName ?? '').trim();
  let linkedCustomerId: string | null = null;
  if (customerId) {
    const cust = await prisma.customer.findFirst({
      where: { id: customerId, shopId: sid },
      select: { id: true, fullName: true },
    });
    if (!cust) return R.badRequest(res, 'Customer not found');
    linkedCustomerId = cust.id;
    if (!name) name = cust.fullName;
  }
  if (!name) return R.badRequest(res, 'Who is this invoice for?');

  // Catalogue lines are re-read from the database; free-text lines are allowed
  // for things like delivery or labour that are not products.
  const productIds = items.map((i: { productId?: string }) => i.productId).filter(Boolean) as string[];
  const products = productIds.length
    ? await prisma.product.findMany({
        where: { id: { in: productIds }, shopId: sid },
        select: { id: true, name: true, unit: true, sellPrice: true, taxRule: { select: { rate: true } } },
      })
    : [];
  const byId = new Map(products.map(p => [p.id, p]));
  const stockFor = await availability(sid, productIds);

  // Collapse duplicate lines for the same product before checking, or two lines
  // of 6 against 10 in stock would each pass while together they oversell.
  const wantedPerProduct = new Map<string, number>();
  for (const raw of items) {
    if (!raw?.productId) continue;
    wantedPerProduct.set(raw.productId, (wantedPerProduct.get(raw.productId) ?? 0) + (Number(raw.quantity) || 0));
  }
  for (const [pid, wanted] of wantedPerProduct) {
    const a = stockFor.get(pid);
    if (!a) continue;
    if (a.available <= 0) {
      return R.badRequest(res, a.committed > 0
        ? `${a.name} has none left to promise — all ${a.stock} are already on other invoices`
        : `${a.name} is out of stock`);
    }
    if (wanted > a.available) {
      return R.badRequest(res, a.committed > 0
        ? `Only ${a.available} of ${a.name} can still be promised (${a.stock} in stock, ${a.committed} on other invoices)`
        : `Only ${a.available} of ${a.name} in stock`);
    }
  }

  const lines = [];
  for (const raw of items) {
    const qty = Number(raw?.quantity);
    if (!Number.isFinite(qty) || qty <= 0) return R.badRequest(res, 'Every line needs a quantity above zero');

    const product = raw?.productId ? byId.get(raw.productId) : undefined;
    if (raw?.productId && !product) return R.badRequest(res, 'One of the products is not in this shop');

    const lineName = String(raw?.name ?? product?.name ?? '').trim();
    if (!lineName) return R.badRequest(res, 'Every line needs a description');

    const unitPrice = raw?.unitPrice != null ? Number(raw.unitPrice) : (product?.sellPrice ?? 0);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) return R.badRequest(res, 'Invalid price on a line');

    const discountPct = Math.min(Math.max(Number(raw?.discountPct) || 0, 0), 100);
    const taxRate     = raw?.taxRate != null ? Number(raw.taxRate) : (product?.taxRule?.rate ?? 0);
    const { lineTotal, taxAmount } = priceLine({ quantity: qty, unitPrice, discountPct, taxRate });

    lines.push({
      productId: product?.id ?? null,
      name: lineName.slice(0, 200),
      description: raw?.description ? String(raw.description).slice(0, 500) : null,
      quantity: qty,
      unitLabel: String(raw?.unitLabel ?? product?.unit ?? 'ea'),
      unitPrice, discountPct, taxRate, taxAmount, lineTotal,
    });
  }

  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  const taxTotal = lines.reduce((s, l) => s + l.taxAmount, 0);
  const orderDiscount = Math.min(Math.max(Number(discountAmount) || 0, 0), subtotal);
  const total = subtotal - orderDiscount + taxTotal;

  const invoiceNo = await nextDocNumber(sid, 'INVOICE', 'INV');

  const invoice = await prisma.invoice.create({
    data: {
      shopId: sid,
      invoiceNo,
      status: 'DRAFT',
      customerId: linkedCustomerId,
      billToName: name.slice(0, 160),
      billToTin:     billToTin     ? String(billToTin).trim().slice(0, 40)   : null,
      billToPhone:   billToPhone   ? String(billToPhone).trim().slice(0, 40) : null,
      billToEmail:   billToEmail   ? String(billToEmail).trim().slice(0, 160): null,
      billToAddress: billToAddress ? String(billToAddress).trim().slice(0, 400) : null,
      subtotal, discountAmount: orderDiscount, taxAmount: taxTotal, total,
      notes: notes ? String(notes).slice(0, 1000) : null,
      terms: terms ? String(terms).slice(0, 1000) : null,
      dueAt: dueAt ? new Date(dueAt) : null,
      createdById: req.user!.sub,
      items: { create: lines },
    },
    include: INVOICE_INCLUDE,
  });

  return R.created(res, decorate(invoice));
}

// ── PUT /invoices/:id ────────────────────────────────────────────────────────
// Only drafts are editable. Once issued, an invoice is a document the customer
// holds, so changing it underneath them would be dishonest.
export async function updateInvoice(req: AuthRequest, res: Response) {
  const existing = await prisma.invoice.findFirst({
    where: { id: req.params.id, shopId: shop(req) },
    select: { id: true, status: true },
  });
  if (!existing) return R.notFound(res, 'Invoice not found');
  if (existing.status !== 'DRAFT') {
    return R.badRequest(res, 'Only a draft can be edited. Cancel it and raise a new one instead.');
  }

  // Replacing the lines wholesale is simpler and safer than diffing them.
  const rebuilt = await buildDraftUpdate(req);
  if (rebuilt.error !== undefined) return R.badRequest(res, rebuilt.error);

  await prisma.invoiceItem.deleteMany({ where: { invoiceId: existing.id } });
  const invoice = await prisma.invoice.update({
    where: { id: existing.id },
    data: { ...rebuilt.data, items: { create: rebuilt.lines } },
    include: INVOICE_INCLUDE,
  });
  return R.ok(res, decorate(invoice));
}

type DraftLine = {
  productId: string | null; name: string; description: string | null;
  quantity: number; unitLabel: string; unitPrice: number;
  discountPct: number; taxRate: number; taxAmount: number; lineTotal: number;
};
type DraftRebuild =
  | { error: string }
  | { error?: undefined; lines: DraftLine[]; data: Record<string, unknown> };

/** Shared line-and-total rebuild used by update. */
async function buildDraftUpdate(req: AuthRequest): Promise<DraftRebuild> {
  const sid = shop(req);
  const { billToName, billToTin, billToPhone, billToEmail, billToAddress,
          items, discountAmount = 0, notes, terms, dueAt, customerId } = req.body ?? {};

  if (!Array.isArray(items) || items.length === 0) return { error: 'Add at least one line' };

  const productIds = items.map((i: { productId?: string }) => i.productId).filter(Boolean) as string[];
  const products = productIds.length
    ? await prisma.product.findMany({
        where: { id: { in: productIds }, shopId: sid },
        select: { id: true, name: true, unit: true, sellPrice: true, taxRule: { select: { rate: true } } },
      })
    : [];
  const byId = new Map(products.map(p => [p.id, p]));

  // Editing a draft ignores that draft's own lines, so adjusting a quantity
  // does not measure the invoice against itself.
  const stockFor = await availability(sid, productIds, req.params.id);
  const wantedPerProduct = new Map<string, number>();
  for (const raw of items) {
    if (!raw?.productId) continue;
    wantedPerProduct.set(raw.productId, (wantedPerProduct.get(raw.productId) ?? 0) + (Number(raw.quantity) || 0));
  }
  for (const [pid, wanted] of wantedPerProduct) {
    const a = stockFor.get(pid);
    if (!a) continue;
    if (a.available <= 0) {
      return { error: a.committed > 0
        ? `${a.name} has none left to promise — all ${a.stock} are already on other invoices`
        : `${a.name} is out of stock` };
    }
    if (wanted > a.available) {
      return { error: a.committed > 0
        ? `Only ${a.available} of ${a.name} can still be promised (${a.stock} in stock, ${a.committed} on other invoices)`
        : `Only ${a.available} of ${a.name} in stock` };
    }
  }

  const lines = [];
  for (const raw of items) {
    const qty = Number(raw?.quantity);
    if (!Number.isFinite(qty) || qty <= 0) return { error: 'Every line needs a quantity above zero' };
    const product = raw?.productId ? byId.get(raw.productId) : undefined;
    if (raw?.productId && !product) return { error: 'One of the products is not in this shop' };
    const lineName = String(raw?.name ?? product?.name ?? '').trim();
    if (!lineName) return { error: 'Every line needs a description' };
    const unitPrice = raw?.unitPrice != null ? Number(raw.unitPrice) : (product?.sellPrice ?? 0);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) return { error: 'Invalid price on a line' };
    const discountPct = Math.min(Math.max(Number(raw?.discountPct) || 0, 0), 100);
    const taxRate = raw?.taxRate != null ? Number(raw.taxRate) : (product?.taxRule?.rate ?? 0);
    const { lineTotal, taxAmount } = priceLine({ quantity: qty, unitPrice, discountPct, taxRate });
    lines.push({
      productId: product?.id ?? null, name: lineName.slice(0, 200),
      description: raw?.description ? String(raw.description).slice(0, 500) : null,
      quantity: qty, unitLabel: String(raw?.unitLabel ?? product?.unit ?? 'ea'),
      unitPrice, discountPct, taxRate, taxAmount, lineTotal,
    });
  }

  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  const taxTotal = lines.reduce((s, l) => s + l.taxAmount, 0);
  const orderDiscount = Math.min(Math.max(Number(discountAmount) || 0, 0), subtotal);

  return {
    lines,
    data: {
      ...(customerId !== undefined && { customerId: customerId || null }),
      ...(billToName && { billToName: String(billToName).trim().slice(0, 160) }),
      ...(billToTin     !== undefined && { billToTin:     billToTin     ? String(billToTin).slice(0, 40) : null }),
      ...(billToPhone   !== undefined && { billToPhone:   billToPhone   ? String(billToPhone).slice(0, 40) : null }),
      ...(billToEmail   !== undefined && { billToEmail:   billToEmail   ? String(billToEmail).slice(0, 160) : null }),
      ...(billToAddress !== undefined && { billToAddress: billToAddress ? String(billToAddress).slice(0, 400) : null }),
      ...(notes !== undefined && { notes: notes ? String(notes).slice(0, 1000) : null }),
      ...(terms !== undefined && { terms: terms ? String(terms).slice(0, 1000) : null }),
      ...(dueAt !== undefined && { dueAt: dueAt ? new Date(dueAt) : null }),
      subtotal, discountAmount: orderDiscount, taxAmount: taxTotal,
      total: subtotal - orderDiscount + taxTotal,
    },
  };
}

// ── POST /invoices/:id/issue ─────────────────────────────────────────────────
export async function issueInvoice(req: AuthRequest, res: Response) {
  const { dueAt } = req.body ?? {};
  const inv = await prisma.invoice.findFirst({
    where: { id: req.params.id, shopId: shop(req) },
    select: { id: true, status: true, dueAt: true },
  });
  if (!inv) return R.notFound(res, 'Invoice not found');
  if (inv.status !== 'DRAFT') return R.badRequest(res, 'This invoice has already been issued');

  const updated = await prisma.invoice.update({
    where: { id: inv.id },
    data: {
      status: 'SENT',
      issuedAt: new Date(),
      ...(dueAt !== undefined && { dueAt: dueAt ? new Date(dueAt) : null }),
    },
    include: INVOICE_INCLUDE,
  });
  return R.ok(res, decorate(updated));
}

// ── POST /invoices/:id/payments ──────────────────────────────────────────────
export async function recordPayment(req: AuthRequest, res: Response) {
  const { amount, method = 'CASH', reference, note, paidAt } = req.body ?? {};
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) return R.badRequest(res, 'Enter an amount above zero');

  const inv = await prisma.invoice.findFirst({
    where: { id: req.params.id, shopId: shop(req) },
    include: { payments: { select: { amount: true } } },
  });
  if (!inv) return R.notFound(res, 'Invoice not found');
  if (inv.status === 'DRAFT')     return R.badRequest(res, 'Issue the invoice before recording a payment');
  if (inv.status === 'CANCELLED') return R.badRequest(res, 'This invoice was cancelled');

  const alreadyPaid = inv.payments.reduce((s, p) => s + p.amount, 0);
  const balance = inv.total - alreadyPaid;
  if (balance <= EPS) return R.badRequest(res, 'This invoice is already settled');
  if (value > balance + EPS) {
    return R.badRequest(res, `That is more than the ${balance.toLocaleString()} still owed`);
  }

  await prisma.invoicePayment.create({
    data: {
      invoiceId: inv.id,
      method: method as never,
      amount: value,
      reference: reference ? String(reference).slice(0, 120) : null,
      note: note ? String(note).slice(0, 300) : null,
      paidAt: paidAt ? new Date(paidAt) : new Date(),
      recordedById: req.user!.sub,
    },
  });

  const paidNow = alreadyPaid + value;
  const settled = paidNow >= inv.total - EPS;

  // If the goods already went out, the sale exists as a Transaction and the
  // debts page derives its outstanding balance from that transaction's
  // payments. Mirror the payment across so the two never disagree.
  if (inv.transactionId) {
    await prisma.transactionPayment.create({
      data: {
        transactionId: inv.transactionId,
        method: method as never,
        amount: value,
        reference: reference ? String(reference).slice(0, 120) : `Invoice ${inv.invoiceNo}`,
      },
    });
  }

  const updated = await prisma.invoice.update({
    where: { id: inv.id },
    data: {
      status: settled ? 'PAID' : 'PARTIALLY_PAID',
      paidAt: settled ? new Date() : null,
    },
    include: INVOICE_INCLUDE,
  });
  return R.ok(res, decorate(updated));
}

// ── POST /invoices/:id/fulfil ────────────────────────────────────────────────
// Goods have gone out. The only step that touches stock or books revenue.
export async function fulfilInvoice(req: AuthRequest, res: Response) {
  const sid = shop(req);
  const inv = await prisma.invoice.findFirst({
    where: { id: req.params.id, shopId: sid },
    include: { items: true, payments: true },
  });
  if (!inv) return R.notFound(res, 'Invoice not found');
  if (inv.fulfilledAt)            return R.badRequest(res, 'These goods have already been delivered');
  if (inv.status === 'DRAFT')     return R.badRequest(res, 'Issue the invoice before delivering against it');
  if (inv.status === 'CANCELLED') return R.badRequest(res, 'This invoice was cancelled');

  // Link or create the CRM customer so the sale and any debt are attributable.
  let customerId = inv.customerId;
  if (!customerId && inv.billToPhone) {
    const existing = await prisma.customer.findFirst({
      where: { shopId: sid, phone: inv.billToPhone }, select: { id: true },
    });
    customerId = existing?.id ?? (await prisma.customer.create({
      data: {
        shopId: sid, fullName: inv.billToName, phone: inv.billToPhone,
        email: inv.billToEmail, address: inv.billToAddress,
      },
      select: { id: true },
    })).id;
  }

  const stockLines = inv.items.filter(i => i.productId);
  const amountPaid = inv.payments.reduce((s, p) => s + p.amount, 0);
  const outstanding = inv.total - amountPaid;

  // Carry the invoice's payments onto the sale, and add a DEBIT marker when a
  // balance remains so it surfaces on the existing debts page.
  const txPayments: { method: string; amount: number; reference?: string }[] =
    inv.payments.map(p => ({ method: p.method, amount: p.amount, reference: p.reference ?? undefined }));
  if (outstanding > EPS) txPayments.push({ method: 'DEBIT', amount: 0 });
  if (txPayments.length === 0) txPayments.push({ method: 'DEBIT', amount: 0 });

  const tx = await prisma.transaction.create({
    data: {
      shopId: sid,
      cashierId: req.user!.sub,
      customerId,
      subtotal: inv.subtotal,
      discountAmount: inv.discountAmount,
      taxAmount: inv.taxAmount,
      total: inv.total,
      receiptNo: receiptNo(),
      status: 'COMPLETED',
      type: 'SALE',
      customerName: inv.billToName,
      customerTin: inv.billToTin,
      note: `Invoice ${inv.invoiceNo}`,
      items: {
        create: inv.items.map(i => ({
          productId: i.productId,
          name: i.name,
          quantity: i.quantity,
          unitLabel: i.unitLabel,
          unitPrice: i.unitPrice,
          discountPct: i.discountPct,
          taxAmount: i.taxAmount,
          lineTotal: i.lineTotal,
        })).filter(i => i.productId) as never,
      },
      payments: { create: txPayments as never },
    },
  });

  // Deduct stock FIFO across inventory rows, matching the POS. Free-text lines
  // have no product and so move nothing.
  for (const item of stockLines) {
    await prisma.stockMovement.create({
      data: {
        shopId: sid, productId: item.productId!, type: 'SALE',
        quantity: -item.quantity, reference: tx.id, userId: req.user!.sub,
        note: `Invoice ${inv.invoiceNo}`,
      },
    });
    let remaining = item.quantity;
    const rows = await prisma.inventoryItem.findMany({
      where: { shopId: sid, productId: item.productId! },
      orderBy: { createdAt: 'asc' },
    });
    for (const row of rows) {
      if (remaining <= 0) break;
      const take = Math.min(row.quantity, remaining);
      await prisma.inventoryItem.update({ where: { id: row.id }, data: { quantity: { decrement: take } } });
      remaining -= take;
    }
    // Allow oversell rather than blocking: if the goods physically went out,
    // the record should say so and the shortfall show as negative stock.
    if (remaining > 0 && rows.length > 0) {
      await prisma.inventoryItem.update({ where: { id: rows[0].id }, data: { quantity: { decrement: remaining } } });
    }
  }

  const updated = await prisma.invoice.update({
    where: { id: inv.id },
    data: { fulfilledAt: new Date(), transactionId: tx.id, customerId },
    include: INVOICE_INCLUDE,
  });

  return R.ok(res, {
    invoice: decorate(updated),
    transaction: { id: tx.id, receiptNo: tx.receiptNo },
  });
}

// ── POST /invoices/:id/cancel ────────────────────────────────────────────────
export async function cancelInvoice(req: AuthRequest, res: Response) {
  const { reason } = req.body ?? {};
  const inv = await prisma.invoice.findFirst({
    where: { id: req.params.id, shopId: shop(req) },
    include: { payments: { select: { amount: true } } },
  });
  if (!inv) return R.notFound(res, 'Invoice not found');
  if (inv.status === 'CANCELLED') return R.badRequest(res, 'This invoice is already cancelled');
  if (inv.fulfilledAt) {
    return R.badRequest(res, 'The goods have already gone out. Void the linked sale instead.');
  }
  if (inv.payments.length > 0) {
    return R.badRequest(res, 'Money has been received against this invoice. Refund it before cancelling.');
  }

  const updated = await prisma.invoice.update({
    where: { id: inv.id },
    data: {
      status: 'CANCELLED',
      cancelledAt: new Date(),
      cancelReason: reason ? String(reason).slice(0, 300) : null,
    },
    include: INVOICE_INCLUDE,
  });
  return R.ok(res, decorate(updated));
}

// ── POST /pos/transactions/:id/tax-invoice ───────────────────────────────────
// Assigns a formal tax invoice number to a completed sale, for buyers who need
// a compliant document. Numbers are only consumed when actually asked for, and
// asking twice returns the same one rather than burning another.
export async function issueTaxInvoice(req: AuthRequest, res: Response) {
  const sid = shop(req);
  const { customerTin, customerName } = req.body ?? {};

  const tx = await prisma.transaction.findFirst({
    where: { id: req.params.id, shopId: sid },
    select: { id: true, status: true, taxInvoiceNo: true },
  });
  if (!tx) return R.notFound(res, 'Sale not found');
  if (tx.status !== 'COMPLETED') {
    return R.badRequest(res, `A ${tx.status.toLowerCase()} sale cannot be invoiced`);
  }

  let number = tx.taxInvoiceNo;
  if (!number) {
    number = await nextDocNumber(sid, 'TAX_INVOICE', 'TIN');
    await prisma.transaction.update({
      where: { id: tx.id },
      data: {
        taxInvoiceNo: number,
        taxInvoiceAt: new Date(),
        ...(customerTin  && { customerTin:  String(customerTin).slice(0, 40) }),
        ...(customerName && { customerName: String(customerName).slice(0, 160) }),
      },
    });
  } else if (customerTin || customerName) {
    // Buyer details can still be corrected without re-issuing the number.
    await prisma.transaction.update({
      where: { id: tx.id },
      data: {
        ...(customerTin  && { customerTin:  String(customerTin).slice(0, 40) }),
        ...(customerName && { customerName: String(customerName).slice(0, 160) }),
      },
    });
  }

  const full = await prisma.transaction.findUnique({
    where: { id: tx.id },
    include: {
      items: true,
      payments: true,
      customer: { select: { fullName: true, phone: true } },
    },
  });
  const shopRow = await prisma.shop.findUnique({
    where: { id: sid },
    select: {
      tradingName: true, legalName: true, phone: true, contactEmail: true,
      addressLine1: true, city: true, region: true, tin: true, vrn: true,
      taxMode: true, currency: true,
    },
  });

  return R.ok(res, { transaction: full, shop: shopRow, reissued: !!tx.taxInvoiceNo });
}
