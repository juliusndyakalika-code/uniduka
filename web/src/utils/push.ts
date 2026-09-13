/**
 * Device registration for order alerts.
 *
 * Two transports, picked by what the runtime actually supports:
 *
 *   Browsers and installed PWAs use Web Push through the service worker.
 *   The Android app cannot: Android System WebView does not implement the
 *   Push API, so the native shell supplies a Firebase token instead.
 *
 * Both end up in the same table on the server, so the sending side does not
 * care which one a given shop is using.
 */
import api from '../api/client';

/** True when running inside the Capacitor shell rather than a browser tab. */
export function isNativeApp(): boolean {
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

export function pushSupported(): boolean {
  return isNativeApp() || ('serviceWorker' in navigator && 'PushManager' in window);
}

export function permission(): NotificationPermission | 'unsupported' {
  if (isNativeApp()) return 'default';
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

/** The VAPID key arrives base64url and the browser wants raw bytes. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/**
 * Ask for permission and register this device.
 * Returns null when the user declines or the platform cannot do push.
 */
export async function enablePush(): Promise<string | null> {
  if (isNativeApp()) return enableNative();

  if (!pushSupported()) return null;
  const granted = await Notification.requestPermission();
  if (granted !== 'granted') return null;

  const { data } = await api.get('/notifications/public-key');
  const publicKey: string | null = data?.data?.publicKey;
  if (!publicKey) return null;   // server has no VAPID keys configured

  const reg = await navigator.serviceWorker.ready;

  // Reuse an existing subscription when there is one. Calling subscribe twice
  // with a different key throws, which is what happens if the server's VAPID
  // key is ever rotated, so drop a stale one rather than failing.
  let sub = await reg.pushManager.getSubscription();
  if (sub) {
    const current = new Uint8Array(sub.options.applicationServerKey ?? new ArrayBuffer(0));
    const wanted  = urlBase64ToUint8Array(publicKey);
    const same = current.length === wanted.length && current.every((b, i) => b === wanted[i]);
    if (!same) { await sub.unsubscribe(); sub = null; }
  }
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    });
  }

  await api.post('/notifications/subscribe', sub.toJSON());
  return sub.endpoint;
}

/** Native path: the shell owns permission and the Firebase token. */
async function enableNative(): Promise<string | null> {
  const mod = await import('@capacitor/push-notifications').catch(() => null);
  if (!mod) return null;
  const { PushNotifications } = mod;

  let status = await PushNotifications.checkPermissions();
  if (status.receive !== 'granted') status = await PushNotifications.requestPermissions();
  if (status.receive !== 'granted') return null;

  return new Promise<string | null>((resolve) => {
    // registration fires once Firebase returns a token for this install.
    void PushNotifications.addListener('registration', async (t) => {
      await api.post('/notifications/subscribe', { fcmToken: t.value });
      resolve(t.value);
    });
    void PushNotifications.addListener('registrationError', () => resolve(null));
    void PushNotifications.register();
  });
}

/** Unregister this device, on sign-out or when alerts are switched off. */
export async function disablePush(): Promise<void> {
  if (isNativeApp()) return;
  if (!('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await api.post('/notifications/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe();
}
