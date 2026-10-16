import path from 'node:path';
import { Worker } from 'node:worker_threads';
import sharp from 'sharp';
import { z } from 'zod';
import { prisma } from './prisma';
import { Prisma } from '@prisma/client';
import { logger } from '../utils/logger';
import { aiImage, aiReady } from './ai';
import { describeImage, describeUntagged } from './looks';

/**
 * Deciding whether a product photo may be shown to the public.
 *
 * The online store is the one place where anything an account uploads is
 * shown to strangers, so pictures are checked before they are shown, not
 * after someone complains. Two checks, in order:
 *
 *   1. Is it a real picture? Decoding is checked on upload; here a blank or
 *      single-colour image is refused, because it is never a product photo.
 *   2. Is it acceptable? A classifier that runs inside the API (NSFW.js,
 *      no key, no network, the photo never leaves the server) scores it:
 *        clearly explicit   rejected at once
 *        clearly clean      approved at once
 *        in between         (swimwear, underwear, a lot of skin) held
 *      A held photo goes to the AI if a key is configured, and otherwise to
 *      the review queue in the admin portal, where a person decides.
 *
 * A held photo is PENDING and shown to nobody until it is decided. Failing
 * open would publish whatever slipped through; failing closed would block
 * every upload whenever the classifier hiccups.
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

// ── The built-in classifier ─────────────────────────────────────────────────

export type Scores = Partial<Record<'porn' | 'hentai' | 'sexy' | 'neutral' | 'drawing', number>>;

const SIZE = 224;
let worker: Worker | null = null;
let seq = 0;
const waiting = new Map<number, { ok: (s: Scores) => void; fail: (e: Error) => void; timer: NodeJS.Timeout }>();

function getWorker(): Worker {
  if (worker) return worker;
  // Compiled, the worker sits next to this file as .js. Under ts-node-dev in
  // development it is still .ts and needs ts-node to load.
  const isTs = __filename.endsWith('.ts');
  const w = new Worker(path.join(__dirname, `nsfwWorker.${isTs ? 'ts' : 'js'}`), {
    execArgv: isTs ? ['-r', 'ts-node/register/transpile-only'] : [],
  });
  w.on('message', (m: { id: number; scores?: Scores; error?: string }) => {
    const job = waiting.get(m.id);
    if (!job) return;
    waiting.delete(m.id);
    clearTimeout(job.timer);
    if (m.scores) job.ok(m.scores); else job.fail(new Error(m.error || 'classifier failed'));
  });
  const reset = (why: string) => {
    logger.error(`Image classifier worker stopped: ${why}`);
    for (const [, job] of waiting) { clearTimeout(job.timer); job.fail(new Error('classifier stopped')); }
    waiting.clear();
    worker = null;
  };
  w.on('error', e => reset(e.message));
  w.on('exit', code => { if (worker === w) reset(`exit ${code}`); });
  w.unref();
  worker = w;
  return w;
}

/** Class probabilities for an image, from the classifier thread. */
export async function classify(img: Buffer): Promise<Scores> {
  const { data } = await sharp(img).resize(SIZE, SIZE, { fit: 'cover' }).removeAlpha().raw()
    .toBuffer({ resolveWithObject: true });
  const id = ++seq;
  return new Promise<Scores>((ok, fail) => {
    // The first call also loads the model, which takes a few seconds.
    const timer = setTimeout(() => { waiting.delete(id); fail(new Error('classifier timed out')); }, 30_000);
    waiting.set(id, { ok, fail, timer });
    getWorker().postMessage({ id, pixels: new Uint8Array(data), size: SIZE });
  });
}

/** What the scores mean for this store. Thresholds lean towards holding, not publishing. */
export function readScores(s: Scores): 'reject' | 'hold' | 'allow' {
  const porn = s.porn ?? 0, hentai = s.hentai ?? 0, sexy = s.sexy ?? 0;
  if (porn >= 0.7 || hentai >= 0.7 || porn + hentai >= 0.8) return 'reject';
  if (porn + hentai >= 0.15 || sexy >= 0.35) return 'hold';
  return 'allow';
}

export interface Review { verdict: Verdict; scores: Scores | null }

/** Reviews one encoded image (pass the thumbnail: it is small and enough to judge). */
export async function reviewImage(shopId: string, thumb: Buffer): Promise<Review> {
  if (await looksBlank(thumb)) return { verdict: { status: 'REJECTED', reason: REASONS.blank }, scores: null };

  let scores: Scores | null = null;
  try {
    scores = await classify(thumb);
    const read = readScores(scores);
    if (read === 'reject') return { verdict: { status: 'REJECTED', reason: REASONS.sexual }, scores };
    if (read === 'allow') return { verdict: { status: 'APPROVED' }, scores };
  } catch (err) {
    logger.error(`Image classifier failed for shop ${shopId}: ${(err as Error).message}`);
  }
  // Held, or the classifier could not run: a second opinion if there is one.
  return { verdict: await askAi(shopId, thumb), scores };
}

async function askAi(shopId: string, thumb: Buffer): Promise<Verdict> {
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

/**
 * Reviews images left PENDING, oldest first, a small batch at a time.
 *
 * Images never checked (uploaded before the classifier, or while it was
 * down) get the full review. Images already held by the classifier only get
 * another look if the AI is available; otherwise they wait for a person in
 * the admin portal.
 */
export async function sweepPendingImages(): Promise<number> {
  const unscored = { status: 'PENDING', scores: { equals: Prisma.DbNull } };
  const pending = await prisma.productImage.findMany({
    where: aiReady ? { status: 'PENDING' } : unscored,
    orderBy: { createdAt: 'asc' },
    take: 20,
    select: { id: true, shopId: true, thumb: true },
  });
  let done = 0;
  for (const img of pending) {
    const { verdict, scores } = await reviewImage(img.shopId, Buffer.from(img.thumb));
    await prisma.productImage.update({
      where: { id: img.id },
      data: {
        status: verdict.status,
        reason: verdict.status === 'REJECTED' ? verdict.reason : null,
        reviewedAt: verdict.status === 'PENDING' ? null : new Date(),
        ...(scores && { scores }),
      },
    });
    if (verdict.status === 'REJECTED') logger.warn(`Product image ${img.id} rejected for shop ${img.shopId}`);
    if (verdict.status === 'APPROVED') await describeImage(img.id);
    if (verdict.status !== 'PENDING') done++;
  }
  return done;
}

export function startImageReview() {
  const run = () => sweepPendingImages()
    .then(() => describeUntagged())
    .catch(err => logger.error(`Image review sweep failed: ${(err as Error).message}`));
  setTimeout(run, 90_000).unref();
  setInterval(run, 5 * 60_000).unref();
}
