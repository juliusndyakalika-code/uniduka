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

  return stripped; // unknown format — return stripped version at minimum
}
