import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UserRole } from '@prisma/client';
import { AuthRequest, JwtPayload } from '../types';
import { unauthorized, forbidden } from '../utils/response';

const SECRET = process.env.JWT_SECRET || 'uniduka-secret-change-in-prod';

export function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return unauthorized(res);

  try {
    const token = header.slice(7);
    req.user = jwt.verify(token, SECRET) as JwtPayload;
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
