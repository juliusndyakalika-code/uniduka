import { useEffect, useRef } from 'react';

interface Options {
  enabled?: boolean;
  minLength?: number;   // min chars to consider a valid scan (default 3)
  maxGap?: number;      // max ms between chars for scanner detection (default 50)
}

/**
 * Detects barcode input from HID scanners (USB/Bluetooth keyboard-mode devices).
 * Scanners type characters < 20ms apart then send Enter. Human typing is > 100ms/char.
 * The hook buffers global keydown events and fires onScan when it detects scanner-speed
 * input followed by Enter (or a 150ms timeout with ≥ 8 chars for scanners without Enter).
 */
export function useBarcodeScanner(
  onScan: (barcode: string) => void,
  options: Options = {},
) {
  const { enabled = true, minLength = 3, maxGap = 50 } = options;
  const buffer  = useRef('');
  const lastAt  = useRef(0);
  const timer   = useRef<ReturnType<typeof setTimeout>>();
  const cbRef   = useRef(onScan);
  cbRef.current = onScan;

  useEffect(() => {
    if (!enabled) return;

    function flush() {
      const code = buffer.current.trim();
      buffer.current = '';
      if (code.length >= minLength) cbRef.current(code);
    }

    function onKeyDown(e: KeyboardEvent) {
      const now = Date.now();
      const gap = now - lastAt.current;
      lastAt.current = now;

      if (e.key === 'Enter') {
        clearTimeout(timer.current);
        const code = buffer.current.trim();
        buffer.current = '';
        if (code.length >= minLength) {
          e.preventDefault();
          cbRef.current(code);
        }
        return;
      }

      // Only buffer printable chars
      if (e.key.length > 1) {
        if (buffer.current) buffer.current = '';
        return;
      }

      // If gap is too large between chars, the previous chars were manual typing — reset
      if (gap > maxGap * 2 && buffer.current.length > 0) {
        buffer.current = '';
      }

      buffer.current += e.key;

      // Auto-flush after 150ms for scanners that don't append Enter
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, 150);
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      clearTimeout(timer.current);
    };
  }, [enabled, minLength, maxGap]);
}
