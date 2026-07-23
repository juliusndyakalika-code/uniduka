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

  const reset = useCallback(() => {
    expireAt.current = Date.now() + timeoutMs;
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

    // Initialise
    expireAt.current  = Date.now() + timeoutMs;
    warnFired.current = false;
    expired.current   = false;

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
      clearInterval(intervalId.current);
      ACTIVITY_EVENTS.forEach(ev =>
        document.removeEventListener(ev, handleActivity, { capture: true }),
      );
    };
  }, [enabled, timeoutMs, warnBeforeMs, reset]);

  return { reset };
}
