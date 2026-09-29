import { Response, NextFunction } from 'express';
import { prisma } from '../core/prisma';
import { AuthRequest } from '../types';

export async function requireActiveSubscription(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user?.accountId) return res.status(403).json({ success: false, message: 'No account context' });

  const account = await prisma.ownerAccount.findUnique({
    where:  { id: req.user.accountId },
    select: { subscriptionActive: true, isActive: true, subscriptionExpiresAt: true, subscriptionPlan: true },
  });

  // isActive is the platform admin's suspension switch, and nothing else may
  // set it. It used to be flipped by the expiry branch below too, which made a
  // lapsed trial indistinguishable from a banned account and left the owner
  // reading "contact support" with nobody to contact.
  if (!account?.isActive) {
    return res.status(402).json({
      success: false,
      code:    'ACCOUNT_SUSPENDED',
      message: 'Account suspended. Contact support.',
    });
  }

  // Auto-expire. This marks the subscription lapsed and nothing else.
  //
  // It used to also set the account's isActive to false and deactivate every
  // shop, which was wrong in two ways that compounded. It borrowed the admin
  // suspension flag for something an admin had not done, so the next request
  // answered "Account suspended. Contact support." with no code for the client
  // to act on. And paying did not undo any of it: applyResult restores the
  // subscription fields only, so an owner whose trial ran out could pay and
  // stay locked out of shops that were still switched off.
  //
  // Access is already refused by this gate, so deactivating the shops bought
  // nothing and destroyed the owner's own open/closed setting on the way.
  if (account.subscriptionActive && account.subscriptionExpiresAt && account.subscriptionExpiresAt < new Date()) {
    await prisma.ownerAccount.update({
      where: { id: req.user.accountId },
      data:  { subscriptionActive: false },
    });
    return res.status(402).json({
      success: false,
      code:    'SUBSCRIPTION_EXPIRED',
      message: 'Your subscription has expired. Renew in the app to continue.',
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
