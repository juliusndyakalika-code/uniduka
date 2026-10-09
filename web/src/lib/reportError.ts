import api from '../api/client';

/**
 * Sends browser errors to the server's error log.
 *
 * Without this, a screen that breaks on a till is known only to the person
 * standing at it. Reports are deduplicated per page load and capped, so a
 * component erroring in a loop sends one report, not a thousand, and they
 * only go when someone is signed in, since the endpoint will not take them
 * otherwise.
 */

const MAX_PER_LOAD = 15;
const sent = new Set<string>();

type Kind = 'error' | 'promise' | 'render';

export function reportError(kind: Kind, message: string, stack?: string) {
  try {
    if (!message) return;
    let signedIn = false;
    try { signedIn = Boolean(localStorage.getItem('ud_token')); } catch { /* storage blocked */ }
    if (!signedIn) return;

    const key = `${kind}|${message}|${location.pathname}`;
    if (sent.has(key) || sent.size >= MAX_PER_LOAD) return;
    sent.add(key);

    // Fire and forget. A failed report must never become an error of its own.
    void api.post('/client-errors', {
      kind, message: message.slice(0, 500), stack: stack?.slice(0, 4000), path: location.pathname,
    }).catch(() => {});
  } catch { /* never throw from the reporter */ }
}

/**
 * Noise that is not ours to fix: browser extensions, cross-origin scripts
 * the browser will not describe, and a ResizeObserver warning Chrome raises
 * as an error.
 */
const IGNORE = [/^Script error\.?$/, /ResizeObserver loop/, /chrome-extension:|moz-extension:/];

export function installErrorReporting() {
  window.addEventListener('error', (e) => {
    const msg = e.message || String(e.error ?? '');
    if (IGNORE.some(r => r.test(msg) || r.test(e.filename ?? ''))) return;
    reportError('error', msg, e.error?.stack);
  });

  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason as { message?: string; stack?: string; isAxiosError?: boolean; response?: { status?: number } } | undefined;
    // An API that answered 4xx said no on purpose (wrong code, not found,
    // not allowed); that is the app working. 5xx and network failures are
    // already recorded server side or are worth recording here.
    if (r?.isAxiosError && (r.response?.status ?? 0) < 500 && r.response) return;
    const msg = r?.message ?? String(e.reason ?? 'Unhandled rejection');
    if (IGNORE.some(x => x.test(msg))) return;
    reportError('promise', msg, r?.stack);
  });
}
