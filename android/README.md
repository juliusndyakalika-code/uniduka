# MauzoHalisi Android (native)

Kotlin and Jetpack Compose. No WebView and no Chromium: every screen is a real
Android view. Talks to the existing API at
`https://api-production-00d0.up.railway.app/api/v1` and changes nothing about it.

This is separate from `web/android`, which is the Capacitor shell. That one still
works and is what to ship until this reaches parity.

## Build

```bash
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"   # JDK 21
./gradlew assembleDebug        # debug, talks to a local API
./gradlew bundleRelease        # signed AAB for Play
```

Debug builds install as `com.mauzohalisi.app.dev`, so the native and Capacitor
apps can sit on one device side by side.

## Pointing a debug build somewhere

Debug defaults to `http://localhost:3015/api/v1`, reached with:

```bash
adb reverse tcp:3015 tcp:3015
```

Override with `MAUZO_API_BASE=https://… ./gradlew assembleDebug`. Release always
uses production and permits no cleartext; the debug-only network security config
is what allows plain HTTP to localhost.

## Structure

```
core/net       Retrofit API, DTOs, auth interceptor, token refresh
core/data      SessionStore (DataStore): tokens, shop, ready flag
core/          AppContainer, dependencies wired by hand
ui/theme       brand colours and type
feature/auth   login
feature/dashboard  today's figures
```

Dependencies are wired by hand rather than with Hilt. At two objects, annotation
processing costs more than it saves, and nothing reaches for them except through
`AppContainer`, so swapping it later is contained.

## Two things worth knowing

**DTO field names must match the API exactly.** kotlinx.serialization falls back
to defaults for absent keys, so a wrong name shows a confident `0` rather than
failing. The first dashboard build did exactly that over real sales.

**Signing in is two steps, and order matters.** The token is stored first because
choosing a shop is itself an authenticated call, then `markReady()` is set last.
`isSignedIn` requires both, otherwise the dashboard races shop selection and wins,
rendering with no shop name against an unscoped token.

## Done so far

* Login, including the 2FA branch the API returns as a 200
* Session storage with silent token refresh on 401
* Automatic shop selection
* Dashboard: revenue, transactions, customers, products
* Point of sale: product grid with live stock, search, cart, cash charge

Quantities are held as Double throughout. A grocery sells 1.5 kg and a pharmacy
doses in millilitres; the stored column is a float, so rounding in the client
would invent a restriction the system does not have. The web POS does round, and
that is a bug there, not a rule to copy.

## Not built yet

Inventory, invoices, reports, customers, expenses, hotel, KDS. Each is a screen
to write by hand, since none of the React UI carries over.

Within the POS: split tenders, mobile money, selling on credit, discounts,
barcode scanning, receipt printing and offline queueing. The current till takes
one cash payment for the full amount.
