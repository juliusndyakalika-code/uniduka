/**
 * Light, dark, or whatever the device prefers.
 *
 * The whole app follows one class on <html>: with `dark` present every
 * palette variable in theme.css takes its dark value. Nothing else needs to
 * know which theme is showing, which is the point of doing it this way.
 *
 * "System" is the default and the best answer for most people: a phone or
 * computer that goes dark at sunset takes the till with it, and nobody has to find a
 * setting. The explicit choices exist for the person who wants the shop
 * screen to stay put whatever the phone is doing.
 */

export type ThemeChoice = 'light' | 'dark' | 'system';

const KEY = 'mh-theme';
const media = () => window.matchMedia('(prefers-color-scheme: dark)');

export function getTheme(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

function resolve(choice: ThemeChoice): 'light' | 'dark' {
  return choice === 'system' ? (media().matches ? 'dark' : 'light') : choice;
}

function apply(choice: ThemeChoice) {
  const mode = resolve(choice);
  const root = document.documentElement;
  root.classList.toggle('dark', mode === 'dark');
  root.dataset.theme = mode;

  // The browser chrome around the page (the Android status bar, the address
  // bar in an installed app) reads this, so it follows too rather than
  // framing a dark page in a pale strip.
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = mode === 'dark' ? '#15120f' : '#B0682C';
}

export function setTheme(choice: ThemeChoice) {
  try {
    if (choice === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch { /* private window: still applies, just will not be remembered */ }
  apply(choice);
  window.dispatchEvent(new CustomEvent('mh:theme', { detail: choice }));
}

/**
 * Called once, before the first render, so the page never paints light and
 * then snaps dark. Also keeps "system" live: if the phone switches while the
 * app is open, the app switches with it.
 */
export function initTheme() {
  apply(getTheme());
  media().addEventListener('change', () => {
    if (getTheme() === 'system') apply('system');
  });
}
