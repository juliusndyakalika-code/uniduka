import { useEffect, useRef, useCallback } from 'react';

const ACTIVITY_EVENTS = [
  'mousemove', 'mousedown', 'click', 'keydown',
  'touchstart', 'touchmove', 'scroll', 'pointerdown', 'wheel',
] as const;

interface Options {
  /** Total idle timeout in milliseconds. Default: 15 minutes. */
  timeoutMs?: number;
  /** How many ms before expiry to fire onWarn. Default: 60 seconds. */
  warnBeforeMs?: number;
  onWarn: (secondsLeft: number) => void;
  onExpire: () => void;
  onReset?: () => void;
  enabled?: boolean;
}

export function useIdleTimer({
  timeoutMs = 15 * 60 * 1000,
  warnBeforeMs = 60 * 1000,
  onWarn,
  onExpire,
  onReset,
  enabled = true,
}: Options) {
  const expireAt = useRef<number>(Date.now() + timeoutMs);
  const warnFired = useRef(false);
  const expired = useRef(false);
  const onWarnRef = useRef(onWarn);
  const onExpireRef = useRef(onExpire);
  const onResetRef = useRef(onReset);
  const rafId = useRef<number>(0);

  // Keep callback refs fresh so callers don't need to memoize
  onWarnRef.current = onWarn;
  onExpireRef.current = onExpire;
  onResetRef.current = onReset;

  const reset = useCallback(() => {
    expireAt.current = Date.now() + timeoutMs;
    if (warnFired.current || expired.current) {
      warnFired.current = false;
      expired.current = false;
      onResetRef.current?.();
    }
  }, [timeoutMs]);

  useEffect(() => {
    if (!enabled) return;

    // Attach listeners on the document capture phase so every click/key/touch resets,
    // even if a child stops propagation.
    function handleActivity() { reset(); }
    ACTIVITY_EVENTS.forEach(ev =>
      document.addEventListener(ev, handleActivity, { passive: true, capture: true }),
    );

    function tick() {
      const now = Date.now();
      const remaining = expireAt.current - now;

      if (!expired.current && remaining <= 0) {
        expired.current = true;
        onExpireRef.current();
        return; // stop the loop
      }

      if (!warnFired.current && remaining <= warnBeforeMs) {
        warnFired.current = true;
        onWarnRef.current(Math.ceil(remaining / 1000));
      } else if (warnFired.current && !expired.current) {
        // Keep caller's countdown updated every second
        onWarnRef.current(Math.max(0, Math.ceil(remaining / 1000)));
      }

      rafId.current = requestAnimationFrame(tick);
    }

    // Reset timestamp on mount to start fresh
    expireAt.current = Date.now() + timeoutMs;
    warnFired.current = false;
    expired.current = false;
    rafId.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId.current);
      ACTIVITY_EVENTS.forEach(ev =>
        document.removeEventListener(ev, handleActivity, { capture: true }),
      );
    };
  }, [enabled, timeoutMs, warnBeforeMs, reset]);

  return { reset };
}
