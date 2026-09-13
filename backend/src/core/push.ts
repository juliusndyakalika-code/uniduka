/**
 * Outbound push delivery.
 *
 * Two transports, because the clients genuinely differ:
 *
 *   Web Push (VAPID)  browsers and installed PWAs. The subscription carries its
 *                     own endpoint and encryption keys.
 *   FCM               the Android app. Android System WebView does not
 *                     implement the Push API at all, so the shell registers a
 *                     Firebase token natively and that token is stored in the
 *                     same table with a `fcm:` endpoint prefix.
 *
 * Sending is always best-effort. A push that fails must never fail the thing
 * that triggered it: an order is still a valid order if the shop's phone is off.
 */
import webpush from 'web-push';
import { prisma } from './prisma';
import { logger } from '../utils/logger';

const PUBLIC_KEY  = process.env.VAPID_PUBLIC_KEY  ?? '';
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? '';
const SUBJECT     = process.env.VAPID_SUBJECT ?? 'mailto:info@mauzohalisi.com';

export const webPushReady = Boolean(PUBLIC_KEY && PRIVATE_KEY);
if (webPushReady) {
  webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
} else {
  logger.warn('VAPID keys not set — web push is disabled');
}

/** Marks a row as an FCM token rather than a Web Push endpoint. */
export const FCM_PREFIX = 'fcm:';

export interface PushMessage {
  title: string;
  body: string;
  /** Path within the app to open when the notification is tapped. */
  url?: string;
  tag?: string;
}

/**
 * Send to every device registered against a shop.
 *
 * Subscriptions the push service rejects as gone (404/410) are deleted. A
 * browser discards its subscription when the user clears site data or
 * reinstalls, and without this the table fills with endpoints that can never
 * be delivered to again.
 */
export async function pushToShop(shopId: string, msg: PushMessage): Promise<void> {
  const subs = await prisma.pushSubscription.findMany({ where: { shopId } });
  if (subs.length === 0) return;

  const payload = JSON.stringify(msg);
  const dead: string[] = [];

  await Promise.all(subs.map(async (sub) => {
    try {
      if (sub.endpoint.startsWith(FCM_PREFIX)) {
        await sendFcm(sub.endpoint.slice(FCM_PREFIX.length), msg);
        return;
      }
      if (!webPushReady) return;
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      );
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) dead.push(sub.endpoint);
      else logger.warn(`push failed for ${sub.endpoint.slice(0, 40)}: ${(err as Error).message}`);
    }
  }));

  if (dead.length) {
    await prisma.pushSubscription.deleteMany({ where: { endpoint: { in: dead } } });
    logger.info(`removed ${dead.length} expired push subscription(s)`);
  }
}

/**
 * Firebase Cloud Messaging via the HTTP v1 API.
 *
 * Deliberately not pulling in firebase-admin: it is a large dependency for one
 * request, and the only hard part is minting an access token from the service
 * account, which google-auth-library already does.
 */
let fcmAuth: import('google-auth-library').JWT | null = null;
let fcmProjectId = '';

function fcmConfigured(): boolean {
  return Boolean(process.env.FCM_SERVICE_ACCOUNT);
}

async function sendFcm(token: string, msg: PushMessage): Promise<void> {
  if (!fcmConfigured()) return;
  if (!fcmAuth) {
    const { JWT } = await import('google-auth-library');
    const creds = JSON.parse(process.env.FCM_SERVICE_ACCOUNT!);
    fcmProjectId = creds.project_id;
    fcmAuth = new JWT({
      email: creds.client_email,
      key: creds.private_key,
      scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
    });
  }
  const { token: accessToken } = await fcmAuth.getAccessToken();
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${fcmProjectId}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        token,
        notification: { title: msg.title, body: msg.body },
        data: { url: msg.url ?? '/orders' },
        android: { priority: 'HIGH', notification: { sound: 'default', tag: msg.tag ?? 'order' } },
      },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    // A token the device has replaced or an app that was uninstalled.
    if (res.status === 404 || res.status === 403) {
      const e = new Error(text) as Error & { statusCode?: number };
      e.statusCode = 404;
      throw e;
    }
    throw new Error(`FCM ${res.status}: ${text.slice(0, 200)}`);
  }
}
