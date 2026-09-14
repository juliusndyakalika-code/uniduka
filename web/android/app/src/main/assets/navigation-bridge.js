/*
 * Keeps the app out of the marketing landing page.
 *
 * The site serves "/" to sell the product to someone who has not signed up.
 * Inside the app that person has already installed it, so landing there is a
 * dead end wearing a Start Free Trial button.
 *
 * Two routes lead there and neither is a page load, so the native
 * shouldOverrideUrlLoading hook never sees them: App.tsx sends every unmatched
 * path to "/", and the Privacy and Terms pages link back to "/" from their logo.
 * Both are React Router pushState navigations, which is why this has to run in
 * the page.
 */
(function () {
  if (window.__mauzoNavBridge) return;
  window.__mauzoNavBridge = true;

  function signedIn() {
    try { return !!localStorage.getItem('ud_token'); } catch (e) { return false; }
  }

  function homeFor() {
    return signedIn() ? '/dashboard' : '/login';
  }

  function isLanding(path) {
    return path === '/' || path === '' || path === '/index.html';
  }

  /**
   * A full load rather than a history rewrite.
   *
   * Rewriting the URL underneath React Router leaves its own location state
   * pointing at "/", so the router keeps rendering the landing page at a URL
   * that claims otherwise. Landing here at all is rare, so the reload costs
   * nothing in practice and is certain to be right.
   */
  function redirect() {
    if (!isLanding(location.pathname)) return false;
    location.replace(location.origin + homeFor());
    return true;
  }

  redirect();

  // Catches the router's own navigations, which fire neither a load nor popstate.
  ['pushState', 'replaceState'].forEach(function (name) {
    var original = history[name];
    history[name] = function () {
      var result = original.apply(this, arguments);
      redirect();
      return result;
    };
  });

  window.addEventListener('popstate', redirect);

  /**
   * Handles the hardware back press, and says whether it did.
   *
   * The page drives this rather than the shell calling WebView.goBack(), because
   * the WebView's own back-forward list does not track this SPA: it reported two
   * entries and canGoBack() false at the same time, so back always fell through
   * to closing the app. history.length here is the router's real history and is
   * correct.
   *
   * Returns false when there is nowhere useful to go, and the shell then sends
   * the app to the background rather than leaving a cashier on a dead screen.
   */
  window.__mauzoHandleBack = function () {
    if (isLanding(location.pathname)) { redirect(); return true; }

    // The two screens a shop returns to. Back from here means "leave the app",
    // not "walk further back into pages they already left".
    var atRoot = location.pathname === '/login' || location.pathname === '/dashboard';
    if (atRoot) return false;

    if (history.length > 1) { history.back(); return true; }
    return false;
  };
})();
