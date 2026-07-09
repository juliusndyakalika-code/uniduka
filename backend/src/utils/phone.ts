/**
 * Normalize a phone number to E.164 format where possible.
 * Handles common Tanzania formats: 0712345678, 255712345678, +255712345678
 * Strips spaces, dashes, and parentheses.
 */
export function normalizePhone(raw: string): string {
  if (!raw) return raw;
  const stripped = raw.replace(/[\s\-\(\)\.]/g, '');
  if (!stripped) return stripped;

  if (stripped.startsWith('+')) return stripped;                      // already +255...
  if (/^255\d{9}$/.test(stripped)) return '+' + stripped;            // 255712345678
  if (/^0\d{9}$/.test(stripped)) return '+255' + stripped.slice(1);  // 0712345678
  if (/^\d{9}$/.test(stripped)) return '+255' + stripped;            // 712345678

  return stripped;
}

/**
 * Return every plausible stored variant of a phone number for DB lookups.
 * Covers any format a user might have typed when they originally registered.
 */
export function phoneVariants(raw: string): string[] {
  const stripped = raw.replace(/[\s\-\(\)\.]/g, '');
  if (!stripped) return [raw];

  const digits = stripped.replace(/^\+/, '');         // strip leading +
  const set = new Set<string>([raw.trim(), stripped]);

  // derive the 9-digit local part
  let local9 = '';
  if (/^255\d{9}$/.test(digits)) local9 = digits.slice(3);     // 255XXXXXXXXX → XXXXXXXXX
  else if (/^0\d{9}$/.test(digits)) local9 = digits.slice(1);  // 0XXXXXXXXX   → XXXXXXXXX
  else if (/^\d{9}$/.test(digits)) local9 = digits;            // XXXXXXXXX     → XXXXXXXXX

  if (local9) {
    set.add('+255' + local9);    // +255XXXXXXXXX
    set.add('255' + local9);     // 255XXXXXXXXX
    set.add('0' + local9);       // 0XXXXXXXXX
    set.add(local9);             // XXXXXXXXX
  }

  return Array.from(set);
}
