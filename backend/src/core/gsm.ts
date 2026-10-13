/**
 * Keeping SMS text inside the GSM-7 alphabet, and counting parts honestly.
 *
 * A single character outside GSM-7 (a "·", a curly apostrophe, an ellipsis)
 * switches the whole message to UCS-2, where a part holds 70 characters
 * instead of 160. The report used to carry "·" and "…", so a message that
 * looked like one part was billed as three. Everything we send is passed
 * through toGsm first, and smsParts counts the way the gateway bills.
 */

const BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?' +
  '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
/** Allowed, but each costs two septets (an escape plus the character). */
const EXTENDED = '^{}\\[~]|€';

const basic = new Set(BASIC);
const extended = new Set(EXTENDED);

/** Look-alikes that would otherwise force UCS-2, mapped to their plain forms. */
const REPLACE: Record<string, string> = {
  '‘': "'", '’': "'", '‚': "'", '′': "'",
  '“': '"', '”': '"', '„': '"', '″': '"',
  '–': '-', '—': '-', '‐': '-', '‑': '-', '−': '-',
  '…': '...', '·': '-', '•': '-',
  ' ': ' ', ' ': ' ', ' ': ' ',
  'á': 'a', 'â': 'a', 'ã': 'a', 'Á': 'A', 'À': 'A', 'Â': 'A',
  'ê': 'e', 'ë': 'e', 'È': 'E', 'Ê': 'E',
  'í': 'i', 'î': 'i', 'ï': 'i', 'Í': 'I',
  'ó': 'o', 'ô': 'o', 'õ': 'o', 'Ó': 'O', 'Ô': 'O',
  'ú': 'u', 'û': 'u', 'Ú': 'U', 'ç': 'c',
  '×': 'x', '÷': '/',
};

/** Text rewritten so it sends as GSM-7. Anything with no plain form is dropped. */
export function toGsm(text: string): string {
  let out = '';
  for (const ch of text) {
    if (basic.has(ch) || extended.has(ch)) out += ch;
    else if (REPLACE[ch] !== undefined) out += REPLACE[ch];
    // Emoji, Arabic script and the like have no GSM form; leaving them in
    // would triple the bill for one character.
  }
  return out.replace(/ {2,}/g, ' ');
}

export function isGsm(text: string): boolean {
  for (const ch of text) if (!basic.has(ch) && !extended.has(ch)) return false;
  return true;
}

/** Septets a GSM-7 message uses. Extended characters count twice. */
export function gsmLength(text: string): number {
  let n = 0;
  for (const ch of text) n += extended.has(ch) ? 2 : 1;
  return n;
}

/** Billed parts, the way the gateway counts them. */
export function smsParts(body: string): number {
  if (isGsm(body)) {
    const n = gsmLength(body);
    return n <= 160 ? 1 : Math.ceil(n / 153);
  }
  const n = [...body].length;
  return n <= 70 ? 1 : Math.ceil(n / 67);
}

/** Characters still free in the first part, for text appended to a GSM body. */
export function roomInOnePart(body: string): number {
  return isGsm(body) ? 160 - gsmLength(body) : 0;
}
