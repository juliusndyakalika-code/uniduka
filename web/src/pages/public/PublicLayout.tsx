/**
 * Shell for the public marketing pages — About, Contact, Privacy, Terms.
 *
 * Shares the landing page's neumorphic surface so a visitor arriving from the
 * footer does not feel they have left the site. No app chrome and no auth.
 */
import { Link } from 'react-router-dom';
import { useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { LogoMark } from '../../components/ui/Logo';
import { BRAND } from '../../components/ui/Logo';

export const neu = {
  card:  { background: '#E8EBF0', boxShadow: '8px 8px 20px #c5cad3, -8px -8px 20px #ffffff', borderRadius: '1rem' },
  inset: { background: '#E8EBF0', boxShadow: 'inset 4px 4px 10px #c5cad3, inset -4px -4px 10px #ffffff', borderRadius: '0.75rem' },
};

/**
 * Every public contact detail, in one place.
 *
 * Anything left blank is hidden rather than shown as a placeholder — a dead
 * WhatsApp link or an address nobody answers costs more trust than an absent
 * one. Fill these in as they become real.
 */
export const CONTACT = {
  email:   'info@mauzohalisi.com',
  support: 'support@mauzohalisi.com',
  phone:   '',                          // published number, once there is one
  city:    'Dar es Salaam, Tanzania',
} as const;

interface Props {
  title: string;
  intro?: string;
  /** Shown under the title — e.g. when a policy last changed. */
  updated?: string;
  children: React.ReactNode;
}

export default function PublicLayout({ title, intro, updated, children }: Props) {
  // Arriving from a footer link mid-page otherwise keeps the old scroll position.
  useEffect(() => { window.scrollTo(0, 0); }, [title]);

  return (
    <div className="min-h-screen" style={{ background: '#E8EBF0' }}>
      <header className="sticky top-0 z-20 backdrop-blur-sm" style={{ background: '#E8EBF0EE' }}>
        <div className="max-w-3xl mx-auto px-5 sm:px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <LogoMark size={26} />
            <span className="text-base font-bold tracking-tight text-stone-900">
              {BRAND.nameA}<span style={{ color: BRAND.ochre }}>{BRAND.nameB}</span>
            </span>
          </Link>
          <Link to="/" className="text-xs font-semibold text-stone-500 hover:text-stone-900 flex items-center gap-1.5 transition-colors">
            <ArrowLeft size={13} /> Back to home
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 sm:px-6 py-10 sm:py-14">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-stone-900">{title}</h1>
        {intro && <p className="mt-3 text-stone-600 leading-relaxed max-w-2xl">{intro}</p>}
        {updated && <p className="mt-2 text-xs text-stone-400">Last updated {updated}</p>}
        <div className="mt-9 space-y-7">{children}</div>
      </main>

      <footer className="max-w-3xl mx-auto px-5 sm:px-6 pb-12">
        <div className="pt-6 border-t border-stone-300/50 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <p className="text-xs text-stone-400">© 2026 {BRAND.name}. All rights reserved.</p>
          <nav className="flex flex-wrap gap-x-5 gap-y-2">
            {[['About','/about'],['Contact','/contact'],['Privacy Policy','/privacy'],['Terms of Service','/terms']].map(([l, to]) => (
              <Link key={to} to={to} className="text-xs text-stone-500 hover:text-stone-900 transition-colors">{l}</Link>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  );
}

/** A titled block of prose. */
export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-bold text-stone-900 mb-2.5">{title}</h2>
      <div className="text-stone-600 leading-relaxed space-y-3 text-[15px]">{children}</div>
    </section>
  );
}
