import crypto from 'crypto';
import type { Request, Response } from 'express';
import { prisma } from './prisma';
import { logger } from '../utils/logger';

/**
 * Refresh tokens, issued as a cookie the page cannot read.
 *
 * They were bare JWTs returned in the body and kept in localStorage, which is
 * reachable by any script running on the origin. A single XSS therefore bought
 * not just the short-lived access token but the long-lived refresh token with
 * it, turning a momentary compromise into a persistent one that survived the
 * access token expiring and could not be revoked.
 *
 * Three changes together fix that. The token is opaque and random rather than
 * a JWT, so it carries no claims and means nothing without the row behind it.
 * It travels in an httpOnly cookie, so script cannot read it. And it rotates
 * on every use, with the whole family revoked if a spent one is presented
 * again, which is the only reliable signal that a copy has been stolen.
 */

const DAYS = 7;
export const REFRESH_COOKIE = 'mh_rt';

/**
 * Cross-site or same-site, decided by configuration rather than assumed.
 *
 * The browser treats mauzohalisi.com and the API's railway.app host as
 * different sites, so the cookie must be SameSite=None to be sent at all —
 * and Safari and some privacy modes block third-party cookies outright, which
 * would break refresh for those users. Serving the API from a subdomain of
 * the same registrable domain makes it first-party and SameSite=Lax, which is
 * both safer and more reliable. COOKIE_SAMESITE exists so that move needs no
 * code change.
 */
const SAME_SITE = (process.env.COOKIE_SAMESITE ?? 'none').toLowerCase() as 'none' | 'lax' | 'strict';
/** Set to share the cookie across api.example.com and example.com. */
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || undefined;
const SECURE = process.env.NODE_ENV === 'production' || SAME_SITE === 'none';

const hash = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

function cookieOptions() {
  return {
    httpOnly: true,
    secure: SECURE,
    sameSite: SAME_SITE,
    domain: COOKIE_DOMAIN,
    path: '/api/v1/auth',   // sent only where it is needed
    maxAge: DAYS * 24 * 60 * 60 * 1000,
  } as const;
}

/**
 * Mint a refresh token, record its hash, and put it on the response.
 *
 * Returns nothing to the caller on purpose: the token must not end up in a
 * response body, which is the habit this replaces.
 */
export async function issueRefresh(res: Response, req: Request, userId: string): Promise<void> {
  // 32 random bytes, not a JWT. There is nothing to read inside it and nothing
  // to forge; it is a lookup key and the row is the authority.
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + DAYS * 24 * 60 * 60 * 1000);

  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hash(token),
      expiresAt,
      userAgent: req.get('user-agent')?.slice(0, 250) ?? null,
      ip: req.ip ?? null,
    },
  });

  res.cookie(REFRESH_COOKIE, token, cookieOptions());
}

export interface RotateResult {
  ok: boolean;
  userId?: string;
  /** True when a spent token was presented, which means a copy is loose. */
  reuse?: boolean;
}

/**
 * Exchange a refresh token for a new one.
 *
 * A token is single use. Presenting a spent one is either a stolen copy or a
 * client that failed mid-rotation, and both are handled the same way: every
 * outstanding token for that user is revoked and they sign in again. Treating
 * it leniently would make the detection worthless, since a thief would simply
 * race the legitimate client.
 */
export async function rotateRefresh(req: Request, res: Response): Promise<RotateResult> {
  const raw = (req.cookies?.[REFRESH_COOKIE] as string | undefined)?.trim();
  if (!raw) return { ok: false };

  const row = await prisma.refreshToken.findUnique({ where: { tokenHash: hash(raw) } });
  if (!row) return { ok: false };

  if (row.usedAt || row.revokedAt) {
    logger.warn(`Refresh token reuse detected for user ${row.userId} — revoking all sessions`);
    await revokeAll(row.userId);
    clearRefresh(res);
    return { ok: false, reuse: true };
  }

  if (row.expiresAt < new Date()) {
    clearRefresh(res);
    return { ok: false };
  }

  // Marked spent and replaced in one step, so two concurrent refreshes cannot
  // both succeed and leave two live families behind.
  await prisma.refreshToken.update({ where: { id: row.id }, data: { usedAt: new Date() } });
  await issueRefresh(res, req, row.userId);
  return { ok: true, userId: row.userId };
}

export async function revokeAll(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data:  { revokedAt: new Date() },
  });
}

/** Revoke the token on this request, for an ordinary sign out. */
export async function revokeCurrent(req: Request, res: Response): Promise<void> {
  const raw = (req.cookies?.[REFRESH_COOKIE] as string | undefined)?.trim();
  if (raw) {
    await prisma.refreshToken.updateMany({
      where: { tokenHash: hash(raw), revokedAt: null },
      data:  { revokedAt: new Date() },
    }).catch(() => { /* signing out must not fail on a missing row */ });
  }
  clearRefresh(res);
}

export function clearRefresh(res: Response): void {
  // Same attributes as when it was set, or the browser keeps the old one.
  const { maxAge: _maxAge, ...rest } = cookieOptions();
  res.clearCookie(REFRESH_COOKIE, rest);
}

/**
 * Drop tokens that are long past use.
 *
 * Spent and revoked rows are kept for a while on purpose: reuse detection
 * needs to recognise a token that has already been exchanged, and deleting it
 * immediately would make a replayed token look merely unknown.
 */
export async function pruneRefreshTokens(): Promise<void> {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const { count } = await prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: cutoff } } });
  if (count) logger.info(`Pruned ${count} expired refresh tokens`);
}
