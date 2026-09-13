import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Android shell for MauzoHalisi.
 *
 * The WebView loads the live site rather than a bundled copy of `dist`. That
 * keeps the original rule intact: deploying the web app updates the Android app
 * too, with no rebuild and no Play review. `webDir` is still required by the
 * CLI, and the copied assets act as nothing more than a placeholder.
 *
 * This replaced a Trusted Web Activity. A TWA renders through the Chrome
 * browser app and needs one installed and enabled; a WebView is a mandatory
 * system component, so the app runs on a handset that never had Chrome or had
 * it disabled.
 *
 * The start URL is /login, not /. The landing page exists to sell the product
 * to someone who has not signed up, which is wasted on a person who has already
 * installed the app. LoginPage redirects to the dashboard when a session is
 * already active, so a returning owner never sees the form.
 */
const config: CapacitorConfig = {
  appId: 'com.mauzohalisi.app',
  appName: 'MauzoHalisi',
  webDir: 'dist',
  server: {
    url: 'https://mauzohalisi.com/login',
    // Only these hosts may be opened inside the WebView. Anything else (a
    // supplier's site, a WhatsApp link) is handed to the system browser, so a
    // stray link cannot navigate the app away from itself with no way back.
    allowNavigation: ['mauzohalisi.com', 'www.mauzohalisi.com'],
    androidScheme: 'https',
    cleartext: false,
  },
  android: {
    // Plain HTTP is never needed: the API and the site are both HTTPS.
    allowMixedContent: false,
    backgroundColor: '#E8EBF0',
  },
};

export default config;
