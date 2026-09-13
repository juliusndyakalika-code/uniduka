# Order alerts (push notifications)

Two transports, because the clients differ:

| Client | Transport | Needs |
|---|---|---|
| Browser, installed PWA | Web Push (VAPID) | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` |
| Android app | Firebase Cloud Messaging | `FCM_SERVICE_ACCOUNT`, `google-services.json` |

Android System WebView does not implement the Push API, so the app cannot use
Web Push. That is why the native path exists. It was not needed while the shell
was a Trusted Web Activity, which ran on Chrome.

Both land in the same `push_subscriptions` table. An FCM row stores the Firebase
token with an `fcm:` prefix in the `endpoint` column, so the sending side treats
them uniformly and a shop with a phone and a laptop gets both.

## Web push: already working

Set on the API service:

```
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:info@mauzohalisi.com
```

Without them the API logs `VAPID keys not set` and web push is skipped. Nothing
else breaks.

## Android push: needs a Firebase project

1. Create a project at https://console.firebase.google.com (free, and separate
   from Play Console).
2. Add an **Android app** with package name `com.mauzohalisi.app`.
3. Download `google-services.json` and put it at `web/android/app/`.
4. Project settings, Service accounts, **Generate new private key**. Set the
   whole JSON as the `FCM_SERVICE_ACCOUNT` environment variable on the API.
5. Rebuild the app: `cd web/android && ./gradlew bundleRelease`

Until step 3, the Android build still works and simply never registers for push.
The web path is unaffected.

## Why the prompt appears where it does

Permission is requested when the shop opens the notification panel, not on page
load. A permission dialog nobody asked for is the quickest route to a permanent
block, and once blocked the browser will not ask again, so that shop can never
be alerted about an order.

## Delivery is best effort

A failed push never fails the thing that triggered it. An order is a valid order
whether or not the shop's phone was reachable. Subscriptions the push service
reports as gone (404/410) are deleted, because a browser discards its
subscription when site data is cleared and those endpoints can never be
delivered to again.
