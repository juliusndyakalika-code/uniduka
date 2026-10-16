import { Response } from 'express';
import { AuthRequest } from '../../types';
import { prisma } from '../../core/prisma';
import * as R from '../../utils/response';
import { describeImage } from '../../core/looks';

/**
 * The admin portal's photo review queue.
 *
 * Product photos the built-in checker could not clear on its own (a lot of
 * skin, swimwear, underwear) wait here, unseen by customers, until a person
 * approves or rejects them. The thumbnail is sent inline: the public image
 * route deliberately refuses anything not yet approved.
 */

const REJECT_DEFAULT = 'This photo was not approved for the online store. Use a clear photo of the product.';

/** GET /platform/images?status=PENDING|REJECTED|APPROVED */
export async function listImages(req: AuthRequest, res: Response) {
  const status = ['PENDING', 'REJECTED', 'APPROVED'].includes(String(req.query.status))
    ? String(req.query.status) : 'PENDING';
  const [rows, counts] = await Promise.all([
    prisma.productImage.findMany({
      where: { status },
      orderBy: { createdAt: status === 'PENDING' ? 'asc' : 'desc' },
      take: 60,
      select: {
        id: true, status: true, reason: true, scores: true, createdAt: true, reviewedAt: true, thumb: true,
        product: { select: { name: true, shop: { select: { tradingName: true, slug: true } } } },
      },
    }),
    prisma.productImage.groupBy({ by: ['status'], _count: true }),
  ]);
  return R.ok(res, {
    counts: Object.fromEntries(counts.map(c => [c.status, c._count])),
    items: rows.map(r => ({
      id: r.id, status: r.status, reason: r.reason, scores: r.scores,
      createdAt: r.createdAt, reviewedAt: r.reviewedAt,
      product: r.product.name, shop: r.product.shop.tradingName, slug: r.product.shop.slug,
      thumb: `data:image/webp;base64,${Buffer.from(r.thumb).toString('base64')}`,
    })),
  });
}

/** POST /platform/images/:id/decision  { approve: boolean, reason? } */
export async function decideImage(req: AuthRequest, res: Response) {
  const approve = req.body?.approve === true;
  const reason = approve ? null : (String(req.body?.reason ?? '').trim().slice(0, 300) || REJECT_DEFAULT);
  const { count } = await prisma.productImage.updateMany({
    where: { id: req.params.id },
    data: { status: approve ? 'APPROVED' : 'REJECTED', reason, reviewedAt: new Date() },
  });
  if (!count) return R.notFound(res, 'Image not found');
  if (approve) void describeImage(req.params.id);
  return R.ok(res, { status: approve ? 'APPROVED' : 'REJECTED' });
}
