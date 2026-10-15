import { Request, Response } from 'express';
import { AuthRequest } from '../../types';
import { prisma } from '../../core/prisma';
import * as R from '../../utils/response';
import { encodeProductImage, ImageError } from '../../core/images';
import { logger } from '../../utils/logger';
import { reviewImage } from '../../core/moderation';

const shop = (req: AuthRequest) => req.user!.shopId!;

/** Under the 2mb JSON body limit once base64 is accounted for. */
const MAX_BASE64 = 1_900_000;

/** Where a product's image is served from, relative to the API base. */
export const imagePath = (id: string) => `/public/images/${id}`;

/**
 * POST /inventory/products/:id/image  { image: "data:image/...;base64,..." }
 *
 * Replaces the product's picture. The old row is deleted and a new one made,
 * so the URL changes and browsers holding the old one forever is harmless.
 */
export async function uploadProductImage(req: AuthRequest, res: Response) {
  const sid = shop(req);
  const product = await prisma.product.findFirst({ where: { id: req.params.id, shopId: sid }, select: { id: true } });
  if (!product) return R.notFound(res, 'Product not found');

  const raw = String(req.body?.image ?? '');
  const b64 = raw.replace(/^data:image\/[a-z+.-]+;base64,/i, '');
  if (!b64 || b64.length > MAX_BASE64 || !/^[A-Za-z0-9+/=\s]+$/.test(b64.slice(0, 400))) {
    return R.badRequest(res, 'Send one photo, under about 1.4 MB.');
  }

  let encoded;
  try {
    encoded = await encodeProductImage(Buffer.from(b64, 'base64'));
  } catch (err) {
    if (err instanceof ImageError) return R.badRequest(res, err.message);
    logger.error(`Product image encode failed for ${product.id}: ${(err as Error).message}`);
    return R.badRequest(res, 'Could not process that photo. Try another one.');
  }

  // Reviewed before anything is stored. A rejected photo is never saved, so
  // there is nothing to clean up and nothing that could leak into the store.
  const verdict = await reviewImage(sid, encoded.thumb);
  if (verdict.status === 'REJECTED') {
    logger.warn(`Product image rejected on upload for shop ${sid}, product ${product.id}`);
    return R.badRequest(res, verdict.reason);
  }

  const image = await prisma.$transaction(async tx => {
    await tx.productImage.deleteMany({ where: { productId: product.id } });
    const row = await tx.productImage.create({
      data: {
        shopId: sid, productId: product.id,
        full: encoded.full, thumb: encoded.thumb,
        width: encoded.width, height: encoded.height,
        bytes: encoded.full.length + encoded.thumb.length,
        status: verdict.status,
        reviewedAt: verdict.status === 'APPROVED' ? new Date() : null,
      },
      select: { id: true, bytes: true, width: true, height: true, status: true },
    });
    await tx.product.update({ where: { id: product.id }, data: { imageUrl: imagePath(row.id) } });
    return row;
  });

  return R.ok(res, {
    imageUrl: imagePath(image.id), status: image.status,
    bytes: image.bytes, width: image.width, height: image.height,
  });
}

/** DELETE /inventory/products/:id/image */
export async function deleteProductImage(req: AuthRequest, res: Response) {
  const sid = shop(req);
  const product = await prisma.product.findFirst({ where: { id: req.params.id, shopId: sid }, select: { id: true } });
  if (!product) return R.notFound(res, 'Product not found');
  await prisma.$transaction([
    prisma.productImage.deleteMany({ where: { productId: product.id } }),
    prisma.product.update({ where: { id: product.id }, data: { imageUrl: null } }),
  ]);
  return R.ok(res, { message: 'Image removed' });
}

/**
 * GET /public/images/:id[?s=thumb]
 *
 * Public, because a store visitor has no account. The id is an unguessable
 * cuid and the bytes were re-encoded without metadata, so there is nothing in
 * one beyond the picture itself. Cached for a year: an image never changes
 * under its id.
 */
export async function serveProductImage(req: Request, res: Response) {
  const id = String(req.params.id).replace(/\.webp$/, '');
  if (!/^[a-z0-9]{20,40}$/.test(id)) return res.status(404).end();
  const thumb = req.query.s === 'thumb';

  // Only approved images are served. A pending or rejected one does not
  // exist as far as the public is concerned.
  const row = await prisma.productImage.findFirst({
    where: { id, status: 'APPROVED' },
    select: thumb ? { thumb: true } : { full: true },
  });
  if (!row) return res.status(404).end();

  const data = (thumb ? (row as { thumb: Buffer }).thumb : (row as { full: Buffer }).full);
  res.set({
    'Content-Type': 'image/webp',
    'Cache-Control': 'public, max-age=31536000, immutable',
    // helmet sets same-origin by default, which stops the store at
    // mauzohalisi.com from showing a picture served by api.mauzohalisi.com.
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Content-Length': String(data.length),
  });
  return res.end(data);
}

/**
 * PATCH /inventory/products/publish  { isPublished, ids? }
 *
 * Lists (or hides) products in the online store in one go. Without ids it
 * applies to every active product that has stock, or does not track stock,
 * which is what "list everything I can sell" means: an out-of-stock product
 * in the store is only an order the shop has to turn down.
 */
export async function bulkPublish(req: AuthRequest, res: Response) {
  const sid = shop(req);
  const isPublished = req.body?.isPublished === true;
  const ids: string[] | null = Array.isArray(req.body?.ids) ? req.body.ids.map(String).slice(0, 1000) : null;

  let where: { shopId: string; isActive: boolean; id?: { in: string[] } } = { shopId: sid, isActive: true };
  if (ids) {
    where = { ...where, id: { in: ids } };
  } else if (isPublished) {
    const sellable = await prisma.product.findMany({
      where: { shopId: sid, isActive: true, OR: [{ trackStock: false }, { inventory: { some: { quantity: { gt: 0 } } } }] },
      select: { id: true },
    });
    where = { ...where, id: { in: sellable.map(p => p.id) } };
  }
  const { count } = await prisma.product.updateMany({ where, data: { isPublished } });
  return R.ok(res, { updated: count });
}
