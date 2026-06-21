import { Response } from 'express';
import { AuthRequest } from '../../types';
import { prisma } from '../../core/prisma';
import * as R from '../../utils/response';

// ── CSV import helpers ────────────────────────────────────────────────────────

const ALLOWED_TYPES: Record<string, string[]> = {
  RETAIL_STORE:        ['PRODUCT'],
  WHOLESALE_B2B:       ['PRODUCT'],
  GROCERY_SUPERMARKET: ['PRODUCT'],
  PHARMACY_CHEMIST:    ['PRODUCT'],
  RESTAURANT:          ['MENU_ITEM', 'INGREDIENT', 'COMPOSITE'],
  CAFE_QSR:            ['MENU_ITEM', 'INGREDIENT', 'COMPOSITE'],
  BAR_NIGHTCLUB:       ['MENU_ITEM', 'INGREDIENT', 'COMPOSITE'],
  SALON_SPA:           ['SERVICE', 'PRODUCT'],
  CLINIC_MEDICAL:      ['SERVICE', 'PRODUCT'],
  REPAIR_WORKSHOP:     ['SERVICE', 'PRODUCT'],
  HOTEL_GUESTHOUSE:    ['SERVICE', 'PRODUCT', 'MENU_ITEM'],
};

const REQUIRED_HEADERS = ['name', 'type', 'unit', 'selling_price'];
const ALL_HEADERS      = ['name', 'sku', 'barcode', 'type', 'category', 'unit', 'selling_price', 'cost_price', 'reorder_point', 'initial_stock', 'description'];

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  for (const raw of text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const cells: string[] = [];
    let i = 0;
    while (i <= line.length) {
      if (i === line.length) { cells.push(''); break; }
      if (line[i] === '"') {
        let val = ''; i++;
        while (i < line.length) {
          if (line[i] === '"' && line[i + 1] === '"') { val += '"'; i += 2; }
          else if (line[i] === '"') { i++; break; }
          else val += line[i++];
        }
        cells.push(val.trim());
        if (line[i] === ',') i++;
      } else {
        const end = line.indexOf(',', i);
        if (end === -1) { cells.push(line.slice(i).trim()); break; }
        cells.push(line.slice(i, end).trim());
        i = end + 1;
      }
    }
    rows.push(cells);
  }
  return rows;
}

const shop = (req: AuthRequest) => req.user!.shopId!;

// ── Products ──────────────────────────────────────────────────────────────────
type PrismaProductWithInventory = Awaited<ReturnType<typeof prisma.product.findFirst>> & {
  inventory?: { quantity: number }[];
};

function normaliseProduct(p: NonNullable<PrismaProductWithInventory>, inventory: { quantity: number }[]) {
  const stock = (p.inventory ?? inventory).reduce((s, i) => s + i.quantity, 0);
  return {
    ...p, sellingPrice: p.sellPrice, stock,
    genericName:     p.genericName ?? undefined,
    requiresRx:      p.requiresRx,
    isControlled:    p.isControlled,
    durationMinutes: p.durationMinutes ?? undefined,
    requiresStaff:   p.requiresStaff,
  };
}

export async function listProducts(req: AuthRequest, res: Response) {
  const { search, category, type, page = '1', limit = '50' } = req.query as Record<string, string>;
  const skip = (Number(page) - 1) * Number(limit);
  const { active } = req.query as Record<string, string>;
  const where = {
    shopId: shop(req),
    ...(active === 'true'  && { isActive: true }),
    ...(active === 'false' && { isActive: false }),
    ...(search && { OR: [{ name: { contains: search, mode: 'insensitive' as const } }, { sku: { contains: search, mode: 'insensitive' as const } }] }),
    ...(category && { category }),
    ...(type && { type: type as never }),
  };
  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where, skip, take: Number(limit), orderBy: { name: 'asc' },
      include: { inventory: true, _count: { select: { txItems: true } } },
    }),
    prisma.product.count({ where }),
  ]);
  return R.ok(res, items.map(p => ({ ...normaliseProduct(p, p.inventory), inUse: p._count.txItems > 0 })), { total, page: Number(page), limit: Number(limit) });
}

export async function getProduct(req: AuthRequest, res: Response) {
  const product = await prisma.product.findFirst({
    where: { id: req.params.id, shopId: shop(req) },
    include: { inventory: true, taxRule: true, recipeLines: true },
  });
  if (!product) return R.notFound(res);
  return R.ok(res, product);
}

function extractProductFields(body: Record<string, unknown>) {
  const bool = (v: unknown) => v === true || v === 'true';
  const num  = (v: unknown, fallback = 0) => v != null && v !== '' ? Number(v) : fallback;
  return {
    name:            body.name         as string,
    sku:             (body.sku         as string | undefined) || undefined,
    barcode:         (body.barcode     as string | undefined) || undefined,
    description:     (body.description as string | undefined) || undefined,
    category:        (body.category    as string | undefined) || undefined,
    unit:            (body.unit        as string | undefined) || undefined,
    type:            (body.type        as string | undefined) || undefined,
    sellPrice:       num(body.sellingPrice ?? body.sellPrice),
    costPrice:       num(body.costPrice),
    reorderPoint:    num(body.reorderPoint),
    initialStock:    num(body.initialStock),
    // Pharmacy / clinic
    genericName:     (body.genericName as string | undefined) || undefined,
    requiresRx:      body.requiresRx   != null ? bool(body.requiresRx)   : undefined,
    isControlled:    body.isControlled != null ? bool(body.isControlled) : undefined,
    // Services
    durationMinutes: body.durationMinutes != null && body.durationMinutes !== '' ? Number(body.durationMinutes) : undefined,
    requiresStaff:   body.requiresStaff  != null ? bool(body.requiresStaff)  : undefined,
  };
}

async function generateSku(shopId: string, name: string): Promise<string> {
  const prefix = name.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3).padEnd(3, 'X');
  const count = await prisma.product.count({ where: { shopId, sku: { startsWith: prefix + '-' } } });
  return `${prefix}-${String(count + 1).padStart(3, '0')}`;
}

export async function createProduct(req: AuthRequest, res: Response) {
  const { initialStock, ...fields } = extractProductFields(req.body);
  const sku = fields.sku || await generateSku(shop(req), fields.name);
  const product = await prisma.product.create({
    data: { ...fields, sku, type: (fields.type as never) ?? 'PRODUCT', shopId: shop(req) },
  });
  if (initialStock > 0) {
    await prisma.inventoryItem.create({ data: { shopId: shop(req), productId: product.id, quantity: initialStock, costPrice: fields.costPrice } });
    await prisma.stockMovement.create({ data: { shopId: shop(req), productId: product.id, type: 'PURCHASE', quantity: initialStock, unitCost: fields.costPrice, note: 'Opening stock' } });
  }
  return R.created(res, normaliseProduct(product, []));
}

export async function updateProduct(req: AuthRequest, res: Response) {
  const { initialStock: _, type, ...fields } = extractProductFields(req.body);
  const isActive = req.body.isActive as boolean | undefined;
  const r = await prisma.product.updateMany({
    where: { id: req.params.id, shopId: shop(req) },
    data: {
      ...fields,
      ...(type ? { type: type as never } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
    },
  });
  if (!r.count) return R.notFound(res);
  return R.ok(res, { message: 'Updated' });
}

export async function deleteProduct(req: AuthRequest, res: Response) {
  await prisma.product.updateMany({ where: { id: req.params.id, shopId: shop(req) }, data: { isActive: false } });
  return R.noContent(res);
}

export async function importProducts(req: AuthRequest, res: Response) {
  if (!req.file) return R.badRequest(res, 'No CSV file uploaded');

  const text = req.file.buffer.toString('utf-8');
  const rows = parseCsv(text);
  if (rows.length < 2) return R.badRequest(res, 'CSV has no data rows');

  // Validate headers
  const headers = rows[0].map(h => h.toLowerCase().replace(/\s+/g, '_'));
  const missing = REQUIRED_HEADERS.filter(h => !headers.includes(h));
  if (missing.length > 0) {
    return R.badRequest(res, `Invalid template — missing required columns: ${missing.join(', ')}. Download the correct template and try again.`);
  }

  // Check for unknown headers (extra columns are ok, unknown required ones block)
  const unknownRequired = headers.filter(h => h && !ALL_HEADERS.includes(h));
  if (unknownRequired.length > 0) {
    return R.badRequest(res, `Unrecognised column(s): ${unknownRequired.join(', ')}. Please use the official template.`);
  }

  const idx = (name: string) => headers.indexOf(name);

  // Get shop business type for product type validation
  const shopRow = await prisma.shop.findUnique({ where: { id: shop(req) }, select: { businessType: true } });
  const allowedTypes = ALLOWED_TYPES[shopRow?.businessType ?? ''] ?? ['PRODUCT'];

  const errors: { row: number; message: string }[] = [];
  const toCreate: {
    shopId: string; name: string; sku?: string; barcode?: string; type: string; category?: string;
    sellUnitAbbr: string; sellPrice: number; costPrice: number; reorderPoint: number;
    initialStock: number; description?: string;
  }[] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const get = (col: string) => { const i = idx(col); return i >= 0 ? (row[i] ?? '').trim() : ''; };

    const name         = get('name');
    const type         = get('type').toUpperCase();
    const unit         = get('unit');
    const sellingPrice = parseFloat(get('selling_price'));
    const costPrice    = parseFloat(get('cost_price') || '0') || 0;
    const reorderPoint = parseFloat(get('reorder_point') || '0') || 0;
    const initialStock = parseFloat(get('initial_stock') || '0') || 0;
    const sku          = get('sku') || undefined;
    const barcode      = get('barcode') || undefined;
    const category     = get('category') || undefined;
    const description  = get('description') || undefined;

    if (!name)               { errors.push({ row: r + 1, message: 'name is required' }); continue; }
    if (!type)               { errors.push({ row: r + 1, message: 'type is required' }); continue; }
    if (!unit)               { errors.push({ row: r + 1, message: 'unit is required' }); continue; }
    if (isNaN(sellingPrice)) { errors.push({ row: r + 1, message: 'selling_price must be a number' }); continue; }
    if (sellingPrice < 0)    { errors.push({ row: r + 1, message: 'selling_price must be ≥ 0' }); continue; }
    if (!allowedTypes.includes(type)) {
      errors.push({ row: r + 1, message: `type "${type}" is not allowed for this business — use: ${allowedTypes.join(', ')}` });
      continue;
    }

    toCreate.push({ shopId: shop(req), name, sku, barcode, type, category, sellUnitAbbr: unit, sellPrice: sellingPrice, costPrice, reorderPoint, initialStock, description });
  }

  if (toCreate.length === 0) {
    return R.badRequest(res, `No valid rows to import. ${errors.length} error(s) found.`);
  }

  // Bulk create products and seed inventory where initialStock > 0
  const imported: string[] = [];
  const rowErrors = [...errors];

  for (const p of toCreate) {
    try {
      const { initialStock, sellUnitAbbr, ...productData } = p;
      const created = await prisma.product.create({ data: { ...productData, type: productData.type as never } });
      if (initialStock > 0) {
        await prisma.inventoryItem.create({ data: { shopId: p.shopId, productId: created.id, quantity: initialStock, costPrice: p.costPrice } });
        await prisma.stockMovement.create({ data: { shopId: p.shopId, productId: created.id, type: 'PURCHASE', quantity: initialStock, unitCost: p.costPrice, note: 'CSV import opening stock' } });
      }
      imported.push(created.id);
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message ?? 'Unknown error';
      const isDupe = msg.includes('Unique constraint') && msg.includes('sku');
      rowErrors.push({ row: -1, message: isDupe ? `SKU "${p.sku}" already exists — row skipped` : msg });
    }
  }

  return R.ok(res, { imported: imported.length, skipped: rowErrors.length, errors: rowErrors });
}

// ── Stock ─────────────────────────────────────────────────────────────────────
export async function listStock(req: AuthRequest, res: Response) {
  const items = await prisma.inventoryItem.findMany({
    where: { shopId: shop(req) },
    include: { product: { select: { name: true, sku: true, minStockLevel: true, reorderPoint: true } } },
  });
  return R.ok(res, items);
}

export async function addProductStock(req: AuthRequest, res: Response) {
  const { quantity, unitCost, note, batchNo, expiryDate, updateSellPrice, newSellPrice } = req.body;
  const productId = req.params.id;
  const qty     = Number(quantity);
  const cost    = Number(unitCost) || 0;
  if (!qty || qty <= 0) return R.badRequest(res, 'quantity must be a positive number');

  const product = await prisma.product.findFirst({
    where: { id: productId, shopId: shop(req) },
    select: { id: true, costPrice: true, sellPrice: true },
  });
  if (!product) return R.notFound(res, 'Product not found');

  // Persist inventory item and movement
  await prisma.inventoryItem.create({
    data: { shopId: shop(req), productId, quantity: qty, costPrice: cost, batchNo, expiryDate: expiryDate ? new Date(expiryDate) : undefined },
  });
  await prisma.stockMovement.create({
    data: { shopId: shop(req), productId, type: 'PURCHASE', quantity: qty, unitCost: cost, batchNo, note: note || 'Manual restock' },
  });

  // Optionally update selling price (and record new cost on product)
  if (updateSellPrice && newSellPrice !== undefined) {
    await prisma.product.update({
      where: { id: productId },
      data: { sellPrice: Number(newSellPrice), costPrice: cost },
    });
  } else if (cost > 0 && cost !== product.costPrice) {
    // Always track latest cost price even if sell price not changed
    await prisma.product.update({ where: { id: productId }, data: { costPrice: cost } });
  }

  return R.ok(res, { message: 'Stock added', priceUpdated: !!(updateSellPrice && newSellPrice) });
}

export async function getInventoryDashboard(req: AuthRequest, res: Response) {
  const sid = shop(req);

  const [products, recentMovements, expiryAlerts] = await Promise.all([
    prisma.product.findMany({
      where: { shopId: sid, isActive: true },
      select: {
        id: true, name: true, sku: true, unit: true, category: true, type: true,
        sellPrice: true, costPrice: true, reorderPoint: true,
        inventory: { select: { quantity: true, costPrice: true } },
      },
    }),
    prisma.stockMovement.findMany({
      where: { shopId: sid },
      include: { product: { select: { name: true, sku: true } } },
      orderBy: { createdAt: 'desc' },
      take: 12,
    }),
    prisma.inventoryItem.findMany({
      where: { shopId: sid, expiryDate: { gte: new Date(), lte: new Date(Date.now() + 30 * 864e5) } },
      include: { product: { select: { name: true, sku: true, unit: true } } },
      orderBy: { expiryDate: 'asc' },
      take: 8,
    }),
  ]);

  // Compute per-product stock and value
  const enriched = products.map(p => {
    const stock = p.inventory.reduce((s, i) => s + i.quantity, 0);
    const value = p.inventory.reduce((s, i) => s + i.quantity * i.costPrice, 0);
    return { ...p, stock, value };
  });

  // KPIs
  const totalProducts   = enriched.length;
  const outOfStock      = enriched.filter(p => p.stock === 0).length;
  const lowStock        = enriched.filter(p => p.stock > 0 && p.stock <= p.reorderPoint).length;
  const totalStockValue = enriched.reduce((s, p) => s + p.value, 0);
  const totalRetailValue= enriched.reduce((s, p) => s + p.stock * p.sellPrice, 0);

  // By category (for bar chart)
  const catMap: Record<string, { stockValue: number; retailValue: number; items: number }> = {};
  for (const p of enriched) {
    const cat = p.category || 'Uncategorised';
    if (!catMap[cat]) catMap[cat] = { stockValue: 0, retailValue: 0, items: 0 };
    catMap[cat].stockValue  += p.value;
    catMap[cat].retailValue += p.stock * p.sellPrice;
    catMap[cat].items       += 1;
  }
  const byCategory = Object.entries(catMap)
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.stockValue - a.stockValue)
    .slice(0, 10);

  // By product type (for donut)
  const typeMap: Record<string, number> = {};
  for (const p of enriched) { typeMap[p.type] = (typeMap[p.type] || 0) + 1; }
  const byType = Object.entries(typeMap).map(([name, count]) => ({ name, count }));

  // Alert lists
  const lowStockList = enriched
    .filter(p => p.stock > 0 && p.stock <= p.reorderPoint)
    .map(p => ({ id: p.id, name: p.name, sku: p.sku, stock: p.stock, reorderPoint: p.reorderPoint, unit: p.unit, category: p.category }))
    .sort((a, b) => a.stock - b.stock).slice(0, 12);

  const outOfStockList = enriched
    .filter(p => p.stock === 0)
    .map(p => ({ id: p.id, name: p.name, sku: p.sku, category: p.category, type: p.type }))
    .slice(0, 12);

  const topByValue = enriched
    .filter(p => p.stock > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 8)
    .map(p => ({ name: p.name, sku: p.sku, stock: p.stock, unit: p.unit, value: p.value, sellPrice: p.sellPrice }));

  return R.ok(res, {
    kpis: { totalProducts, outOfStock, lowStock, totalStockValue, totalRetailValue },
    byCategory,
    byType,
    lowStockList,
    outOfStockList,
    topByValue,
    recentMovements,
    expiryAlerts,
  });
}

export async function adjustStock(req: AuthRequest, res: Response) {
  const { productId, quantity, qty, type, note, reason, batchNo, expiryDate, unitCost } = req.body;
  if (!productId) return R.badRequest(res, 'productId is required');
  const rawQty = Number(quantity ?? qty ?? 0);
  if (!rawQty || rawQty <= 0) return R.badRequest(res, 'Quantity must be a positive number');
  const isOut = type === 'ADJUSTMENT_OUT';
  const delta = isOut ? -rawQty : rawQty;
  const actualNote = note || reason;

  // Find existing inventory item for this product in this shop
  const existing = await prisma.inventoryItem.findFirst({ where: { shopId: shop(req), productId } });
  if (existing) {
    await prisma.inventoryItem.update({ where: { id: existing.id }, data: { quantity: { increment: delta } } });
  } else {
    await prisma.inventoryItem.create({ data: { shopId: shop(req), productId, quantity: delta, batchNo, expiryDate: expiryDate ? new Date(expiryDate) : undefined, costPrice: unitCost || 0 } });
  }
  await prisma.stockMovement.create({ data: { shopId: shop(req), productId, type: 'ADJUSTMENT', quantity: delta, batchNo, unitCost: unitCost || 0, note: actualNote } });
  return R.ok(res, { message: 'Stock adjusted', delta });
}

export async function getExpiryAlerts(req: AuthRequest, res: Response) {
  const days = Number((req.query.days as string) || 30);
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() + days);
  const items = await prisma.inventoryItem.findMany({
    where: { shopId: shop(req), expiryDate: { lte: cutoff, gte: new Date() } },
    include: { product: { select: { name: true, sku: true } } },
    orderBy: { expiryDate: 'asc' },
  });
  return R.ok(res, items);
}

// ── Recipes ───────────────────────────────────────────────────────────────────
export async function listRecipes(req: AuthRequest, res: Response) {
  const recipes = await prisma.recipe.findMany({ where: { shopId: shop(req) }, include: { lines: { include: { product: { select: { name: true } } } } } });
  return R.ok(res, recipes);
}

export async function getRecipe(req: AuthRequest, res: Response) {
  const recipe = await prisma.recipe.findFirst({ where: { id: req.params.id, shopId: shop(req) }, include: { lines: true } });
  if (!recipe) return R.notFound(res);
  return R.ok(res, recipe);
}

export async function createRecipe(req: AuthRequest, res: Response) {
  const { name, yieldQty, wasteFactor, lines } = req.body;
  const recipe = await prisma.recipe.create({
    data: { shopId: shop(req), name, yieldQty: yieldQty || 1, wasteFactor: wasteFactor || 0, lines: { create: lines || [] } },
    include: { lines: true },
  });
  return R.created(res, recipe);
}

export async function updateRecipe(req: AuthRequest, res: Response) {
  const { name, yieldQty, wasteFactor, lines } = req.body;
  await prisma.recipe.updateMany({ where: { id: req.params.id, shopId: shop(req) }, data: { name, yieldQty, wasteFactor } });
  if (lines) {
    await prisma.recipeLine.deleteMany({ where: { recipeId: req.params.id } });
    await prisma.recipeLine.createMany({ data: lines.map((l: object) => ({ ...l, recipeId: req.params.id })) });
  }
  return R.ok(res, { message: 'Recipe updated' });
}

// ── Suppliers ─────────────────────────────────────────────────────────────────
export async function listSuppliers(req: AuthRequest, res: Response) {
  return R.ok(res, await prisma.supplier.findMany({ where: { shopId: shop(req), isActive: true } }));
}
export async function createSupplier(req: AuthRequest, res: Response) {
  return R.created(res, await prisma.supplier.create({ data: { ...req.body, shopId: shop(req) } }));
}
export async function updateSupplier(req: AuthRequest, res: Response) {
  await prisma.supplier.updateMany({ where: { id: req.params.id, shopId: shop(req) }, data: req.body });
  return R.ok(res, { message: 'Supplier updated' });
}

// ── Purchase Orders ───────────────────────────────────────────────────────────
export async function listPOs(req: AuthRequest, res: Response) {
  return R.ok(res, await prisma.purchaseOrder.findMany({ where: { shopId: shop(req) }, include: { supplier: true, lines: true }, orderBy: { createdAt: 'desc' } }));
}
export async function getPO(req: AuthRequest, res: Response) {
  const po = await prisma.purchaseOrder.findFirst({ where: { id: req.params.id, shopId: shop(req) }, include: { supplier: true, lines: true } });
  if (!po) return R.notFound(res);
  return R.ok(res, po);
}
export async function createPO(req: AuthRequest, res: Response) {
  const { supplierId, lines, notes, expectedAt } = req.body;
  const poNumber = `PO-${Date.now()}`;
  const po = await prisma.purchaseOrder.create({
    data: { shopId: shop(req), supplierId, poNumber, notes, expectedAt: expectedAt ? new Date(expectedAt) : undefined, lines: { create: lines || [] } },
    include: { lines: true },
  });
  return R.created(res, po);
}
export async function updatePO(req: AuthRequest, res: Response) {
  await prisma.purchaseOrder.updateMany({ where: { id: req.params.id, shopId: shop(req) }, data: req.body });
  return R.ok(res, { message: 'PO updated' });
}
export async function receivePO(req: AuthRequest, res: Response) {
  const { lines } = req.body; // [{lineId, receivedQty, batchNo, expiryDate}]
  const po = await prisma.purchaseOrder.findFirst({ where: { id: req.params.id, shopId: shop(req) }, include: { lines: true } });
  if (!po) return R.notFound(res);
  for (const rl of lines) {
    const poLine = po.lines.find(l => l.id === rl.lineId);
    if (!poLine) continue;
    await prisma.purchaseOrderLine.update({ where: { id: rl.lineId }, data: { receivedQty: rl.receivedQty } });
    await prisma.inventoryItem.create({ data: { shopId: shop(req), productId: poLine.productId, quantity: rl.receivedQty, costPrice: poLine.unitCost, batchNo: rl.batchNo, expiryDate: rl.expiryDate ? new Date(rl.expiryDate) : undefined } });
    await prisma.stockMovement.create({ data: { shopId: shop(req), productId: poLine.productId, type: 'PURCHASE', quantity: rl.receivedQty, unitCost: poLine.unitCost, batchNo: rl.batchNo, reference: po.id } });
  }
  await prisma.purchaseOrder.update({ where: { id: po.id }, data: { status: 'RECEIVED', receivedAt: new Date() } });
  return R.ok(res, { message: 'Stock received' });
}

export async function listMovements(req: AuthRequest, res: Response) {
  const { productId, type, from, to, search } = req.query as Record<string, string>;
  const movements = await prisma.stockMovement.findMany({
    where: {
      shopId: shop(req),
      ...(productId && { productId }),
      ...(type && { type: type as never }),
      ...(from && { createdAt: { gte: new Date(from) } }),
      ...(to && { createdAt: { lte: new Date(to) } }),
      ...(search && { product: { name: { contains: search, mode: 'insensitive' } } }),
    },
    include: {
      product: { select: { name: true, sku: true, unit: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 300,
  });
  return R.ok(res, movements);
}
