import { useEffect, useRef, useCallback } from 'react';

const ACTIVITY_EVENTS = [
  'mousemove', 'mousedown', 'click', 'keydown',
  'touchstart', 'touchmove', 'scroll', 'pointerdown', 'wheel',
] as const;

/**
 * When the person last did something, kept on the device.
 *
 * The countdown used to live only in memory, so it restarted whenever the
 * page loaded. On Android the system closes a backgrounded app routinely,
 * and reopening it started a fresh 15 minutes, so the inactivity sign-out
 * effectively never happened on phones. The timestamp survives that, and is
 * checked on start-up and whenever the app comes back to the foreground.
 */
export const LAST_ACTIVE_KEY = 'mh_last_active';
const WRITE_EVERY_MS = 10_000;

function readLastActive(): number | null {
  try {
    const v = Number(localStorage.getItem(LAST_ACTIVE_KEY));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch { return null; }
}
export function markActive(at = Date.now()) {
  try { localStorage.setItem(LAST_ACTIVE_KEY, String(at)); } catch { /* storage blocked */ }
}

interface Options {
  /** Total idle timeout in milliseconds. Default: 15 minutes. */
  timeoutMs?: number;
  /** How many ms before expiry to fire onWarn. Default: 60 seconds. */
  warnBeforeMs?: number;
  /** Fires every second with remaining seconds — drives footer counter. */
  onTick?: (secondsLeft: number) => void;
  onWarn: (secondsLeft: number) => void;
  onExpire: () => void;
  onReset?: () => void;
  enabled?: boolean;
}

export function useIdleTimer({
  timeoutMs = 15 * 60 * 1000,
  warnBeforeMs = 60 * 1000,
  onTick,
  onWarn,
  onExpire,
  onReset,
  enabled = true,
}: Options) {
  const expireAt   = useRef<number>(Date.now() + timeoutMs);
  const warnFired  = useRef(false);
  const expired    = useRef(false);
  const intervalId = useRef<ReturnType<typeof setInterval>>(undefined);

  // Keep callbacks in refs so they never invalidate the interval
  const onTickRef   = useRef(onTick);
  const onWarnRef   = useRef(onWarn);
  const onExpireRef = useRef(onExpire);
  const onResetRef  = useRef(onReset);
  onTickRef.current   = onTick;
  onWarnRef.current   = onWarn;
  onExpireRef.current = onExpire;
  onResetRef.current  = onReset;

  const lastWrite = useRef(0);

  const reset = useCallback(() => {
    const now = Date.now();
    expireAt.current = now + timeoutMs;
    // Throttled: activity fires many times a second while scrolling.
    if (now - lastWrite.current > WRITE_EVERY_MS) { lastWrite.current = now; markActive(now); }
    if (warnFired.current || expired.current) {
      warnFired.current = false;
      expired.current   = false;
      onResetRef.current?.();
    }
  }, [timeoutMs]);

  useEffect(() => {
    if (!enabled) return;

    function handleActivity() { reset(); }

    ACTIVITY_EVENTS.forEach(ev =>
      document.addEventListener(ev, handleActivity, { passive: true, capture: true }),
    );

    // Initialise from the device's record, not from now: a reopened app
    // that was idle for an hour must be treated as idle for an hour.
    const last = readLastActive();
    expireAt.current  = (last ?? Date.now()) + timeoutMs;
    if (!last) markActive();
    warnFired.current = false;
    expired.current   = false;

    // Coming back to the foreground (switching apps, unlocking the phone):
    // re-read the record and let the next tick decide. Capacitor's WebView
    // fires 'resume'; browsers fire visibilitychange.
    function handleReturn() {
      if (document.visibilityState === 'hidden') return;
      const at = readLastActive();
      if (at) expireAt.current = at + timeoutMs;
    }
    document.addEventListener('visibilitychange', handleReturn);
    document.addEventListener('resume', handleReturn);

    // Tick every second
    intervalId.current = setInterval(() => {
      if (expired.current) return;

      const remaining = expireAt.current - Date.now();
      const secs      = Math.max(0, Math.ceil(remaining / 1000));

      onTickRef.current?.(secs);

      if (remaining <= 0) {
        expired.current = true;
        onExpireRef.current();
        return;
      }

      if (!warnFired.current && remaining <= warnBeforeMs) {
        warnFired.current = true;
        onWarnRef.current(secs);
      } else if (warnFired.current) {
        onWarnRef.current(secs);
      }
    }, 1000);

    return () => {
      document.removeEventListener('visibilitychange', handleReturn);
      document.removeEventListener('resume', handleReturn);
      clearInterval(intervalId.current);
      ACTIVITY_EVENTS.forEach(ev =>
        document.removeEventListener(ev, handleActivity, { capture: true }),
      );
    };
  }, [enabled, timeoutMs, warnBeforeMs, reset]);

  return { reset };
}
