import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import LanguageToggle from '../components/ui/LanguageToggle';
import {
  ShoppingCart, Package, Users, BarChart2, Shield, Zap, Globe,
  Receipt, Star, ChevronRight, Check, ArrowRight, Menu, X,
  TrendingUp, Lock, RefreshCw,
  ShoppingBag, Utensils, Stethoscope, Scissors, Wrench, Hotel,
  Wine, Layers, AlertTriangle, FileText, Clock, Truck, Wallet, Building2,
} from 'lucide-react';
import { LogoMark } from '../components/ui/Logo';

function useScrollY() {
  const [y, setY] = useState(0);
  useEffect(() => {
    const h = () => setY(window.scrollY);
    window.addEventListener('scroll', h, { passive: true });
    return () => window.removeEventListener('scroll', h);
  }, []);
  return y;
}

const neu = {
  card:  { background: '#E8EBF0', boxShadow: '8px 8px 20px #c5cad3, -8px -8px 20px #ffffff', borderRadius: '1rem' },
  inset: { background: '#E8EBF0', boxShadow: 'inset 4px 4px 10px #c5cad3, inset -4px -4px 10px #ffffff', borderRadius: '0.75rem' },
};

// These arrays carry only what does not change between languages — the icon, the
// accent colour, the key. Every string is looked up under `landing.*` so the
// language toggle in the navbar actually changes the page.
const BUSINESS_TYPES = [
  { icon: ShoppingBag,  k: 'retail'  },
  { icon: Layers,       k: 'whole'   },
  { icon: ShoppingCart, k: 'grocery' },
  { icon: Stethoscope,  k: 'pharm'   },
  { icon: Utensils,     k: 'rest'    },
  { icon: Wine,         k: 'bar'     },
  { icon: Scissors,     k: 'salon'   },
  { icon: Wrench,       k: 'repair'  },
  { icon: Hotel,        k: 'hotel'   },
];

// Grid is 4 columns on large screens, so this stays a multiple of four.
const FEATURES = [
  { icon: ShoppingCart, k: 'pos',    color: '#a66624' },
  { icon: Package,      k: 'stock',  color: '#0d9488' },
  { icon: FileText,     k: 'inv',    color: '#4f46e5' },
  { icon: Globe,        k: 'shop',   color: '#0f766e' },

  { icon: Receipt,      k: 'rcpt',   color: '#0369a1' },
  { icon: Clock,        k: 'debt',   color: '#b45309' },
  { icon: BarChart2,    k: 'rep',    color: '#7c3aed' },
  { icon: Truck,        k: 'ship',   color: '#a16207' },

  { icon: Users,        k: 'cust',   color: '#be185d' },
  { icon: Wallet,       k: 'exp',    color: '#065f46' },
  { icon: Building2,    k: 'branch', color: '#b91c1c' },
  { icon: Shield,       k: 'staff',  color: '#374151' },
];

// Limits here must match PLAN_LIMITS in backend/src/core/plans.ts, which is what
// actually gets enforced when someone adds a shop, branch, register or staff
// account. Advertising more than the system allows turns a sale into a support
// ticket on the customer's first busy week.
//
// Prices stay out of the translation files: TZS 20,000 is TZS 20,000 in either
// language, and a number that can drift between two files will eventually drift.
const PLANS = [
  { k: 'starter',    price: null,         period: 'trialPeriod', highlight: false },
  { k: 'growth',     price: 'TZS 20,000', period: 'perMonth',    highlight: false },
  { k: 'business',   price: 'TZS 40,000', period: 'perMonth',    highlight: true  },
  { k: 'enterprise', price: null,         period: 'contact',     highlight: false },
];

const STATS = [
  { value: '11',   k: 'types'    },
  { value: '100%', k: 'receipts' },
  { value: '20s',  k: 'checkout' },
];

// ── Mockup: Dashboard ─────────────────────────────────────────────────────────
// The mockups are screenshots of the product, so they follow the page language
// too — a Swahili page showing an English till reads as a mock-up of a different
// product. Sample product names are localised for the same reason.
function DashboardMockup() {
  const { t } = useTranslation();
  const m = (k: string) => t(`landing.mock.${k}`);
  return (
    <div className="relative w-full max-w-2xl mx-auto select-none">
      <div className="absolute inset-0 scale-95 translate-y-4 rounded-2xl blur-2xl" style={{ background: '#a6662420' }} />
      <div className="relative rounded-2xl overflow-hidden" style={{ ...neu.card, padding: 0 }}>

        <div className="flex items-center justify-between px-4 py-2.5 border-b border-stone-200/60" style={{ background: '#E8EBF0' }}>
          <div className="flex items-center gap-2">
            <LogoMark size={26} />
            <span className="text-xs font-bold text-stone-800">MauzoHalisi</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-[9px] text-stone-500 hidden sm:block">USER · {m('dashboard')}</div>
            <div className="w-6 h-6 rounded-full bg-stone-700 text-white text-[9px] font-bold flex items-center justify-center">U</div>
          </div>
        </div>

        <div className="flex" style={{ background: '#E8EBF0' }}>
          <div className="w-28 shrink-0 p-3 space-y-1 border-r border-stone-200/60 hidden sm:block">
            {['dashboard', 'pos', 'inventory', 'customers', 'reports'].map((k, i) => (
              <div key={k} className="px-2 py-1.5 rounded-lg text-[9px] font-medium"
                style={i === 0 ? { ...neu.inset, color: '#1c1917', fontWeight: 700 } : { color: '#78716c' }}>
                {m(k)}
              </div>
            ))}
          </div>

          <div className="flex-1 p-3 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { k: 'salesToday',   value: '485,200', unit: 'TZS',            color: '#a66624' },
                { k: 'transactions', value: '47',      unit: m('today'),       color: '#0d9488' },
                { k: 'products',     value: '312',     unit: m('active'),      color: '#7c3aed' },
                { k: 'lowStock',     value: '8',       unit: m('items'),       color: '#b91c1c' },
              ].map(({ k, value, unit, color }) => (
                <div key={k} className="p-2.5 rounded-xl" style={neu.card}>
                  <p className="text-[8px] uppercase tracking-wider font-semibold" style={{ color: '#a8a29e' }}>{m(k)}</p>
                  <p className="text-base font-bold mt-0.5" style={{ color }}>{value}</p>
                  <p className="text-[8px] text-stone-400">{unit}</p>
                </div>
              ))}
            </div>

            <div className="rounded-xl p-2.5" style={neu.card}>
              <p className="text-[9px] font-bold uppercase tracking-widest text-stone-500 mb-2">{m('recentSales')}</p>
              <div className="space-y-1.5">
                {[
                  { name: m('n1'), qty: `1 ${m('uEa')}`,  amount: '45,000', method: 'M-Pesa'  },
                  { name: m('n2'), qty: `4 ${m('uKg')}`,  amount: '12,800', method: m('cash') },
                  { name: m('n3'), qty: `2 ${m('uBtl')}`, amount: '8,600',  method: m('cash') },
                  { name: m('n4'), qty: `1 ${m('uEa')}`,  amount: '35,000', method: 'M-Pesa'  },
                ].map((tx, i) => (
                  <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded-lg" style={i === 0 ? neu.inset : {}}>
                    <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#10b981' }} />
                    <span className="flex-1 text-[9px] text-stone-700 font-medium truncate">{tx.name}</span>
                    <span className="text-[8px] text-stone-400 hidden sm:inline">{tx.qty}</span>
                    <span className="text-[9px] font-bold text-stone-800 tabular-nums">{tx.amount}/=</span>
                    <span className="text-[7px] px-1.5 py-0.5 rounded-full" style={{ background: '#d1fae5', color: '#065f46' }}>{tx.method}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Mockup: POS ───────────────────────────────────────────────────────────────
function PosMockup() {
  const { t } = useTranslation();
  const m = (k: string) => t(`landing.mock.${k}`);
  return (
    <div className="relative w-full max-w-lg mx-auto select-none">
      <div className="absolute inset-0 scale-95 translate-y-4 rounded-2xl blur-2xl" style={{ background: '#a6662420' }} />
      <div className="relative rounded-2xl overflow-hidden" style={{ ...neu.card, padding: 0 }}>

        <div className="flex items-center justify-between px-4 py-2.5 border-b border-stone-200/60" style={{ background: '#E8EBF0' }}>
          <span className="text-[10px] font-bold uppercase tracking-widest text-stone-600">{m('pointOfSale')}</span>
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-emerald-600 font-semibold flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full inline-block" /> {m('online')}
            </span>
            <span className="text-[9px] text-stone-400">{m('yourShop')}</span>
          </div>
        </div>

        <div className="flex h-60" style={{ background: '#E8EBF0' }}>
          <div className="flex-1 p-3 grid grid-cols-3 gap-2 content-start">
            {[
              { name: m('n1'), price: '45,000', qty: `184 ${m('uEa')}`,  highlight: true  },
              { name: m('n4'), price: '35,000', qty: `125 ${m('uEa')}`,  highlight: false },
              { name: m('n3'), price: '4,300',  qty: `123 ${m('uBtl')}`, highlight: false },
              { name: m('n2'), price: '3,200',  qty: `107 ${m('uKg')}`,  highlight: false },
              { name: m('n5'), price: '12,500', qty: `39 ${m('uEa')}`,   highlight: false },
              { name: m('n6'), price: '2,800',  qty: `88 ${m('uKg')}`,   highlight: false },
            ].map((p, i) => (
              <div key={i} className="rounded-xl p-2 cursor-pointer"
                style={{ ...neu.card, ...(p.highlight ? neu.inset : {}), outline: p.highlight ? '2px solid #a66624' : 'none' }}>
                <p className="text-[8px] font-semibold text-stone-800 leading-tight line-clamp-2">{p.name}</p>
                <p className="text-[10px] font-bold mt-1" style={{ color: '#a66624' }}>{p.price}/=</p>
                <p className="text-[7px] text-stone-400">{p.qty}</p>
              </div>
            ))}
          </div>

          <div className="w-36 flex flex-col border-l border-stone-200/60">
            <div className="px-3 py-2 border-b border-stone-200/60">
              <p className="text-[9px] font-bold text-stone-700 uppercase tracking-widest">{m('cart')} (2)</p>
            </div>
            <div className="flex-1 px-2 py-2 space-y-1.5 overflow-hidden">
              {[
                { name: m('n1'), qty: 1, total: '45,000' },
                { name: m('n2'), qty: 3, total: '9,600'  },
              ].map((item, i) => (
                <div key={i} className="p-1.5 rounded-lg" style={neu.card}>
                  <p className="text-[8px] font-medium text-stone-800 leading-tight">{item.name}</p>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[7px] px-1 rounded" style={{ background: '#e7e5e4', color: '#57534e' }}>x{item.qty}</span>
                    <span className="text-[9px] font-bold text-stone-900 tabular-nums">{item.total}/=</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-3 py-2 rounded-b-2xl text-white" style={{ background: 'linear-gradient(145deg,#434343,#1a1a1a)' }}>
              <div className="flex justify-between text-[8px] mb-1.5">
                <span className="opacity-70 uppercase">{m('total')}</span>
                <span className="font-bold">54,600/=</span>
              </div>
              <div className="w-full rounded-lg text-center py-1 text-[8px] font-bold" style={{ background: '#a66624' }}>
                {m('charge')}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Mockup: Products table ────────────────────────────────────────────────────
function ProductsMockup() {
  const { t } = useTranslation();
  const m = (k: string, o?: Record<string, unknown>) => t(`landing.mock.${k}`, o ?? {});
  return (
    <div className="relative w-full max-w-xl mx-auto select-none">
      <div className="relative rounded-2xl overflow-hidden p-4 space-y-3" style={neu.card}>
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-stone-800">{m('productsCount', { n: 312 })}</p>
          <div className="flex gap-1.5">
            <div className="px-2 py-1 rounded-lg text-[9px] font-semibold" style={neu.inset}>{m('all')}</div>
            <div className="px-2 py-1 rounded-lg text-[9px] text-stone-500 capitalize">{m('active')}</div>
            <div className="px-2 py-1 rounded-lg text-[9px] text-stone-500">{m('inactive')}</div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {[
            { k: 'products',    value: '312',                       warn: false },
            { k: 'totalItems',  value: `5,842 ${m('items')}`,       warn: false },
            { k: 'retailValue', value: '18.4M',                     warn: false },
            { k: 'lowOut',      value: '8 / 3',                     warn: true  },
          ].map(({ k, value, warn }) => (
            <div key={k} className="p-2 rounded-xl" style={neu.card}>
              <p className="text-[7px] uppercase tracking-wider text-stone-400">{m(k)}</p>
              <p className="text-[10px] font-bold mt-0.5" style={{ color: warn ? '#b91c1c' : '#1c1917' }}>{value}</p>
            </div>
          ))}
        </div>

        <div className="rounded-xl overflow-hidden" style={neu.inset}>
          <table className="w-full text-[8px]">
            <thead>
              <tr className="border-b border-stone-200/60">
                <th className="text-left px-2 py-1.5 text-stone-500 font-semibold">{m('product')}</th>
                <th className="text-left px-2 py-1.5 text-stone-500 font-semibold hidden sm:table-cell">{m('sku')}</th>
                <th className="text-left px-2 py-1.5 text-stone-500 font-semibold">{m('price')}</th>
                <th className="text-left px-2 py-1.5 text-stone-500 font-semibold">{m('stock')}</th>
              </tr>
            </thead>
            <tbody>
              {[
                { name: m('n1'), sku: 'PRD-001', price: '45,000', stock: '184', unit: m('uEa'),  warn: false },
                { name: m('n4'), sku: 'PRD-002', price: '35,000', stock: '125', unit: m('uEa'),  warn: false },
                { name: m('n3'), sku: 'PRD-003', price: '4,300',  stock: '5',   unit: m('uBtl'), warn: true  },
                { name: m('n2'), sku: 'PRD-004', price: '3,200',  stock: '107', unit: m('uKg'),  warn: false },
              ].map((p, i) => (
                <tr key={i} className="border-b border-stone-100">
                  <td className="px-2 py-1.5 font-medium text-stone-800">{p.name}</td>
                  <td className="px-2 py-1.5 text-stone-400 font-mono hidden sm:table-cell">{p.sku}</td>
                  <td className="px-2 py-1.5 font-semibold text-stone-800 tabular-nums">{p.price}/=</td>
                  <td className="px-2 py-1.5">
                    <span className="flex items-center gap-1">
                      {p.warn && <AlertTriangle size={8} className="text-amber-500" />}
                      <span className={p.warn ? 'text-amber-600 font-semibold' : 'text-stone-700'}>{p.stock} {p.unit}</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-stone-200">
                <td className="px-2 py-1.5 text-[7px] uppercase tracking-wide text-stone-400">{m('total')}</td>
                <td className="hidden sm:table-cell" />
                <td />
                <td className="px-2 py-1.5 font-bold text-stone-800 text-[9px]">{m('units', { n: '5,842' })}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

function Logo({ light = false }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      {/* The cart is drawn in ink, which vanishes on the dark sections */}
      <LogoMark size={28} inkColor={light ? '#FFFFFF' : undefined} />
      <span className={`text-lg font-bold tracking-tight ${light ? 'text-white' : 'text-stone-900'}`}>
        Mauzo<span className={`${light ? 'text-amber-300' : 'text-amber-700'}`}>Halisi</span>
      </span>
    </div>
  );
}

export default function LandingPage() {
  const { t } = useTranslation();
  const scrollY = useScrollY();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Bullet lists are stored as p1…p5 rather than a JSON array, so that a
  // half-translated file falls back to the English key instead of collapsing
  // the whole list to nothing.
  const bullets = (section: string, n: number) =>
    Array.from({ length: n }, (_, i) => t(`landing.${section}.p${i + 1}`));

  const NAV = [
    ['features', '#features'],
    ['who',      '#who'],
    ['pricing',  '#pricing'],
    ['install',  '#install'],
  ] as const;

  return (
    <div className="min-h-screen text-stone-900 overflow-x-hidden" style={{ background: '#E8EBF0' }}>

      {/* Navbar */}
      <header className="fixed top-0 inset-x-0 z-50 transition-all duration-300"
        style={scrollY > 20 ? { ...neu.card, borderRadius: 0, borderBottom: '1px solid #d6d3d1' } : { background: 'transparent' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Logo />
          <nav className="hidden md:flex items-center gap-8">
            {NAV.map(([k, href]) => (
              <a key={k} href={href} className="text-sm text-stone-600 hover:text-stone-900 transition-colors">{t(`landing.nav.${k}`)}</a>
            ))}
          </nav>
          <div className="hidden md:flex items-center gap-3">
            <LanguageToggle />
            <Link to="/login" className="btn-secondary py-2 px-5 text-[11px]">{t('landing.nav.signIn')}</Link>
            <Link to="/register" className="btn-primary py-2 px-5 text-[11px]">{t('landing.hero.ctaPrimary')}</Link>
          </div>
          <div className="md:hidden flex items-center gap-2">
            <LanguageToggle />
            <Link to="/login" className="btn-primary py-2 px-4 text-[11px]">{t('landing.nav.signIn')}</Link>
            <button className="p-2 text-stone-600" onClick={() => setMobileOpen(o => !o)}>
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
        {mobileOpen && (
          <div className="md:hidden px-4 py-5 space-y-4 border-t border-stone-200" style={{ background: '#E8EBF0' }}>
            {NAV.map(([k, href]) => (
              <a key={k} href={href} onClick={() => setMobileOpen(false)} className="block text-sm font-medium text-stone-700 py-1">{t(`landing.nav.${k}`)}</a>
            ))}
            <div className="pt-2 flex flex-col gap-3">
              <Link to="/login" className="btn-secondary py-2.5 text-center" onClick={() => setMobileOpen(false)}>{t('landing.nav.signIn')}</Link>
              <Link to="/register" className="btn-primary py-2.5 text-center" onClick={() => setMobileOpen(false)}>{t('landing.hero.ctaPrimary')}</Link>
            </div>
          </div>
        )}
      </header>

      {/* Hero */}
      <section className="relative pt-32 pb-20 lg:pt-40 lg:pb-28 overflow-hidden">
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:grid lg:grid-cols-2 lg:gap-16 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-6"
                style={{ ...neu.card, color: '#a66624' }}>
                <Zap size={12} className="fill-amber-700" /> {t('landing.hero.badge')}
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.1] tracking-tight mb-6">
                {t('landing.hero.title1')}
                <span className="block" style={{ color: '#a66624' }}>{t('landing.hero.title2')}</span>
                <span className="block text-stone-400 font-light">{t('landing.hero.title3')}</span>
              </h1>
              <p className="text-lg text-stone-500 leading-relaxed mb-8 max-w-lg">
                {t('landing.hero.subtitle')}
              </p>
              <div className="flex flex-wrap gap-3 mb-5">
                <Link to="/register" className="btn-primary py-3 px-7">
                  {t('landing.hero.ctaPrimary')} <ArrowRight size={15} />
                </Link>
                <Link to="/login" className="btn-secondary py-3 px-7">
                  {t('landing.hero.ctaSecondary')} <ChevronRight size={15} />
                </Link>
              </div>
              <div className="flex flex-wrap items-center gap-6 text-xs text-stone-500">
                {[
                  { icon: Check,     k: 'trial'  },
                  { icon: Lock,      k: 'noCard' },
                  { icon: RefreshCw, k: 'cancel' },
                ].map(({ icon: Icon, k }) => (
                  <span key={k} className="flex items-center gap-1.5">
                    <Icon size={12} className="text-emerald-600" />{t(`landing.hero.${k}`)}
                  </span>
                ))}
              </div>
            </div>
            <div className="mt-16 lg:mt-0">
              <DashboardMockup />
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-3 gap-4">
            {STATS.map(({ value, k }) => (
              <div key={k} className="p-6 text-center rounded-2xl" style={neu.card}>
                <p className="text-3xl font-bold mb-1" style={{ color: '#a66624' }}>{value}</p>
                <p className="text-xs text-stone-500">{t(`landing.stats.${k}`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: '#a66624' }}>{t('landing.features.eyebrow')}</p>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">{t('landing.features.title')}</h2>
            <p className="text-stone-500 max-w-xl mx-auto">
              {t('landing.features.subtitle')}
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {FEATURES.map(({ icon: Icon, k, color }) => (
              <div key={k} className="p-6 rounded-2xl" style={neu.card}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                  style={{ background: `${color}18`, color }}>
                  <Icon size={18} />
                </div>
                <h3 className="text-sm font-bold text-stone-900 mb-2">{t(`landing.features.${k}T`)}</h3>
                <p className="text-xs text-stone-500 leading-relaxed">{t(`landing.features.${k}D`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Products mockup section */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:grid lg:grid-cols-2 lg:gap-16 items-center">
            <div className="mb-12 lg:mb-0">
              <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: '#a66624' }}>{t('landing.inventory.eyebrow')}</p>
              <h2 className="text-3xl font-bold mb-4">{t('landing.inventory.title')}</h2>
              <p className="text-stone-500 leading-relaxed mb-6">
                {t('landing.inventory.body')}
              </p>
              <ul className="space-y-3">
                {bullets('inventory', 5).map(item => (
                  <li key={item} className="flex items-start gap-2.5 text-sm text-stone-600">
                    <Check size={14} className="text-emerald-600 mt-0.5 shrink-0" />{item}
                  </li>
                ))}
              </ul>
            </div>
            <ProductsMockup />
          </div>
        </div>
      </section>

      {/* POS section */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:grid lg:grid-cols-2 lg:gap-16 items-center">
            <div className="order-2 lg:order-1 mt-12 lg:mt-0">
              <PosMockup />
            </div>
            <div className="order-1 lg:order-2">
              <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: '#a66624' }}>{t('landing.pos.eyebrow')}</p>
              <h2 className="text-3xl font-bold mb-4">{t('landing.pos.title')}</h2>
              <p className="text-stone-500 leading-relaxed mb-6">
                {t('landing.pos.body')}
              </p>
              <ul className="space-y-3">
                {bullets('pos', 5).map(item => (
                  <li key={item} className="flex items-start gap-2.5 text-sm text-stone-600">
                    <Check size={14} className="text-emerald-600 mt-0.5 shrink-0" />{item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Who it's for */}
      <section id="who" className="py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: '#a66624' }}>{t('landing.who.eyebrow')}</p>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">{t('landing.who.title')}</h2>
            <p className="text-stone-500 max-w-xl mx-auto">
              {t('landing.who.subtitle')}
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {BUSINESS_TYPES.map(({ icon: Icon, k }) => (
              <div key={k} className="p-5 flex items-start gap-4 rounded-2xl" style={neu.card}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: '#a6662415', color: '#a66624' }}>
                  <Icon size={16} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-stone-900 leading-tight">{t(`landing.who.${k}T`)}</p>
                  <p className="text-xs text-stone-400 mt-0.5 leading-snug">{t(`landing.who.${k}D`)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-24">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: '#a66624' }}>{t('landing.steps.eyebrow')}</p>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">{t('landing.steps.title')}</h2>
            <p className="text-stone-500 max-w-lg mx-auto">{t('landing.steps.subtitle')}</p>
          </div>
          <div className="grid lg:grid-cols-3 gap-6">
            {['1', '2', '3'].map(n => (
              <div key={n} className="p-6 rounded-2xl" style={neu.card}>
                <div className="w-12 h-12 rounded-xl text-white text-sm font-bold flex items-center justify-center mb-5"
                  style={{ background: 'linear-gradient(145deg,#434343,#1a1a1a)', boxShadow: '4px 4px 10px #c5cad3, -2px -2px 8px #ffffff' }}>
                  {`0${n}`}
                </div>
                <h3 className="text-base font-bold text-stone-900 mb-2">{t(`landing.steps.s${n}T`)}</h3>
                <p className="text-sm text-stone-500 leading-relaxed">{t(`landing.steps.s${n}D`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Receipt */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:grid lg:grid-cols-2 lg:gap-16 items-center">
            <div>
              <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: '#a66624' }}>{t('landing.receipt.eyebrow')}</p>
              <h2 className="text-3xl font-bold mb-4">{t('landing.receipt.title')}</h2>
              <p className="text-stone-500 leading-relaxed mb-6">
                {t('landing.receipt.body')}
              </p>
              <ul className="space-y-3">
                {bullets('receipt', 5).map(item => (
                  <li key={item} className="flex items-start gap-2.5 text-sm text-stone-600">
                    <Check size={14} className="text-emerald-600 mt-0.5 shrink-0" />{item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-12 lg:mt-0 flex justify-center">
              <div className="rounded-2xl overflow-hidden w-64 font-mono text-[10px]" style={neu.card}>
                <div className="text-center py-2 text-[10px] tracking-widest text-stone-500 font-bold border-b border-stone-200">
                  {t('landing.mock.receiptPreview')}
                </div>
                <div className="p-4 space-y-1 border-b border-dashed border-stone-300">
                  <p className="text-center font-bold text-sm text-stone-900">{t('landing.mock.yourShopName')}</p>
                  <p className="text-center text-stone-500">{t('landing.mock.city')}</p>
                  <p className="text-center text-stone-500">{t('landing.mock.tel')}: +255 7XX XXX XXX</p>
                </div>
                <div className="p-4 space-y-1 border-b border-dashed border-stone-300">
                  <p className="text-center font-bold text-stone-800">TIN: 100-XXX-XXX</p>
                  <p className="text-center text-stone-500">VRN: 40-XXXXXX-A</p>
                </div>
                <div className="p-4 space-y-1 border-b border-dashed border-stone-300 text-stone-700">
                  <div className="flex justify-between"><span>{t('landing.mock.date')}:</span><span>24/07/2026</span></div>
                  <div className="flex justify-between"><span>{t('landing.mock.time')}:</span><span>10:15:44</span></div>
                  <div className="flex justify-between font-bold"><span>{t('landing.mock.receipt')}:</span><span>RCP-0248</span></div>
                </div>
                <div className="p-4 space-y-1">
                  <div className="flex justify-between text-stone-400 text-[8px] mb-2">
                    <span>{t('landing.mock.item')}</span><span>TC</span><span>{t('landing.mock.amount')}</span>
                  </div>
                  <div className="flex justify-between text-stone-700">
                    <span className="flex-1">{t('landing.mock.n1')}</span><span className="w-6 text-center">A</span><span>45,000</span>
                  </div>
                  <div className="flex justify-between text-stone-700">
                    <span className="flex-1">{t('landing.mock.n2')}</span><span className="w-6 text-center">E</span><span>9,600</span>
                  </div>
                  <div className="border-t border-dashed border-stone-300 mt-2 pt-2">
                    <div className="flex justify-between font-bold text-sm text-stone-900"><span className="uppercase">{t('landing.mock.total')}</span><span>TZS 54,600</span></div>
                    <div className="flex justify-between text-stone-500 text-[8px] mt-1"><span>M-Pesa</span><span>54,600</span></div>
                  </div>
                </div>
                <div className="p-3 text-center text-[8px] text-stone-500 space-y-0.5 border-t border-stone-200">
                  <p className="font-bold text-stone-700">{t('landing.mock.thanks')}</p>
                  <p>{t('landing.mock.poweredBy')}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: '#a66624' }}>{t('landing.pricing.eyebrow')}</p>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">{t('landing.pricing.title')}</h2>
            <p className="text-stone-500 max-w-lg mx-auto">{t('landing.pricing.subtitle')}</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 items-start">
            {PLANS.map(({ k, price, period, highlight }) => (
              <div key={k} className={`relative rounded-2xl p-6 flex flex-col ${highlight ? 'scale-105' : ''}`}
                style={highlight
                  ? { background: 'linear-gradient(145deg,#434343,#1a1a1a)', boxShadow: '8px 8px 20px #c5cad3, -8px -8px 20px #ffffff', borderRadius: '1rem' }
                  : neu.card}>
                {highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="inline-flex items-center gap-1 text-white text-[10px] font-bold px-3 py-1 rounded-full"
                      style={{ background: '#a66624' }}>
                      <Star size={10} className="fill-white" /> {t('landing.pricing.popular')}
                    </span>
                  </div>
                )}
                <div className="mb-5">
                  <p className="text-xs font-bold uppercase tracking-widest mb-2"
                    style={{ color: highlight ? '#fbbf24' : '#a66624' }}>{t(`landing.pricing.${k}T`)}</p>
                  <div className="flex items-baseline gap-1 mb-1">
                    <span className={`text-2xl font-bold ${highlight ? 'text-white' : 'text-stone-900'}`}>
                      {price ?? t(k === 'starter' ? 'landing.pricing.free' : 'landing.pricing.custom')}
                    </span>
                    <span className="text-xs text-stone-400">{t(`landing.pricing.${period}`)}</span>
                  </div>
                  <p className={`text-xs leading-snug ${highlight ? 'text-stone-400' : 'text-stone-500'}`}>{t(`landing.pricing.${k}D`)}</p>
                </div>
                <ul className="space-y-2.5 flex-1 mb-6">
                  {(t(`landing.pricing.${k}F`, { returnObjects: true }) as string[]).map(f => (
                    <li key={f} className="flex items-start gap-2">
                      <Check size={13} className={`mt-0.5 shrink-0 ${highlight ? 'text-amber-400' : 'text-emerald-600'}`} />
                      <span className={`text-xs ${highlight ? 'text-stone-300' : 'text-stone-600'}`}>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link to="/register"
                  className="block text-center text-xs font-bold uppercase tracking-widest py-2.5 rounded-xl transition-colors"
                  style={highlight
                    ? { background: '#a66624', color: 'white' }
                    : { background: '#E8EBF0', color: '#1c1917', boxShadow: '4px 4px 8px #c5cad3, -4px -4px 8px #ffffff' }}>
                  {t(k === 'enterprise' ? 'landing.pricing.ctaEnterprise' : 'landing.pricing.cta')}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Install */}
      <section id="install" className="py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:grid lg:grid-cols-2 lg:gap-16 items-center">
            <div>
              <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: '#a66624' }}>{t('landing.install.eyebrow')}</p>
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">{t('landing.install.title')}<br/>{t('landing.install.title2')}</h2>
              <p className="text-stone-500 leading-relaxed mb-8">
                {t('landing.install.body')}
              </p>
              <ul className="space-y-3 mb-10">
                {bullets('install', 5).map(item => (
                  <li key={item} className="flex items-start gap-2.5 text-sm text-stone-600">
                    <Check size={14} className="text-emerald-600 mt-0.5 shrink-0" />{item}
                  </li>
                ))}
              </ul>
              <div className="p-5 rounded-2xl" style={neu.card}>
                <p className="text-xs font-semibold uppercase tracking-widest text-stone-400 mb-4">{t('landing.install.howTo')}</p>
                <div className="space-y-3">
                  {[1, 2, 3, 4].map(n => t(`landing.install.h${n}`)).map((text, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <span className="w-6 h-6 rounded-full text-white text-xs font-bold flex items-center justify-center shrink-0"
                        style={{ background: '#a66624' }}>{i + 1}</span>
                      <p className="text-sm text-stone-600">{text}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-12 lg:mt-0 flex justify-center">
              <div className="w-52 h-[26rem] rounded-3xl flex flex-col overflow-hidden" style={{ ...neu.card, padding: 0 }}>
                <div className="h-6 flex items-center justify-center border-b border-stone-200/60" style={{ background: '#E8EBF0' }}>
                  <div className="w-16 h-1.5 rounded-full" style={{ background: '#c5cad3' }} />
                </div>
                <div className="flex-1 p-3 space-y-2" style={{ background: '#E8EBF0' }}>
                  <div className="p-3 rounded-xl" style={neu.card}>
                    <p className="text-[9px] uppercase tracking-widest text-stone-400">{t('landing.mock.salesToday')}</p>
                    <p className="text-xl font-bold mt-0.5 text-stone-900">485,200<span className="text-xs font-normal text-stone-400 ml-1">TZS</span></p>
                    <p className="text-[9px] text-emerald-600 mt-0.5">{t('landing.mock.upFrom')}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2.5 rounded-xl" style={neu.card}>
                      <p className="text-[8px] text-stone-400">{t('landing.mock.transactions')}</p>
                      <p className="text-sm font-bold text-stone-900">47</p>
                    </div>
                    <div className="p-2.5 rounded-xl" style={neu.card}>
                      <p className="text-[8px] text-stone-400">{t('landing.mock.itemsSold')}</p>
                      <p className="text-sm font-bold text-stone-900">312</p>
                    </div>
                  </div>
                  <div className="p-2 rounded-xl text-center" style={neu.inset}>
                    <p className="text-[9px] font-bold text-emerald-600">{t('landing.mock.installedAsApp')}</p>
                  </div>
                  <div className="space-y-1.5">
                    {[
                      { name: t('landing.mock.n1'), price: '45,000/=' },
                      { name: t('landing.mock.n2'), price: '3,200/='  },
                      { name: t('landing.mock.n3'), price: '4,300/='  },
                    ].map(p => (
                      <div key={p.name} className="p-2 rounded-lg flex justify-between items-center" style={neu.card}>
                        <p className="text-[8px] text-stone-600 truncate">{p.name}</p>
                        <p className="text-[8px] font-bold text-stone-800 shrink-0">{p.price}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <div className="p-10 rounded-2xl" style={neu.card}>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-6"
              style={{ ...neu.inset, color: '#a66624' }}>
              <TrendingUp size={12} /> {t('landing.cta.badge')}
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">{t('landing.cta.title')}</h2>
            <p className="text-stone-500 mb-8 text-lg">
              {t('landing.cta.body')}
            </p>
            <div className="flex flex-wrap justify-center gap-4 mb-8">
              <Link to="/register" className="btn-primary py-3.5 px-8">{t('landing.cta.primary')} <ArrowRight size={16} /></Link>
              <Link to="/login" className="btn-secondary py-3.5 px-8">{t('landing.cta.secondary')}</Link>
            </div>
            <div className="flex flex-wrap justify-center gap-6 text-xs text-stone-400">
              {(t('landing.cta.chips', { returnObjects: true }) as string[]).map(chip => (
                <span key={chip} className="flex items-center gap-1.5"><Check size={11} className="text-emerald-500" />{chip}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-stone-200/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-10">
            <div className="sm:col-span-2 lg:col-span-1">
              <Logo />
              <p className="text-sm leading-relaxed text-stone-500 mt-4">
                {t('landing.footer.tagline')}
              </p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-stone-700 mb-4">{t('landing.footer.product')}</p>
              <ul className="space-y-2.5">
                {([['features','#features'],['pricing','#pricing'],['installApp','#install']] as const).map(([k, h]) => (
                  <li key={k}><a href={h} className="text-sm text-stone-500 hover:text-stone-900 transition-colors">{t(`landing.footer.${k}`)}</a></li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-stone-700 mb-4">{t('landing.footer.industries')}</p>
              <ul className="space-y-2.5">
                {['i1','i2','i3','i4'].map(k => (
                  <li key={k}><a href="#who" className="text-sm text-stone-500 hover:text-stone-900 transition-colors">{t(`landing.footer.${k}`)}</a></li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-stone-700 mb-4">{t('landing.footer.company')}</p>
              <ul className="space-y-2.5">
                {([['about','/about'],['contact','/contact'],['privacy','/privacy'],['terms','/terms']] as const).map(([k, to]) => (
                  <li key={to}>
                    <Link to={to} className="text-sm text-stone-500 hover:text-stone-900 transition-colors">{t(`landing.footer.${k}`)}</Link>
                  </li>
                ))}
              </ul>
              <div className="mt-5">
                <p className="text-xs text-stone-400 mb-1">{t('landing.footer.reach')}</p>
                <p className="text-sm text-stone-700">info@mauzohalisi.com</p>
              </div>
            </div>
          </div>
          <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-stone-200/60">
            <p className="text-xs text-stone-400">© {new Date().getFullYear()} MauzoHalisi. {t('landing.footer.rights')}</p>
          </div>
        </div>
      </footer>

    </div>
  );
}
