/* Push handling, imported into the generated service worker.
 *
 * Kept as a separate file rather than switching the plugin to injectManifest:
 * that would mean hand-maintaining the whole service worker, including the
 * precache and runtime caching rules, to add two event listeners.
 */

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { /* not JSON */ }

  const title = data.title || 'MauzoHalisi';
  const options = {
    body: data.body || '',
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    // A repeat push about the same order replaces the earlier one rather than
    // stacking, so a shop does not wake to six copies of one notification.
    tag: data.tag || 'mauzohalisi',
    renotify: true,
    data: { url: data.url || '/orders' },
    vibrate: [200, 100, 200],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/orders';

  // Prefer focusing a tab that is already open over launching a second one.
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((tabs) => {
      for (const tab of tabs) {
        if ('focus' in tab) {
          if ('navigate' in tab) tab.navigate(target).catch(() => {});
          return tab.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
