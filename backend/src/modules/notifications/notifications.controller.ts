import { Response } from 'express';
import { AuthRequest } from '../../types';
import { prisma } from '../../core/prisma';
import * as R from '../../utils/response';
import { FCM_PREFIX } from '../../core/push';

const shop = (req: AuthRequest) => req.user!.shopId!;

/** The key the browser needs to create a subscription. Safe to expose. */
export async function getPublicKey(_req: AuthRequest, res: Response) {
  return R.ok(res, { publicKey: process.env.VAPID_PUBLIC_KEY ?? null });
}

/**
 * Register a device.
 *
 * Upserted on endpoint so re-subscribing on the same device updates the row
 * rather than adding another, which would deliver every alert twice. The shop
 * is taken from the token, not the body, so a device cannot register itself
 * against a shop the user has no access to.
 */
export async function subscribe(req: AuthRequest, res: Response) {
  const { endpoint, keys, fcmToken } = req.body ?? {};

  // The Android shell registers a Firebase token; browsers send a Web Push
  // subscription. Normalise both into one row shape.
  const id   = fcmToken ? `${FCM_PREFIX}${fcmToken}` : endpoint;
  const p256 = fcmToken ? '' : keys?.p256dh;
  const auth = fcmToken ? '' : keys?.auth;

  if (!id) return R.badRequest(res, 'A push endpoint or FCM token is required');
  if (!fcmToken && (!p256 || !auth)) {
    return R.badRequest(res, 'Subscription is missing its encryption keys');
  }

  const sub = await prisma.pushSubscription.upsert({
    where:  { endpoint: id },
    create: {
      endpoint: id, p256dh: p256, auth,
      userId: req.user!.sub, shopId: shop(req),
      userAgent: req.get('user-agent')?.slice(0, 255),
    },
    update: {
      p256dh: p256, auth,
      userId: req.user!.sub, shopId: shop(req),
      lastUsedAt: new Date(),
    },
    select: { id: true },
  });
  return R.created(res, sub);
}

/** Remove a device, on sign-out or when the user turns alerts off. */
export async function unsubscribe(req: AuthRequest, res: Response) {
  const { endpoint, fcmToken } = req.body ?? {};
  const id = fcmToken ? `${FCM_PREFIX}${fcmToken}` : endpoint;
  if (!id) return R.badRequest(res, 'A push endpoint or FCM token is required');

  // Scoped to the caller so one user cannot unregister another's device.
  await prisma.pushSubscription.deleteMany({ where: { endpoint: id, userId: req.user!.sub } });
  return R.ok(res, { removed: true });
}

/** Whether this shop has any device registered, for the settings toggle. */
export async function status(req: AuthRequest, res: Response) {
  const count = await prisma.pushSubscription.count({ where: { shopId: shop(req) } });
  return R.ok(res, { devices: count, configured: Boolean(process.env.VAPID_PUBLIC_KEY) });
}
