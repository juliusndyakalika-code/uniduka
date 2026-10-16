import sharp from 'sharp';
import { z } from 'zod';
import { prisma } from './prisma';
import { logger } from '../utils/logger';
import { aiImage, aiReady } from './ai';

/**
 * Words for how a product looks, so marketplace search can find "red shoes"
 * when the product is only called "Viatu vya ngozi".
 *
 *   Colours: worked out here from the pixels, no key needed. The photo is
 *   shrunk to 48px, near-white background pixels are ignored (most product
 *   photos sit on white), and every colour covering a fair share of what is
 *   left becomes a tag, in English and Kiswahili.
 *
 *   Description: when an AI key is configured, the model adds a few words
 *   for the kind of item, material and style. Without one, colours alone.
 *
 * Only approved photos are described; a held photo is not searchable.
 */

const COLOUR_WORDS: Record<string, string[]> = {
  red: ['red', 'nyekundu'], orange: ['orange', 'chungwa'], yellow: ['yellow', 'njano'],
  green: ['green', 'kijani'], blue: ['blue', 'bluu'], purple: ['purple', 'zambarau'],
  pink: ['pink', 'waridi'], brown: ['brown', 'kahawia'], black: ['black', 'nyeusi'],
  white: ['white', 'nyeupe'], gray: ['gray', 'grey', 'kijivu'],
};

function nameOf(r: number, g: number, b: number): string | null {
  const max = Math.max(r, g, b) / 255, min = Math.min(r, g, b) / 255;
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (l > 0.93) return null;                  // background white: not the product
  if (l < 0.14) return 'black';
  if (s < 0.14) return l > 0.8 ? 'white' : 'gray';
  let h: number;
  const R = r / 255, G = g / 255, B = b / 255;
  if (max === R) h = 60 * (((G - B) / d) % 6);
  else if (max === G) h = 60 * ((B - R) / d + 2);
  else h = 60 * ((R - G) / d + 4);
  if (h < 0) h += 360;
  if (h < 15 || h >= 345) return l < 0.3 ? 'brown' : 'red';
  if (h < 40) return l < 0.42 ? 'brown' : 'orange';
  if (h < 66) return l < 0.35 ? 'brown' : 'yellow';
  if (h < 170) return 'green';
  if (h < 255) return 'blue';
  if (h < 290) return 'purple';
  return 'pink';
}

/** The main colours of an image, as search words. */
export async function colourTags(img: Buffer): Promise<string[]> {
  const { data, info } = await sharp(img).resize(48, 48, { fit: 'inside' }).removeAlpha().raw()
    .toBuffer({ resolveWithObject: true });
  const counts = new Map<string, number>();
  let considered = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    const n = nameOf(data[i], data[i + 1], data[i + 2]);
    if (!n) continue;
    considered++;
    counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  if (considered < 40) return COLOUR_WORDS.white;   // almost all white: a white product
  return [...counts.entries()]
    .filter(([, c]) => c / considered >= 0.18)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .flatMap(([name]) => COLOUR_WORDS[name]);
}

const Described = z.object({
  tags: z.array(z.string()).describe(
    'Up to 8 short lowercase search words for what this item is and looks like: the kind of item, ' +
    'material, style, pattern. Give each in English and, where common, in Kiswahili.'),
});

async function aiTags(shopId: string, thumb: Buffer): Promise<string[]> {
  if (!aiReady) return [];
  const out = await aiImage({
    kind: 'tagging', shopId, schema: Described, maxTokens: 2_000, effort: 'low',
    system: 'You write search keywords for product photos in Tanzanian online shops.',
    prompt: 'List search words for the product in this photo.',
    image: { mediaType: 'image/webp', data: thumb.toString('base64') },
  });
  if (out.status !== 'ok') return [];
  return out.value.tags.map(t => t.toLowerCase().trim()).filter(t => /^[\p{L}\p{N} -]{2,24}$/u.test(t)).slice(0, 16);
}

/** Computes and stores the look tags for one approved image. Never throws. */
export async function describeImage(imageId: string): Promise<void> {
  try {
    const img = await prisma.productImage.findUnique({
      where: { id: imageId }, select: { shopId: true, thumb: true, status: true },
    });
    if (!img || img.status !== 'APPROVED') return;
    const thumb = Buffer.from(img.thumb);
    const tags = [...new Set([...(await colourTags(thumb)), ...(await aiTags(img.shopId, thumb))])];
    await prisma.productImage.update({ where: { id: imageId }, data: { tags } });
  } catch (err) {
    logger.error(`Describing image ${imageId} failed: ${(err as Error).message}`);
  }
}

/** Backfill: approved images not yet described, a batch at a time. */
export async function describeUntagged(): Promise<number> {
  const rows = await prisma.productImage.findMany({
    where: { status: 'APPROVED', tags: { isEmpty: true } },
    take: 30, select: { id: true },
  });
  for (const r of rows) await describeImage(r.id);
  return rows.length;
}
