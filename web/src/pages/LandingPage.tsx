import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import LanguageToggle from '../components/ui/LanguageToggle';
import {
  ShoppingCart, Package, Users, BarChart2, Shield, Zap, Globe,
  Receipt, Star, ChevronRight, Check, ArrowRight, Menu, X,
  Smartphone, Printer, TrendingUp, Lock, RefreshCw,
  ShoppingBag, Utensils, Stethoscope, Scissors, Wrench, Hotel,
  Wine, Layers, AlertTriangle,
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

const BUSINESS_TYPES = [
  { icon: ShoppingBag,  label: 'Retail Store',          desc: 'General merchandise and fashion' },
  { icon: Layers,       label: 'Wholesale / B2B',        desc: 'Bulk supply and distribution' },
  { icon: ShoppingCart, label: 'Grocery & Supermarket',  desc: 'FMCG and fresh produce' },
  { icon: Stethoscope,  label: 'Pharmacy & Clinic',      desc: 'Medicine, Rx tracking, prescriptions' },
  { icon: Utensils,     label: 'Restaurant & Café',      desc: 'Table orders, KDS, menu management' },
  { icon: Wine,         label: 'Bar & Nightclub',        desc: 'Tab tracking and liquor inventory' },
  { icon: Scissors,     label: 'Salon & Spa',            desc: 'Appointments and service booking' },
  { icon: Wrench,       label: 'Repair Workshop',        desc: 'Job cards and parts inventory' },
  { icon: Hotel,        label: 'Hotel & Guesthouse',     desc: 'Room management and food & beverage' },
];

const FEATURES = [
  { icon: ShoppingCart, title: 'Point of Sale',      desc: 'Simple POS that works for any business. Take cash, M-Pesa, or card and print receipts on the spot.', color: '#a66624' },
  { icon: Package,      title: 'Smart Inventory',    desc: 'Real-time stock tracking with automatic cost calculation. Get alerts before you run out.', color: '#0d9488' },
  { icon: Users,        title: 'Customer CRM',       desc: 'Keep customer profiles, track purchase history, and run a loyalty points programme.', color: '#b45309' },
  { icon: BarChart2,    title: 'Sales Reports',      desc: 'See revenue by day, week, or month. Know which products sell and how much profit you make.', color: '#7c3aed' },
  { icon: Receipt,      title: 'Auto Receipts',      desc: 'Every sale generates a receipt with TIN, VRN, and tax codes automatically.', color: '#0369a1' },
  { icon: Globe,        title: 'Multi-Branch',       desc: 'Run all your shops from one account. Switch branches in seconds.', color: '#b91c1c' },
  { icon: Smartphone,   title: 'Install on Android', desc: 'Install straight from Chrome with no Play Store needed. Works like a regular app, always up to date.', color: '#b45309' },
  { icon: Shield,       title: 'Role-Based Access',  desc: 'Set up roles like Cashier or Inventory Staff. Everyone sees only what their job requires.', color: '#374151' },
];

const PLANS = [
  { name: 'Starter',    price: 'Free',       period: '30-day trial', desc: 'Good for new businesses just getting started.', highlight: false,
    features: ['1 shop', '1 user', 'POS and inventory', 'Auto receipts', 'Basic reports', 'Email support'] },
  { name: 'Growth',     price: 'TZS 49,000', period: '/month',       desc: 'For businesses ready to grow.',                highlight: false,
    features: ['Up to 3 shops', 'Up to 10 users', 'Everything in Starter', 'Loyalty programme', 'Appointments', 'CRM and customers'] },
  { name: 'Business',   price: 'TZS 99,000', period: '/month',       desc: 'Full features for established businesses.',    highlight: true,
    features: ['Up to 10 shops', 'Unlimited users', 'Everything in Growth', 'Staff reports', 'Purchase orders', 'KDS for restaurants', 'Priority support'] },
  { name: 'Enterprise', price: 'Custom',     period: 'contact us',   desc: 'For large chains and franchises.',             highlight: false,
    features: ['Unlimited shops', 'Unlimited users', 'Everything in Business', 'Dedicated account manager', 'Custom integrations', 'SLA guarantee'] },
];

const STATS = [
  { value: '11',   label: 'Business types supported' },
  { value: '100%', label: 'TAX-compliant receipts' },
  { value: '20s',  label: 'Average checkout time' },
];

// ── Mockup: Dashboard ─────────────────────────────────────────────────────────
function DashboardMockup() {
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
            <div className="text-[9px] text-stone-500 hidden sm:block">USER · Dashboard</div>
            <div className="w-6 h-6 rounded-full bg-stone-700 text-white text-[9px] font-bold flex items-center justify-center">U</div>
          </div>
        </div>

        <div className="flex" style={{ background: '#E8EBF0' }}>
          <div className="w-28 shrink-0 p-3 space-y-1 border-r border-stone-200/60 hidden sm:block">
            {[
              { label: 'Dashboard', active: true },
              { label: 'POS',       active: false },
              { label: 'Inventory', active: false },
              { label: 'Customers', active: false },
              { label: 'Reports',   active: false },
            ].map(({ label, active }) => (
              <div key={label} className="px-2 py-1.5 rounded-lg text-[9px] font-medium"
                style={active ? { ...neu.inset, color: '#1c1917', fontWeight: 700 } : { color: '#78716c' }}>
                {label}
              </div>
            ))}
          </div>

          <div className="flex-1 p-3 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { label: 'Sales Today',  value: '485,200', unit: 'TZS',    color: '#a66624' },
                { label: 'Transactions', value: '47',      unit: 'today',  color: '#0d9488' },
                { label: 'Products',     value: '312',     unit: 'active', color: '#7c3aed' },
                { label: 'Low Stock',    value: '8',       unit: 'items',  color: '#b91c1c' },
              ].map(({ label, value, unit, color }) => (
                <div key={label} className="p-2.5 rounded-xl" style={neu.card}>
                  <p className="text-[8px] uppercase tracking-wider font-semibold" style={{ color: '#a8a29e' }}>{label}</p>
                  <p className="text-base font-bold mt-0.5" style={{ color }}>{value}</p>
                  <p className="text-[8px] text-stone-400">{unit}</p>
                </div>
              ))}
            </div>

            <div className="rounded-xl p-2.5" style={neu.card}>
              <p className="text-[9px] font-bold uppercase tracking-widest text-stone-500 mb-2">Recent Sales</p>
              <div className="space-y-1.5">
                {[
                  { name: 'Samsung Earphones', qty: '1 ea',  amount: '45,000', method: 'M-Pesa' },
                  { name: 'Maize Flour 2kg',   qty: '4 kg',  amount: '12,800', method: 'Cash'   },
                  { name: 'Cooking Oil 1L',    qty: '2 btl', amount: '8,600',  method: 'Cash'   },
                  { name: 'Blue Jeans (32)',   qty: '1 ea',  amount: '35,000', method: 'M-Pesa' },
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
  return (
    <div className="relative w-full max-w-lg mx-auto select-none">
      <div className="absolute inset-0 scale-95 translate-y-4 rounded-2xl blur-2xl" style={{ background: '#a6662420' }} />
      <div className="relative rounded-2xl overflow-hidden" style={{ ...neu.card, padding: 0 }}>

        <div className="flex items-center justify-between px-4 py-2.5 border-b border-stone-200/60" style={{ background: '#E8EBF0' }}>
          <span className="text-[10px] font-bold uppercase tracking-widest text-stone-600">Point of Sale</span>
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-emerald-600 font-semibold flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full inline-block" /> Online
            </span>
            <span className="text-[9px] text-stone-400">Your Shop</span>
          </div>
        </div>

        <div className="flex h-60" style={{ background: '#E8EBF0' }}>
          <div className="flex-1 p-3 grid grid-cols-3 gap-2 content-start">
            {[
              { name: 'Samsung Earphones', price: '45,000', qty: '184 ea',  highlight: true  },
              { name: 'Blue Jeans 32',     price: '35,000', qty: '125 ea',  highlight: false },
              { name: 'Cooking Oil 1L',    price: '4,300',  qty: '123 btl', highlight: false },
              { name: 'Maize Flour 2kg',   price: '3,200',  qty: '107 kg',  highlight: false },
              { name: 'Body Lotion 400ml', price: '12,500', qty: '39 ea',   highlight: false },
              { name: 'Sugar 1kg',         price: '2,800',  qty: '88 kg',   highlight: false },
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
              <p className="text-[9px] font-bold text-stone-700 uppercase tracking-widest">Cart (2)</p>
            </div>
            <div className="flex-1 px-2 py-2 space-y-1.5 overflow-hidden">
              {[
                { name: 'Samsung Earphones', qty: 1, total: '45,000' },
                { name: 'Maize Flour 2kg',   qty: 3, total: '9,600'  },
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
                <span className="opacity-70">TOTAL</span>
                <span className="font-bold">54,600/=</span>
              </div>
              <div className="w-full rounded-lg text-center py-1 text-[8px] font-bold" style={{ background: '#a66624' }}>
                Charge
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
  return (
    <div className="relative w-full max-w-xl mx-auto select-none">
      <div className="relative rounded-2xl overflow-hidden p-4 space-y-3" style={neu.card}>
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-stone-800">Products (312 items)</p>
          <div className="flex gap-1.5">
            <div className="px-2 py-1 rounded-lg text-[9px] font-semibold" style={neu.inset}>All</div>
            <div className="px-2 py-1 rounded-lg text-[9px] text-stone-500">Active</div>
            <div className="px-2 py-1 rounded-lg text-[9px] text-stone-500">Inactive</div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {[
            { label: 'Products',    value: '312',       warn: false },
            { label: 'Total Items', value: '5,842 pcs', warn: false },
            { label: 'Retail Value',value: '18.4M',     warn: false },
            { label: 'Low / Out',   value: '8 / 3',     warn: true  },
          ].map(({ label, value, warn }) => (
            <div key={label} className="p-2 rounded-xl" style={neu.card}>
              <p className="text-[7px] uppercase tracking-wider text-stone-400">{label}</p>
              <p className="text-[10px] font-bold mt-0.5" style={{ color: warn ? '#b91c1c' : '#1c1917' }}>{value}</p>
            </div>
          ))}
        </div>

        <div className="rounded-xl overflow-hidden" style={neu.inset}>
          <table className="w-full text-[8px]">
            <thead>
              <tr className="border-b border-stone-200/60">
                <th className="text-left px-2 py-1.5 text-stone-500 font-semibold">Product</th>
                <th className="text-left px-2 py-1.5 text-stone-500 font-semibold hidden sm:table-cell">SKU</th>
                <th className="text-left px-2 py-1.5 text-stone-500 font-semibold">Price</th>
                <th className="text-left px-2 py-1.5 text-stone-500 font-semibold">Stock</th>
              </tr>
            </thead>
            <tbody>
              {[
                { name: 'Samsung Earphones', sku: 'PRD-001', price: '45,000', stock: '184', unit: 'ea',  warn: false },
                { name: 'Blue Jeans 32',     sku: 'PRD-002', price: '35,000', stock: '125', unit: 'ea',  warn: false },
                { name: 'Cooking Oil 1L',    sku: 'PRD-003', price: '4,300',  stock: '5',   unit: 'btl', warn: true  },
                { name: 'Maize Flour 2kg',   sku: 'PRD-004', price: '3,200',  stock: '107', unit: 'kg',  warn: false },
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
                <td className="px-2 py-1.5 text-[7px] uppercase tracking-wide text-stone-400">Total</td>
                <td className="hidden sm:table-cell" />
                <td />
                <td className="px-2 py-1.5 font-bold text-stone-800 text-[9px]">5,842 units</td>
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
  const scrollY = useScrollY();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen text-stone-900 overflow-x-hidden" style={{ background: '#E8EBF0' }}>

      {/* Navbar */}
      <header className="fixed top-0 inset-x-0 z-50 transition-all duration-300"
        style={scrollY > 20 ? { ...neu.card, borderRadius: 0, borderBottom: '1px solid #d6d3d1' } : { background: 'transparent' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Logo />
          <nav className="hidden md:flex items-center gap-8">
            {[['Features','#features'],["Who It's For",'#who'],['Pricing','#pricing'],['Install','#install']].map(([item, href]) => (
              <a key={item} href={href} className="text-sm text-stone-600 hover:text-stone-900 transition-colors">{item}</a>
            ))}
          </nav>
          <div className="hidden md:flex items-center gap-3">
            <LanguageToggle />
            <Link to="/login" className="btn-secondary py-2 px-5 text-[11px]">Sign In</Link>
            <Link to="/register" className="btn-primary py-2 px-5 text-[11px]">Start Free Trial</Link>
          </div>
          <div className="md:hidden flex items-center gap-2">
            <LanguageToggle />
            <Link to="/login" className="btn-primary py-2 px-4 text-[11px]">Sign In</Link>
            <button className="p-2 text-stone-600" onClick={() => setMobileOpen(o => !o)}>
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
        {mobileOpen && (
          <div className="md:hidden px-4 py-5 space-y-4 border-t border-stone-200" style={{ background: '#E8EBF0' }}>
            {[['Features','#features'],["Who It's For",'#who'],['Pricing','#pricing'],['Install','#install']].map(([item, href]) => (
              <a key={item} href={href} onClick={() => setMobileOpen(false)} className="block text-sm font-medium text-stone-700 py-1">{item}</a>
            ))}
            <div className="pt-2 flex flex-col gap-3">
              <Link to="/login" className="btn-secondary py-2.5 text-center" onClick={() => setMobileOpen(false)}>Sign In</Link>
              <Link to="/register" className="btn-primary py-2.5 text-center" onClick={() => setMobileOpen(false)}>Start Free Trial</Link>
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
                <Zap size={12} className="fill-amber-700" /> Built for all business types
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.1] tracking-tight mb-6">
                Run your business
                <span className="block" style={{ color: '#a66624' }}>smarter, faster</span>
                <span className="block text-stone-400 font-light">every single day.</span>
              </h1>
              <p className="text-lg text-stone-500 leading-relaxed mb-8 max-w-lg">
                MauzoHalisi covers retail, restaurants, pharmacies, salons and more.
                TRA receipts, real-time inventory, and a full Android POS are included from day one.
              </p>
              <div className="flex flex-wrap gap-3 mb-5">
                <Link to="/register" className="btn-primary py-3 px-7">
                  Start Free Trial <ArrowRight size={15} />
                </Link>
                <Link to="/login" className="btn-secondary py-3 px-7">
                  Sign In <ChevronRight size={15} />
                </Link>
              </div>
              <div className="flex flex-wrap items-center gap-6 text-xs text-stone-500">
                {[
                  { icon: Check,     text: '30-day free trial'       },
                  { icon: Lock,      text: 'No credit card required' },
                  { icon: RefreshCw, text: 'Cancel anytime'          },
                ].map(({ icon: Icon, text }) => (
                  <span key={text} className="flex items-center gap-1.5">
                    <Icon size={12} className="text-emerald-600" />{text}
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
            {STATS.map(({ value, label }) => (
              <div key={label} className="p-6 text-center rounded-2xl" style={neu.card}>
                <p className="text-3xl font-bold mb-1" style={{ color: '#a66624' }}>{value}</p>
                <p className="text-xs text-stone-500">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: '#a66624' }}>Platform Features</p>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Everything your business needs</h2>
            <p className="text-stone-500 max-w-xl mx-auto">
              One platform, set up for your business type. No plugins and no complicated configuration.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {FEATURES.map(({ icon: Icon, title, desc, color }) => (
              <div key={title} className="p-6 rounded-2xl" style={neu.card}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                  style={{ background: `${color}18`, color }}>
                  <Icon size={18} />
                </div>
                <h3 className="text-sm font-bold text-stone-900 mb-2">{title}</h3>
                <p className="text-xs text-stone-500 leading-relaxed">{desc}</p>
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
              <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: '#a66624' }}>Inventory Management</p>
              <h2 className="text-3xl font-bold mb-4">Always know what you have in stock</h2>
              <p className="text-stone-500 leading-relaxed mb-6">
                Track every unit across all your products. The table footer shows live totals for whatever you are searching.
                Stock alerts turn amber when a product hits its reorder point and red when it runs out.
              </p>
              <ul className="space-y-3">
                {[
                  'Weighted average cost pricing updated on every restock',
                  'Barcode scanning with a physical scanner or camera',
                  'CSV bulk import and shipment receiving by name, SKU, or barcode',
                  'Box-quantity entry for carton deliveries',
                  'Low stock and out-of-stock counters always visible at the top',
                ].map(item => (
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
              <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: '#a66624' }}>Point of Sale</p>
              <h2 className="text-3xl font-bold mb-4">Checkout in under 20 seconds</h2>
              <p className="text-stone-500 leading-relaxed mb-6">
                The POS shows your full product list with live stock levels. Tap to add items, set the quantity,
                apply a discount, and charge. The whole thing happens on one screen.
              </p>
              <ul className="space-y-3">
                {[
                  'Cash, M-Pesa, card, and credit (debt) payments',
                  'Sell above listed price for negotiated deals',
                  'Receipt printed automatically on every sale',
                  'Void or refund any transaction with one tap',
                  'Debt tracking to record and collect customer balances',
                ].map(item => (
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
            <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: '#a66624' }}>Business Types</p>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Built for your industry</h2>
            <p className="text-stone-500 max-w-xl mx-auto">
              Pick your business type when you sign up. MauzoHalisi sets up the right tools, tax settings, and workflows for you automatically.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {BUSINESS_TYPES.map(({ icon: Icon, label, desc }) => (
              <div key={label} className="p-5 flex items-start gap-4 rounded-2xl" style={neu.card}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: '#a6662415', color: '#a66624' }}>
                  <Icon size={16} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-stone-900 leading-tight">{label}</p>
                  <p className="text-xs text-stone-400 mt-0.5 leading-snug">{desc}</p>
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
            <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: '#a66624' }}>Get Started</p>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Up and running in minutes</h2>
            <p className="text-stone-500 max-w-lg mx-auto">No training needed. Just sign up and start selling.</p>
          </div>
          <div className="grid lg:grid-cols-3 gap-6">
            {[
              { step: '01', title: 'Register your business', desc: 'Sign up and choose your business type. MauzoHalisi sets up the right settings and modules for you.' },
              { step: '02', title: 'Set up your shop',       desc: 'Add your products, set prices, and enter your TIN. Import stock by CSV or receive a shipment. Your team can be up and running within an hour.' },
              { step: '03', title: 'Start selling',          desc: 'Open the POS and start. Stock updates automatically, reports fill in on their own, and every sale prints a receipt.' },
            ].map(({ step, title, desc }) => (
              <div key={step} className="p-6 rounded-2xl" style={neu.card}>
                <div className="w-12 h-12 rounded-xl text-white text-sm font-bold flex items-center justify-center mb-5"
                  style={{ background: 'linear-gradient(145deg,#434343,#1a1a1a)', boxShadow: '4px 4px 10px #c5cad3, -2px -2px 8px #ffffff' }}>
                  {step}
                </div>
                <h3 className="text-base font-bold text-stone-900 mb-2">{title}</h3>
                <p className="text-sm text-stone-500 leading-relaxed">{desc}</p>
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
              <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: '#a66624' }}>TRA Compliance</p>
              <h2 className="text-3xl font-bold mb-4">Every sale prints a receipt automatically.</h2>
              <p className="text-stone-500 leading-relaxed mb-6">
                Each receipt includes your shop name, address, TIN, VRN, itemised products, tax breakdown, and payment details.
                Print it straight away or share it with the customer. No extra setup needed.
              </p>
              <ul className="space-y-3">
                {[
                  'Shop name, address and phone on every receipt',
                  'TIN and VRN printed when configured',
                  'Tax codes: A (18% VAT), C (Zero-rated), E (Exempt)',
                  'Customer TIN field for B2B invoices',
                  'Unique receipt number and timestamp on every sale',
                ].map(item => (
                  <li key={item} className="flex items-start gap-2.5 text-sm text-stone-600">
                    <Check size={14} className="text-emerald-600 mt-0.5 shrink-0" />{item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-12 lg:mt-0 flex justify-center">
              <div className="rounded-2xl overflow-hidden w-64 font-mono text-[10px]" style={neu.card}>
                <div className="text-center py-2 text-[10px] tracking-widest text-stone-500 font-bold border-b border-stone-200">
                  RECEIPT PREVIEW
                </div>
                <div className="p-4 space-y-1 border-b border-dashed border-stone-300">
                  <p className="text-center font-bold text-sm text-stone-900">YOUR SHOP NAME</p>
                  <p className="text-center text-stone-500">Dar es Salaam, Tanzania</p>
                  <p className="text-center text-stone-500">Tel: +255 7XX XXX XXX</p>
                </div>
                <div className="p-4 space-y-1 border-b border-dashed border-stone-300">
                  <p className="text-center font-bold text-stone-800">TIN: 100-XXX-XXX</p>
                  <p className="text-center text-stone-500">VRN: 40-XXXXXX-A</p>
                </div>
                <div className="p-4 space-y-1 border-b border-dashed border-stone-300 text-stone-700">
                  <div className="flex justify-between"><span>Date:</span><span>24/07/2026</span></div>
                  <div className="flex justify-between"><span>Time:</span><span>10:15:44</span></div>
                  <div className="flex justify-between font-bold"><span>Receipt:</span><span>RCP-0248</span></div>
                </div>
                <div className="p-4 space-y-1">
                  <div className="flex justify-between text-stone-400 text-[8px] mb-2">
                    <span>ITEM</span><span>TC</span><span>AMOUNT</span>
                  </div>
                  <div className="flex justify-between text-stone-700">
                    <span className="flex-1">Samsung Earphones</span><span className="w-6 text-center">A</span><span>45,000</span>
                  </div>
                  <div className="flex justify-between text-stone-700">
                    <span className="flex-1">Maize Flour 2kg</span><span className="w-6 text-center">E</span><span>9,600</span>
                  </div>
                  <div className="border-t border-dashed border-stone-300 mt-2 pt-2">
                    <div className="flex justify-between font-bold text-sm text-stone-900"><span>TOTAL</span><span>TZS 54,600</span></div>
                    <div className="flex justify-between text-stone-500 text-[8px] mt-1"><span>M-Pesa</span><span>54,600</span></div>
                  </div>
                </div>
                <div className="p-3 text-center text-[8px] text-stone-500 space-y-0.5 border-t border-stone-200">
                  <p className="font-bold text-stone-700">ASANTE KWA KUNUNUA!</p>
                  <p>Powered by MauzoHalisi</p>
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
            <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: '#a66624' }}>Pricing</p>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Plans for every stage of growth</h2>
            <p className="text-stone-500 max-w-lg mx-auto">Start free. Upgrade when you are ready. No setup fees and no hidden charges.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 items-start">
            {PLANS.map(({ name, price, period, desc, highlight, features }) => (
              <div key={name} className={`relative rounded-2xl p-6 flex flex-col ${highlight ? 'scale-105' : ''}`}
                style={highlight
                  ? { background: 'linear-gradient(145deg,#434343,#1a1a1a)', boxShadow: '8px 8px 20px #c5cad3, -8px -8px 20px #ffffff', borderRadius: '1rem' }
                  : neu.card}>
                {highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="inline-flex items-center gap-1 text-white text-[10px] font-bold px-3 py-1 rounded-full"
                      style={{ background: '#a66624' }}>
                      <Star size={10} className="fill-white" /> Most Popular
                    </span>
                  </div>
                )}
                <div className="mb-5">
                  <p className="text-xs font-bold uppercase tracking-widest mb-2"
                    style={{ color: highlight ? '#fbbf24' : '#a66624' }}>{name}</p>
                  <div className="flex items-baseline gap-1 mb-1">
                    <span className={`text-2xl font-bold ${highlight ? 'text-white' : 'text-stone-900'}`}>{price}</span>
                    <span className="text-xs text-stone-400">{period}</span>
                  </div>
                  <p className={`text-xs leading-snug ${highlight ? 'text-stone-400' : 'text-stone-500'}`}>{desc}</p>
                </div>
                <ul className="space-y-2.5 flex-1 mb-6">
                  {features.map(f => (
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
                  {name === 'Enterprise' ? 'Contact Us' : 'Get Started'}
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
              <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: '#a66624' }}>Install on Android</p>
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">Take MauzoHalisi with you.<br/>Install it like an app.</h2>
              <p className="text-stone-500 leading-relaxed mb-8">
                No Play Store, no APK files. Open the link in Chrome, tap <strong>"Add to Home Screen"</strong>,
                and it installs in seconds. Full screen, fast, and always up to date.
              </p>
              <ul className="space-y-3 mb-10">
                {[
                  'Full POS: sell, collect payment, and print receipts',
                  'Real-time stock and inventory updates',
                  'Sales dashboard, reports, and customer management',
                  'Works on any Android phone or tablet',
                  'Updates automatically with no manual installs',
                ].map(item => (
                  <li key={item} className="flex items-start gap-2.5 text-sm text-stone-600">
                    <Check size={14} className="text-emerald-600 mt-0.5 shrink-0" />{item}
                  </li>
                ))}
              </ul>
              <div className="p-5 rounded-2xl" style={neu.card}>
                <p className="text-xs font-semibold uppercase tracking-widest text-stone-400 mb-4">How to install</p>
                <div className="space-y-3">
                  {[
                    'Open Chrome and go to the MauzoHalisi link',
                    'Tap the three-dot menu in the top-right corner',
                    'Tap "Add to Home screen" then "Add"',
                    'The MauzoHalisi icon will appear on your home screen',
                  ].map((text, i) => (
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
                    <p className="text-[9px] uppercase tracking-widest text-stone-400">Sales Today</p>
                    <p className="text-xl font-bold mt-0.5 text-stone-900">485,200<span className="text-xs font-normal text-stone-400 ml-1">TZS</span></p>
                    <p className="text-[9px] text-emerald-600 mt-0.5">up 12% from yesterday</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2.5 rounded-xl" style={neu.card}>
                      <p className="text-[8px] text-stone-400">Transactions</p>
                      <p className="text-sm font-bold text-stone-900">47</p>
                    </div>
                    <div className="p-2.5 rounded-xl" style={neu.card}>
                      <p className="text-[8px] text-stone-400">Items Sold</p>
                      <p className="text-sm font-bold text-stone-900">312</p>
                    </div>
                  </div>
                  <div className="p-2 rounded-xl text-center" style={neu.inset}>
                    <p className="text-[9px] font-bold text-emerald-600">Installed as App</p>
                  </div>
                  <div className="space-y-1.5">
                    {[
                      { name: 'Samsung Earphones', price: '45,000/=' },
                      { name: 'Maize Flour 2kg',   price: '3,200/='  },
                      { name: 'Cooking Oil 1L',    price: '4,300/='  },
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
              <TrendingUp size={12} /> Join businesses across Tanzania
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Ready to grow your business?</h2>
            <p className="text-stone-500 mb-8 text-lg">
              Start your free 30-day trial today. No credit card and no setup fees required.
            </p>
            <div className="flex flex-wrap justify-center gap-4 mb-8">
              <Link to="/register" className="btn-primary py-3.5 px-8">Create Free Account <ArrowRight size={16} /></Link>
              <Link to="/login" className="btn-secondary py-3.5 px-8">Sign In</Link>
            </div>
            <div className="flex flex-wrap justify-center gap-6 text-xs text-stone-400">
              {['30-day free trial', 'No credit card', 'Cancel anytime', 'Auto receipts'].map(t => (
                <span key={t} className="flex items-center gap-1.5"><Check size={11} className="text-emerald-500" />{t}</span>
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
                One platform for any type of business. Manage stock, sales, staff, and customers all in one place.
              </p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-stone-700 mb-4">Product</p>
              <ul className="space-y-2.5">
                {[['Features','#features'],['Pricing','#pricing'],['Install App','#install']].map(([l,h]) => (
                  <li key={l}><a href={h} className="text-sm text-stone-500 hover:text-stone-900 transition-colors">{l}</a></li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-stone-700 mb-4">Industries</p>
              <ul className="space-y-2.5">
                {['Retail & Wholesale','Pharmacy & Clinic','Restaurant & Café','Salon & Spa'].map(l => (
                  <li key={l}><a href="#" className="text-sm text-stone-500 hover:text-stone-900 transition-colors">{l}</a></li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-stone-700 mb-4">Company</p>
              <ul className="space-y-2.5">
                {([['About','/about'],['Contact','/contact'],['Privacy Policy','/privacy'],['Terms of Service','/terms']] as const).map(([l, to]) => (
                  <li key={to}>
                    <Link to={to} className="text-sm text-stone-500 hover:text-stone-900 transition-colors">{l}</Link>
                  </li>
                ))}
              </ul>
              <div className="mt-5">
                <p className="text-xs text-stone-400 mb-1">Reach us</p>
                <p className="text-sm text-stone-700">info@mauzohalisi.com</p>
              </div>
            </div>
          </div>
          <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-stone-200/60">
            <p className="text-xs text-stone-400">© 2026 MauzoHalisi. All rights reserved.</p>
          </div>
        </div>
      </footer>

    </div>
  );
}
