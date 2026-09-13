# MauzoHalisi Android

A Trusted Web Activity: a thin Android shell that renders https://mauzohalisi.com
full screen, with no browser UI. It is Chrome under the hood, so the PWA service
worker, offline caching, camera barcode scanning and printing all behave exactly
as they do on the web.

## Updating the app when you update the web

**Normally you do nothing.** The shell loads the live site, so deploying the web
app is the update. No rebuild, no Play upload, no review wait, and every user has
it on next launch.

Rebuild and upload a new release only when something in `twa-manifest.json`
changes:

* app name or launcher name
* icon or splash colours
* the origin or start URL
* app shortcuts
* target SDK, when Play raises the minimum

```bash
./release.sh 1.1.0     # bump version, build, sign
```

Then upload `app-release-bundle.aab` in Play Console under Production.

## First upload to Play Console

1. Create the app. Package name is `com.mauzohalisi.app` and cannot be changed
   later.
2. **Turn on Play App Signing** (it is the default). Google then holds the real
   app signing key and `upload.keystore` is only an upload credential, which
   Google can reset if it is ever lost. Without it, losing the keystore means
   never being able to update the app again.
3. Upload `app-release-bundle.aab`.
4. Go to **Setup, App signing** and copy the **SHA-256 certificate fingerprint**
   of the *app signing key*. This is Google's key, not the one in this repo.
5. Add it to `web/public/.well-known/assetlinks.json` alongside the existing
   fingerprint, then deploy the web app.

Step 5 is not optional and is the usual reason a TWA ships broken. Play re-signs
the bundle with its own key, so the fingerprint that reaches users' devices is
Google's. If `assetlinks.json` does not list it, Chrome cannot verify the app
owns the domain and shows a URL bar across the top of every screen. The app still
works, it just looks like a browser.

Both fingerprints can be listed at once, which is what you want: the local one
keeps sideloaded test builds full screen, Google's covers everyone from the store.

## Signing key

Lives in `~/.mauzohalisi-signing/`, deliberately outside the repo.

**Back up `upload.keystore` and `keystore-password.txt` now**, to a password
manager or encrypted storage. They are not in git and cannot be regenerated.

## Verifying asset links

```bash
curl -s https://mauzohalisi.com/.well-known/assetlinks.json
```

Google's checker, which is what Chrome actually consults:

https://developers.google.com/digital-asset-links/tools/generator

## Not included

Push notifications when the app is closed. The in-app order alerts run over
Socket.IO and only work while the app is open. Background push needs Web Push
with a Firebase sender ID wired into `enableNotifications` in the manifest, plus
a push subscription endpoint in the API.
