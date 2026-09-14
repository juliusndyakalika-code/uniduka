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

## Thermal receipt printing

Bluetooth ESC/POS printing, in `ThermalPrinterPlugin.java` and `EscPos.java`.
The web app cannot reach these printers itself: Web Bluetooth does not cover the
Serial Port Profile they speak, and is unavailable in a WebView anyway.

**The web app needs no change.** `printer-bridge.js` is injected by the shell and
re-points the existing receipt printing at the printer. Opened in a browser the
site still prints through the browser; only inside the shell does it reach the
roll.

Printers must be paired in Android Bluetooth settings first. Pairing means a PIN
prompt owned by the system, and a second pairing flow here would be a worse copy
of it. The first print offers a choice of paired devices, and remembers it.

### Why innerText, and why tabs matter

The receipt is an HTML table, and `innerText` separates table cells with tabs.
So a line arrives as `Sukari 1kg\t2 kg\tA\t6,000`, not as prose. `EscPos` treats
the last cell as the amount and pins it to the right margin:

```
12345678901234567890123456789012  <- 58mm fits 32
Sukari 1kg 2 kg A          6,000
Mafuta ya Kupikia ya Alizeti 1L
1 btl A                    8,000
TOTAL (TZS)               18,500
```

Wrapping those rows as if they were sentences pushes the amount onto a line of
its own, which is how a receipt ends up with a column of orphaned numbers. A
long product name wraps and the amount stays with it.

Printers silently truncate anything wider than the paper, so a total can lose
its last digit with no error. Width is enforced here rather than trusted to the
device.

### Patching insertion, not observing it

The bridge wraps `appendChild` and friends to patch a print iframe synchronously
at insertion. A `MutationObserver` alone is a microtask, so an iframe appended
and printed in the same task is never patched. The web app happens to print
400ms later, so an observer would usually work — but a receipt reaching the
printer should not depend on winning that race. The observer stays as a backstop.

### Tested and untested

Verified on the emulator: the plugin registers, the bridge injects, the
permission flow works, `listDevices` returns cleanly with none paired, and a
print iframe is intercepted and routed to the printer rather than the browser
dialog. The ESC/POS output is covered by a harness over `EscPos` alone.

**Not tested against a physical printer.** There is no Bluetooth hardware on an
emulator. Connecting to a real 58mm or 80mm ESC/POS unit is the remaining step.

## Staying out of the landing page, and the back button

The site serves `/` to sell the product to someone who has not signed up. In the
app that person has already installed it, so landing there is a dead end wearing
a Start Free Trial button.

Two paths lead there, and neither is a page load, so the native
`shouldOverrideUrlLoading` hook never sees them:

* `App.tsx` sends every unmatched path to `/`
* the Privacy and Terms pages link back to `/` from their logo

Both are React Router `pushState` navigations, so `navigation-bridge.js` guards
them in the page: `pushState`, `replaceState` and `popstate` are all checked, and
landing on `/` does a full load of `/login`, or `/dashboard` when signed in. A
full load rather than a history rewrite, because rewriting the URL underneath
React Router leaves its own location state on `/` and it keeps rendering the
landing page at a URL that says otherwise.

Back is handled by the page, not by `WebView.goBack()`. The WebView's own
back-forward list does not track this SPA: it reported **two entries and
`canGoBack()` false at the same time**, so every back press fell through to
closing the app. `history.length` in the page is the router's real history and is
correct, so `__mauzoHandleBack()` decides and tells the shell whether it acted.

From `/login` or `/dashboard` there is nowhere useful to go back to, so the app
moves to the background the way the home button would. Closing outright would
mean a cashier who taps back once mid-shift loses the till.
