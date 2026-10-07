import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, MonitorSmartphone, Moon, Sun } from 'lucide-react';
import { getTheme, setTheme, type ThemeChoice } from '../../lib/theme';

/**
 * The theme, from the top bar.
 *
 * One icon, so it costs a phone's header almost nothing, and a short menu
 * rather than a button that cycles: with three states, a cycling button makes
 * the user click to find out what the next click does. The menu names all
 * three and ticks the current one.
 *
 * The icon shows what the screen is doing right now (sun or moon), not the
 * setting, except on Auto, where it says so. That way it answers the question
 * people actually have when they look at it: "is this the dark one?"
 */

const OPTIONS: { value: ThemeChoice; icon: typeof Sun }[] = [
  { value: 'light',  icon: Sun },
  { value: 'dark',   icon: Moon },
  { value: 'system', icon: MonitorSmartphone },
];

export default function ThemeMenu() {
  const { t } = useTranslation();
  const [choice, setChoice] = useState<ThemeChoice>(getTheme);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Stay in step if the theme is changed somewhere else, or if the device
  // flips while on Auto.
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    const sync = () => {
      setChoice(getTheme());
      setIsDark(document.documentElement.classList.contains('dark'));
    };
    const obs = new MutationObserver(sync);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('mh:theme', sync);
    return () => { obs.disconnect(); window.removeEventListener('mh:theme', sync); };
  }, []);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  const Icon = choice === 'system' ? MonitorSmartphone : isDark ? Moon : Sun;

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('theme.switch')}
        title={`${t('theme.label')}: ${t(`theme.${choice}`)}`}
        className="grid h-8 w-8 place-items-center rounded-lg text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-900"
      >
        <Icon size={17} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-44 overflow-hidden rounded-xl border border-stone-200 bg-white py-1 shadow-lg"
        >
          <p className="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-widest text-stone-400">
            {t('theme.label')}
          </p>
          {OPTIONS.map(({ value, icon: OptIcon }) => (
            <button
              key={value}
              role="menuitemradio"
              aria-checked={choice === value}
              onClick={() => { setTheme(value); setChoice(value); setOpen(false); }}
              className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-stone-50 ${
                choice === value ? 'font-semibold text-stone-900' : 'text-stone-600'}`}
            >
              <OptIcon size={15} className="shrink-0 text-stone-400" />
              <span className="flex-1">{t(`theme.${value}`)}</span>
              {choice === value && <Check size={14} className="shrink-0 text-primary-600" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
