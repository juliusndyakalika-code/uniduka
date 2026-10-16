import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { z } from 'zod';
import { logger } from '../utils/logger';
import { redis } from './redis';
import { mask } from './errorLog';

/**
 * The one door to the language model.
 *
 * Every AI feature goes through here so the rules are written once:
 *
 *   - Off unless configured. Without ANTHROPIC_API_KEY (or with AI_ENABLED=0)
 *     every call returns null and the feature quietly does without, the way
 *     SMS behaves without a gateway key.
 *   - Capped per shop per day, so one shop cannot run up the bill. The cap
 *     fails closed: if the counter cannot be read, the call is not made.
 *   - Personal data masked before it leaves. Phone numbers and emails have no
 *     business in a prompt about sales figures.
 *   - Refusals are not errors. The request carries server-side fallbacks, and
 *     if the whole chain still declines, the caller gets null like any other
 *     miss.
 */

const KEY = process.env.ANTHROPIC_API_KEY ?? '';
export const aiReady = !!KEY && process.env.AI_ENABLED !== '0';
export const AI_MODEL = process.env.AI_MODEL || 'claude-opus-5-5';

const client = aiReady ? new Anthropic({ apiKey: KEY, maxRetries: 2, timeout: 60_000 }) : null;
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

export type AiKind = 'insight' | 'invoice' | 'moderation' | 'tagging';

/** Calls per shop per day. Generous for real use, low enough to bound cost. */
const DAILY_CAP: Record<AiKind, number> = {
  insight: Number(process.env.AI_INSIGHT_DAILY_CAP) || 20,
  invoice: Number(process.env.AI_INVOICE_DAILY_CAP) || 30,
  moderation: Number(process.env.AI_MODERATION_DAILY_CAP) || 300,
  tagging: Number(process.env.AI_TAGGING_DAILY_CAP) || 300,
};

/** Takes one unit of today's allowance. False when spent or unreadable. */
export async function takeAllowance(shopId: string, kind: AiKind): Promise<boolean> {
  const day = new Date().toISOString().slice(0, 10);
  const key = `ai:${kind}:${shopId}:${day}`;
  try {
    const n = await redis.incr(key);
    if (n === 1) await redis.expire(key, 2 * 86_400);
    return n <= DAILY_CAP[kind];
  } catch (err) {
    logger.error(`AI allowance unreadable, refusing ${kind} for shop ${shopId}: ${(err as Error).message}`);
    return false;
  }
}

/** What is left today, for telling the owner before they try. */
export async function allowanceLeft(shopId: string, kind: AiKind): Promise<number> {
  const day = new Date().toISOString().slice(0, 10);
  try {
    const n = Number(await redis.get(`ai:${kind}:${shopId}:${day}`)) || 0;
    return Math.max(0, DAILY_CAP[kind] - n);
  } catch {
    return 0;
  }
}

function logUsage(kind: AiKind, shopId: string, usage: { input_tokens: number; output_tokens: number }) {
  logger.info(`AI ${kind} shop=${shopId} model=${AI_MODEL} in=${usage.input_tokens} out=${usage.output_tokens}`);
}

function logFailure(kind: AiKind, shopId: string, err: unknown) {
  if (err instanceof Anthropic.RateLimitError) {
    logger.warn(`AI ${kind} rate limited for shop ${shopId}`);
  } else if (err instanceof Anthropic.APIError) {
    logger.error(`AI ${kind} failed for shop ${shopId}: ${err.status} ${err.message}`);
  } else {
    logger.error(`AI ${kind} failed for shop ${shopId}: ${(err as Error).message}`);
  }
}

/** A short piece of text, or null when AI is off, capped, refused or failing. */
export async function aiText(opts: {
  kind: AiKind;
  shopId: string;
  system: string;
  prompt: string;
  maxTokens?: number;
}): Promise<string | null> {
  if (!client) return null;
  if (!(await takeAllowance(opts.shopId, opts.kind))) return null;
  try {
    const res = await client.beta.messages.create({
      model: AI_MODEL,
      max_tokens: opts.maxTokens ?? 2_000,
      betas: [FALLBACK_BETA],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      system: opts.system,
      messages: [{ role: 'user', content: mask(opts.prompt) }],
    });
    logUsage(opts.kind, opts.shopId, res.usage);
    if (res.stop_reason === 'refusal') return null;
    const text = res.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map(b => b.text).join('').trim();
    return text || null;
  } catch (err) {
    logFailure(opts.kind, opts.shopId, err);
    return null;
  }
}

export type AiImage = { mediaType: 'image/jpeg' | 'image/png' | 'image/webp'; data: string };

/**
 * The outcome of an image request, keeping apart the cases a caller treats
 * differently: content moderation reads a refusal as "reject", but an outage
 * or a spent allowance as "try again later".
 */
export type ImageOutcome<T> =
  | { status: 'ok'; value: T }
  | { status: 'refused' }
  | { status: 'unavailable' };

export async function aiImage<S extends z.ZodType>(opts: {
  kind: AiKind;
  shopId: string;
  system: string;
  prompt: string;
  image: AiImage;
  schema: S;
  maxTokens?: number;
  effort?: 'low' | 'medium';
}): Promise<ImageOutcome<z.infer<S>>> {
  if (!client) return { status: 'unavailable' };
  if (!(await takeAllowance(opts.shopId, opts.kind))) return { status: 'unavailable' };
  try {
    const res = await client.beta.messages.parse({
      model: AI_MODEL,
      max_tokens: opts.maxTokens ?? 8_000,
      betas: [FALLBACK_BETA],
      fallbacks: 'default',
      output_config: { effort: opts.effort ?? 'medium', format: betaZodOutputFormat(opts.schema) },
      system: opts.system,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: opts.image.mediaType, data: opts.image.data } },
          { type: 'text', text: opts.prompt },
        ],
      }],
    });
    logUsage(opts.kind, opts.shopId, res.usage);
    if (res.stop_reason === 'refusal') return { status: 'refused' };
    if (res.stop_reason === 'max_tokens' || res.parsed_output == null) return { status: 'unavailable' };
    return { status: 'ok', value: res.parsed_output as z.infer<S> };
  } catch (err) {
    logFailure(opts.kind, opts.shopId, err);
    return { status: 'unavailable' };
  }
}

/** Structured output read from an image, validated against the schema. */
export async function aiReadImage<S extends z.ZodType>(opts: {
  kind: AiKind;
  shopId: string;
  system: string;
  prompt: string;
  image: AiImage;
  schema: S;
  maxTokens?: number;
}): Promise<z.infer<S> | null> {
  const out = await aiImage(opts);
  return out.status === 'ok' ? out.value : null;
}
