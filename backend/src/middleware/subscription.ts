import { Response, NextFunction } from 'express';
import { prisma } from '../core/prisma';
import { AuthRequest } from '../types';

export async function requireActiveSubscription(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user?.accountId) return res.status(403).json({ success: false, message: 'No account context' });

  const account = await prisma.ownerAccount.findUnique({
    where:  { id: req.user.accountId },
    select: { subscriptionActive: true, isActive: true, subscriptionExpiresAt: true, subscriptionPlan: true },
  });

  if (!account?.isActive) {
    return res.status(402).json({ success: false, message: 'Account suspended. Contact support.' });
  }

  // Auto-expire: if expiry date is set and has passed, cascade-deactivate
  if (account.subscriptionActive && account.subscriptionExpiresAt && account.subscriptionExpiresAt < new Date()) {
    await prisma.$transaction([
      prisma.ownerAccount.update({
        where: { id: req.user.accountId },
        data:  { subscriptionActive: false, isActive: false },
      }),
      prisma.shop.updateMany({
        where: { ownerAccountId: req.user.accountId },
        data:  { isActive: false },
      }),
    ]);
    return res.status(402).json({
      success: false,
      code:    'SUBSCRIPTION_EXPIRED',
      message: 'Your subscription has expired. Please contact support to reactivate your account.',
    });
  }

  if (!account.subscriptionActive) {
    return res.status(402).json({
      success: false,
      code:    'SUBSCRIPTION_INACTIVE',
      message: 'Subscription not active. Contact your platform administrator.',
    });
  }

  next();
}
