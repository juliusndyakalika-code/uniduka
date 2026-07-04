import { useState } from 'react';
import { Languages } from 'lucide-react';
import i18n from '../../i18n';

interface Props {
  variant?: 'light' | 'dark';
}

export default function LanguageToggle({ variant = 'light' }: Props) {
  const [lang, setLang] = useState(i18n.language);

  function toggle() {
    const next = lang === 'en' ? 'sw' : 'en';
    i18n.changeLanguage(next);
    localStorage.setItem('lang', next);
    setLang(next);
  }

  const isLight = variant === 'light';

  return (
    <button
      onClick={toggle}
      title={lang === 'en' ? 'Switch to Kiswahili' : 'Badilisha hadi Kiingereza'}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
        isLight
          ? 'border-stone-300 text-stone-600 hover:border-stone-500 hover:text-stone-900 bg-white/80'
          : 'border-white/20 text-white/80 hover:border-white/50 hover:text-white bg-white/10'
      }`}
    >
      <Languages size={12} />
      {lang === 'en' ? 'SW' : 'EN'}
    </button>
  );
}
