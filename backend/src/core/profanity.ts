/**
 * Profanity screening for text a person types in.
 *
 * Applied where text becomes public or printed — a shop name on a receipt, a
 * storefront slug in a URL, a product on a public catalogue, a name on an
 * invoice. Rejecting is better than silently rewriting: nobody wants their
 * business name quietly altered.
 *
 * The hard part is not the list, it is avoiding false positives. Substring
 * matching would reject "Assam" (tea) for containing an English profanity, and
 * "kumaliza" (to finish, Swahili) for containing one in Swahili. So matching is
 * always on whole words, after normalising the substitutions people actually
 * use — @ for a, 0 for o, repeated letters.
 *
 * This stops someone typing something offensive. It is not adversary-proof;
 * anyone determined can space letters out. That trade is deliberate — a filter
 * tight enough to catch every evasion rejects far too many real names.
 */

/**
 * Unambiguous profanity and slurs only, in English and Swahili.
 *
 * Deliberately excluded: words with ordinary commercial use, however coarse
 * they sound out of context. A butchery sells cock, a hardware shop sells
 * screws, and a bar is called Titi in more than one town. Also excluded are
 * mild Swahili insults like `mjinga` and `punda`, which appear in ordinary
 * speech and proverbs far more often than as abuse.
 */
const BLOCKED = [
  // English
  'fuck', 'fucking', 'fucker', 'motherfucker', 'shit', 'bullshit', 'bitch',
  'cunt', 'asshole', 'arsehole', 'dickhead', 'wanker', 'whore', 'slut',
  'nigger', 'nigga', 'faggot', 'retard', 'rape', 'rapist', 'pedophile',
  'paedophile', 'porn', 'porno', 'pornography',
  // Swahili
  'mkundu', 'kuma', 'mboo', 'dume', 'malaya', 'kahaba', 'shoga',
  'mshenzi', 'takataka', 'kuma', 'jinga', 'umbwa',
] as const;

/**
 * Fold the substitutions people actually reach for, so `f*ck`, `sh1t` and
 * `fuuuck` are caught without widening the match to substrings.
 */
function normalise(text: string): string {
  return String(text)
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')  // fold accents
    .replace(/[4@]/g, 'a')
    .replace(/[3]/g, 'e')
    .replace(/[1!|]/g, 'i')
    .replace(/[0]/g, 'o')
    .replace(/[5$]/g, 's')
    .replace(/[7]/g, 't')
    // f*ck and f-u-c-k: a single separator between two letters is dropped, so
    // real hyphenated names like "Mama-Asha" survive as two words.
    .replace(/(?<=[a-z])[^a-z0-9\s](?=[a-z])/g, '')
    .replace(/(.)\1{2,}/g, '$1$1')                     // fuuuck -> fuuck
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Collapse a doubled letter run, so the normaliser's "fuuck" still matches. */
function singles(word: string): string {
  return word.replace(/(.)\1+/g, '$1');
}

/**
 * Catch a masked letter — `f*ck`, `sh!t`, `b#tch` — where a symbol stands in
 * for a character rather than separating two, so removing it leaves a word that
 * no longer matches.
 *
 * Requires the same length and every position to be either the right letter or
 * a symbol, with at most one symbol. That is narrow enough that ordinary words
 * cannot collide: a different length fails immediately, which is why "Cockburn"
 * and "Bass" are never considered.
 */
function matchesMasked(raw: string, bad: string): boolean {
  if (raw.length !== bad.length) return false;
  let masked = 0;
  for (let i = 0; i < bad.length; i++) {
    const c = raw[i];
    if (c === bad[i]) continue;
    if (/[a-z0-9]/.test(c)) return false;   // a real, different letter — not this word
    if (++masked > 1) return false;         // more holes than letters proves nothing
  }
  return masked === 1;
}

/**
 * The offending word, or null when the text is clean.
 * Matching is whole-word only — see the note about "Assam" and "kumaliza".
 */
export function findProfanity(text: string | null | undefined): string | null {
  if (!text) return null;

  const words = normalise(text).split(' ').filter(Boolean);
  for (const word of words) {
    const bare = singles(word);
    for (const bad of BLOCKED) {
      if (word === bad || bare === singles(bad)) return bad;
    }
  }

  // Second pass over the raw text for masked letters, which the normaliser
  // cannot recover — it strips the symbol and is left with a shorter word.
  const rawWords = String(text).toLowerCase().split(/\s+/).filter(Boolean);
  for (const word of rawWords) {
    for (const bad of BLOCKED) {
      if (matchesMasked(word, bad)) return bad;
    }
  }
  return null;
}

export const isClean = (text: string | null | undefined) => findProfanity(text) === null;

/**
 * Screen several labelled fields at once.
 * Returns a message naming the field, or null when everything is clean.
 */
export function screenFields(fields: Record<string, string | null | undefined>): string | null {
  for (const [label, value] of Object.entries(fields)) {
    if (findProfanity(value)) {
      return `Please choose a different ${label} — that wording is not allowed.`;
    }
  }
  return null;
}
