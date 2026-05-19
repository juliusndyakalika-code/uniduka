import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types';
import { prisma } from '../core/prisma';

export function auditLog(action: string, entity: string) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      if (res.statusCode < 400 && req.user) {
        prisma.auditLog.create({
          data: {
            shopId: req.user.shopId,
            userId: req.user.sub,
            action,
            entity,
            entityId: (req.params.id as string) || undefined,
            after: body as never,
            ip: req.ip,
            userAgent: req.get('user-agent'),
          },
        }).catch(() => {});
      }
      return originalJson(body);
    };
    next();
  };
}
