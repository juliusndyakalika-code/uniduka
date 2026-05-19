import { UserRole } from '@prisma/client';
import { Request } from 'express';

export interface JwtPayload {
  sub: string;         // user id
  accountId: string;   // owner account id
  role: UserRole;
  shopId?: string;     // current active shop context
  iat?: number;
  exp?: number;
}

export interface AuthRequest extends Request {
  user?: JwtPayload;
}
