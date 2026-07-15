import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UserRole } from '@prisma/client';
import { AuthRequest, JwtPayload } from '../types';
import { unauthorized, forbidden } from '../utils/response';
import { prisma } from '../core/prisma';

const SECRET = process.env.JWT_SECRET || 'uniduka-secret-change-in-prod';

// Throttle lastSeenAt writes: track last update time per userId in memory
const lastSeenCache = new Map<string, number>();
const SEEN_TTL_MS = 60_000; // update DB at most once per minute per user

function touchLastSeen(userId: string) {
  const now = Date.now();
  const last = lastSeenCache.get(userId) ?? 0;
  if (now - last < SEEN_TTL_MS) return;
  lastSeenCache.set(userId, now);
  // fire-and-forget — never block the request
  prisma.user.update({ where: { id: userId }, data: { lastSeenAt: new Date() } }).catch(() => {});
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return unauthorized(res);

  try {
    const token = header.slice(7);
    req.user = jwt.verify(token, SECRET) as JwtPayload;
    touchLastSeen(req.user.sub);
    next();
  } catch {
    unauthorized(res, 'Token invalid or expired');
  }
}

export function authorize(...roles: UserRole[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) return unauthorized(res);
    if (!roles.includes(req.user.role)) return forbidden(res, 'Insufficient permissions');
    next();
  };
}

export function requireShop(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user?.shopId) return forbidden(res, 'No active shop context');
  next();
}
