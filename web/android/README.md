# MauzoHalisi Android

A Capacitor shell: a native Android app whose WebView renders
https://mauzohalisi.com/login. Configuration lives in `web/capacitor.config.ts`.

## Updating the app when you update the web

**Normally you do nothing.** `server.url` points at the live site, so deploying
the web app updates the Android app. No rebuild, no Play upload, no review wait.

Rebuild only when the shell itself changes: app name, icon, start URL, allowed
navigation hosts, target SDK, or an added native plugin.

```bash
cd web && npx cap sync android            # needs Node 22
cd android && ./gradlew bundleRelease     # needs JDK 21
```

Outputs `app/build/outputs/bundle/release/app-release.aab` for Play Console.

## Toolchain

Two version requirements that differ from the rest of the repo:

* **Node 22** for the Capacitor CLI. The repo default is 20, so use
  `~/.nvm/versions/node/v22.23.2/bin` on PATH for `cap` commands.
* **JDK 21** for Gradle. Android Studio ships one at
  `/Applications/Android Studio.app/Contents/jbr/Contents/Home`; set `JAVA_HOME`
  to it. The system JDK 17 fails with `invalid source release: 21`.

## Why not a Trusted Web Activity

The first version was a TWA. It renders through the Chrome browser app, so a
handset that shipped without Chrome or had it disabled got nothing, and it
opened on the marketing landing page rather than the sign-in screen.

A WebView is a mandatory system component and independent of the Chrome browser
app. Verified by disabling `com.android.chrome` on the emulator: the app still
renders.

The trade-off is the Push API, which WebView does not implement. See
[PUSH.md](PUSH.md).

## Signing

The keystore lives in `~/.mauzohalisi-signing/`, outside the repo. The Gradle
signing block is skipped when it is absent, so a debug build and a fresh clone
still work.

**Back up `upload.keystore` and `keystore-password.txt`.** They are not in git
and cannot be regenerated. Turn on Play App Signing so a lost upload key can be
reset by Google.

## Play Console

Package name is `com.mauzohalisi.app` and cannot be changed after the first
upload. Unlike the TWA, no `assetlinks.json` entry is required for the app to
render full screen; the file is still served and is harmless.

## Connection failures

The WebView loads the live site, so a shop with no signal would otherwise get a
blank white screen with nothing to tap. `MainActivity` puts a native screen over
the WebView when a main-frame load fails, saying what happened and offering a
retry.

It is native, not a bundled HTML error page, on purpose: when the WebView cannot
load anything, a page served to that same WebView is the least trustworthy thing
to depend on.

Three details that only showed up by running it:

* `BridgeActivity` does not inflate `activity_main.xml`, so a view declared there
  is never created and `findViewById` returns null, which crashed the app on
  launch. The fallback is inflated over `android.R.id.content` at runtime instead.
* `onPageFinished` fires even for a failed navigation, so a plain hide-on-finish
  would dismiss the error screen for the very load that failed. A `loadFailed`
  flag gates it.
* Only main-frame failures count. A missing image or a blocked font must not
  replace a working till.

The wording distinguishes no signal from a server that is down, because the two
need different actions from the shop. Retrying loads the start URL rather than
calling `reload()`, which on a page that never loaded would retry `about:blank`.
