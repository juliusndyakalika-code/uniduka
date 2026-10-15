import sharp from 'sharp';
import { z } from 'zod';
import { prisma } from './prisma';
import { logger } from '../utils/logger';
import { aiImage, aiReady } from './ai';

/**
 * Deciding whether a product photo may be shown to the public.
 *
 * The online store is the one place where anything an account uploads is
 * shown to strangers, so pictures are checked before they are shown, not
 * after someone complains. Two checks, in order:
 *
 *   1. Is it a real picture? Decoding is checked on upload; here a blank or
 *      single-colour image is refused, because it is never a product photo.
 *   2. Is it acceptable? The AI looks at the thumbnail and refuses nudity,
 *      sexual content, graphic violence and hate symbols. A refusal by the
 *      model to look at the image at all is treated as a rejection: that is
 *      what refusing usually means here.
 *
 * When the AI is not available (no key, an outage, the day's allowance
 * spent) the image is kept as PENDING and is not shown to anyone until the
 * sweep below has reviewed it. Failing open would publish whatever was
 * uploaded during an outage; failing closed would block every upload.
 */

export type Verdict =
  | { status: 'APPROVED' }
  | { status: 'REJECTED'; reason: string }
  | { status: 'PENDING' };

/** Owner-facing wording for each category the model can return. */
const REASONS: Record<string, string> = {
  sexual:   'This photo appears to contain sexual content or nudity, which is not allowed in the online store.',
  violence: 'This photo appears to show graphic violence or injury, which is not allowed in the online store.',
  hate:     'This photo appears to contain hateful symbols or messages, which are not allowed in the online store.',
  refused:  'This photo could not be approved for the online store. Use a clear photo of the product.',
  blank:    'This photo looks blank. Use a clear photo of the product.',
};

/** Nearly one colour across the whole image: a blank, a black frame, a solid fill. */
export async function looksBlank(img: Buffer): Promise<boolean> {
  const { channels } = await sharp(img).stats();
  const spread = Math.max(...channels.slice(0, 3).map(c => c.stdev));
  return spread < 4;
}

const Judgement = z.object({
  allowed: z.boolean().describe('True if this image is acceptable to show publicly in a general online shop'),
  category: z.enum(['none', 'sexual', 'violence', 'hate']).describe(
    'Why it is not allowed: sexual (nudity, sexual acts, sexualised poses, explicit material), ' +
    'violence (graphic violence, gore, injury), hate (hate symbols or slogans). none if allowed.'),
});

const SYSTEM =
  'You review photos that small shops in Tanzania upload for their public online store. ' +
  'Decide only whether the image is acceptable to show to the general public. ' +
  'Not allowed: nudity or sexual content of any kind, graphic violence or gore, hate symbols. ' +
  'Allowed: any ordinary product or merchandise, including medicines, alcohol, underwear shown ' +
  'on its own or on a mannequin, beauty products, food, logos, price lists and shop interiors. ' +
  'Judge what is visible, not the product category.';

/** Reviews one encoded image (pass the thumbnail: it is small and enough to judge). */
export async function reviewImage(shopId: string, thumb: Buffer): Promise<Verdict> {
  if (await looksBlank(thumb)) return { status: 'REJECTED', reason: REASONS.blank };
  if (!aiReady) return { status: 'PENDING' };

  const out = await aiImage({
    kind: 'moderation', shopId, system: SYSTEM, schema: Judgement,
    prompt: 'Is this image acceptable for a public online shop?',
    image: { mediaType: 'image/webp', data: thumb.toString('base64') },
    maxTokens: 2_000, effort: 'low',
  });

  if (out.status === 'unavailable') return { status: 'PENDING' };
  if (out.status === 'refused') return { status: 'REJECTED', reason: REASONS.refused };
  if (out.value.allowed) return { status: 'APPROVED' };
  return { status: 'REJECTED', reason: REASONS[out.value.category] ?? REASONS.refused };
}

/** Reviews images left PENDING, oldest first, a small batch at a time. */
export async function sweepPendingImages(): Promise<number> {
  if (!aiReady) return 0;
  const pending = await prisma.productImage.findMany({
    where: { status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
    take: 20,
    select: { id: true, shopId: true, thumb: true },
  });
  let done = 0;
  for (const img of pending) {
    const v = await reviewImage(img.shopId, Buffer.from(img.thumb));
    if (v.status === 'PENDING') continue;
    await prisma.productImage.update({
      where: { id: img.id },
      data: { status: v.status, reason: v.status === 'REJECTED' ? v.reason : null, reviewedAt: new Date() },
    });
    if (v.status === 'REJECTED') logger.warn(`Product image ${img.id} rejected for shop ${img.shopId}`);
    done++;
  }
  return done;
}

export function startImageReview() {
  const run = () => sweepPendingImages().catch(err =>
    logger.error(`Image review sweep failed: ${(err as Error).message}`));
  setTimeout(run, 90_000).unref();
  setInterval(run, 5 * 60_000).unref();
}
