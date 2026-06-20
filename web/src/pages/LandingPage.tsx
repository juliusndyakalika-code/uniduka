import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ShoppingCart, Package, Users, BarChart2, Shield, Zap, Globe,
  Receipt, Star, ChevronRight, Check, ArrowRight, Menu, X,
  Smartphone, Printer, TrendingUp, Clock, Lock, RefreshCw,
  ShoppingBag, Utensils, Stethoscope, Scissors, Wrench, Hotel,
  Wine, Layers,
} from 'lucide-react';

// ── Helpers ────────────────────────────────────────────────────────────────
function useScrollY() {
  const [y, setY] = useState(0);
  useEffect(() => {
    const handler = () => setY(window.scrollY);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);
  return y;
}

// ── Data ───────────────────────────────────────────────────────────────────
const BUSINESS_TYPES = [
  { icon: ShoppingBag,  label: 'Retail Store',         desc: 'General merchandise & fashion' },
  { icon: Layers,       label: 'Wholesale / B2B',       desc: 'Bulk supply & distribution' },
  { icon: ShoppingCart, label: 'Grocery & Supermarket', desc: 'FMCG & fresh produce' },
  { icon: Stethoscope,  label: 'Pharmacy & Clinic',     desc: 'Medicine, Rx tracking, prescriptions' },
  { icon: Utensils,     label: 'Restaurant & Café',     desc: 'Table orders, KDS, menu mgmt' },
  { icon: Wine,         label: 'Bar & Nightclub',       desc: 'Tab tracking & liquor inventory' },
  { icon: Scissors,     label: 'Salon & Spa',           desc: 'Appointments & service booking' },
  { icon: Wrench,       label: 'Repair Workshop',       desc: 'Job cards & parts inventory' },
  { icon: Hotel,        label: 'Hotel & Guesthouse',    desc: 'Room management & F&B' },
];

const FEATURES = [
  {
    icon: ShoppingCart,
    title: 'Point of Sale',
    desc: 'Fast, intuitive POS built for every business type. Accept cash, M-Pesa, or card. Print receipts instantly.',
    color: 'bg-primary-50 text-primary-700',
  },
  {
    icon: Package,
    title: 'Smart Inventory',
    desc: 'Real-time stock tracking with weighted average cost pricing. Box-quantity entry, reorder alerts, and bulk CSV import.',
    color: 'bg-duka-50 text-duka-700',
  },
  {
    icon: Users,
    title: 'Customer CRM',
    desc: 'Build loyalty with customer profiles, purchase history, and a built-in loyalty points programme that keeps them coming back.',
    color: 'bg-amber-50 text-amber-700',
  },
  {
    icon: BarChart2,
    title: 'Sales Reports',
    desc: 'Revenue analytics by day, week, or month. Payment method breakdown, top products, and gross profit—all in one view.',
    color: 'bg-emerald-50 text-emerald-700',
  },
  {
    icon: Receipt,
    title: 'Auto Receipts',
    desc: 'Every sale auto-generates a receipt with your shop name, TIN, VRN, itemised totals, and payment details. No extra setup.',
    color: 'bg-blue-50 text-blue-700',
  },
  {
    icon: Globe,
    title: 'Multi-Branch',
    desc: 'Manage all your shops from one account. Switch branches in seconds. Staff see only what they need.',
    color: 'bg-purple-50 text-purple-700',
  },
  {
    icon: Smartphone,
    title: 'Install on Android',
    desc: 'Install MauzoSmart directly from Chrome — no Play Store needed. Works like a native app with full POS, inventory, and dashboard.',
    color: 'bg-rose-50 text-rose-700',
  },
  {
    icon: Shield,
    title: 'Role-Based Access',
    desc: 'Account Owner, Cashier, Inventory Staff — each role sees exactly what they need, nothing more.',
    color: 'bg-stone-100 text-stone-700',
  },
];

const PLANS = [
  {
    name: 'Starter',
    price: 'Free',
    period: '30-day trial',
    description: 'Perfect for new businesses getting started.',
    highlight: false,
    features: ['1 shop', '1 user', 'POS & inventory', 'Auto receipts', 'Basic reports', 'Email support'],
  },
  {
    name: 'Growth',
    price: 'TZS 49,000',
    period: '/month',
    description: 'For growing businesses with more needs.',
    highlight: false,
    features: ['Up to 3 shops', 'Up to 10 users', 'Everything in Starter', 'Loyalty programme', 'Appointments', 'CRM & customers'],
  },
  {
    name: 'Business',
    price: 'TZS 99,000',
    period: '/month',
    description: 'Full power for established businesses.',
    highlight: true,
    features: ['Up to 10 shops', 'Unlimited users', 'Everything in Growth', 'Staff reports', 'Purchase orders', 'KDS for restaurants', 'Priority support'],
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: 'contact us',
    description: 'For large chains and franchise networks.',
    highlight: false,
    features: ['Unlimited shops', 'Unlimited users', 'Everything in Business', 'Dedicated account manager', 'Custom integrations', 'SLA guarantee'],
  },
];

const STATS = [
  { value: '11', label: 'Business types supported' },
  { value: '100%', label: 'Auto-generated receipts' },
  { value: '30s', label: 'Average checkout time' },
  { value: '24/7', label: 'Uptime monitoring' },
];

const HOW_IT_WORKS = [
  {
    step: '01',
    title: 'Register your business',
    desc: 'Sign up in minutes. Select your business type and MauzoSmart automatically configures the right modules, tax settings, and inventory model for you.',
  },
  {
    step: '02',
    title: 'Set up your shop',
    desc: 'Add your products, set prices, and configure your TIN/VRN. Import existing stock via CSV or enter it manually. Your team is onboarded in under an hour.',
  },
  {
    step: '03',
    title: 'Start selling',
    desc: 'Open the POS and begin. Every sale updates stock in real time, feeds into your reports, and prints a receipt automatically.',
  },
];

// ── Components ─────────────────────────────────────────────────────────────

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <svg width="28" height="28" viewBox="0 0 40 40" fill="none" aria-hidden="true">
        <rect width="40" height="40" rx="9" fill="#a66624"/>
        <rect x="6" y="27" width="7" height="9" rx="1.5" fill="white" opacity="0.6"/>
        <rect x="16.5" y="21" width="7" height="15" rx="1.5" fill="white" opacity="0.8"/>
        <rect x="27" y="14" width="7" height="22" rx="1.5" fill="white"/>
        <path d="M30.5 11 L30.5 6 M27.5 8.5 L30.5 5.5 L33.5 8.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      <span className="text-lg font-bold tracking-tight text-stone-900">
        Mauzo<span className="font-light text-primary-600">Smart</span>
      </span>
    </div>
  );
}

/* Minimal fake POS mockup for hero */
function PosMockup() {
  return (
    <div className="relative w-full max-w-lg mx-auto">
      {/* Glow behind */}
      <div className="absolute inset-0 scale-95 translate-y-4 bg-primary-600/10 rounded-2xl blur-2xl" />

      <div className="relative bg-white rounded-2xl border border-stone-200 shadow-2xl overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-3 bg-stone-900 text-white">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-red-400"/>
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-400"/>
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400"/>
          </div>
          <span className="text-xs font-medium tracking-widest opacity-60">UNIDUKA POS</span>
          <div className="text-xs opacity-40">Duka ya Mwanga</div>
        </div>

        <div className="flex h-64">
          {/* Product grid */}
          <div className="flex-1 p-3 grid grid-cols-3 gap-2 content-start">
            {[
              { name: 'Amoxicillin 500mg', price: '500', qty: '100 tab', color: 'bg-blue-50 border-blue-200' },
              { name: 'Paracetamol 500mg', price: '200', qty: '200 tab', color: 'bg-emerald-50 border-emerald-200' },
              { name: 'Vitamin C 1000mg', price: '1,500', qty: '60 tab', color: 'bg-amber-50 border-amber-200', active: true },
              { name: 'ORS Sachets', price: '300', qty: '50 pcs', color: 'bg-purple-50 border-purple-200' },
              { name: 'Bandage Roll', price: '800', qty: '20 pcs', color: 'bg-rose-50 border-rose-200' },
              { name: 'Gloves Box', price: '8,500', qty: '5 box', color: 'bg-stone-50 border-stone-200' },
            ].map((p, i) => (
              <div key={i} className={`border rounded-lg p-2 cursor-pointer ${p.color} ${p.active ? 'ring-2 ring-primary-500' : ''}`}>
                <p className="text-[9px] font-semibold text-stone-800 leading-tight line-clamp-2">{p.name}</p>
                <p className="text-[10px] font-bold text-primary-700 mt-1">{p.price}/=</p>
                <p className="text-[8px] text-stone-400">{p.qty}</p>
              </div>
            ))}
          </div>

          {/* Cart panel */}
          <div className="w-40 border-l border-stone-100 flex flex-col bg-stone-50">
            <div className="px-3 py-2 border-b border-stone-100">
              <p className="text-[10px] font-bold text-stone-700 uppercase tracking-widest">Cart (2)</p>
            </div>
            <div className="flex-1 px-3 py-2 space-y-2">
              {[
                { name: 'Vitamin C 1000mg', qty: 3, total: '4,500' },
                { name: 'ORS Sachets', qty: 2, total: '600' },
              ].map((item, i) => (
                <div key={i} className="bg-white rounded p-1.5 border border-stone-200">
                  <p className="text-[8px] font-medium text-stone-800 leading-tight">{item.name}</p>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[8px] bg-primary-100 text-primary-700 px-1 rounded">×{item.qty}</span>
                    <span className="text-[9px] font-bold text-stone-900">{item.total}/=</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-3 py-2 bg-primary-600 text-white">
              <div className="flex justify-between text-[9px] mb-1">
                <span className="opacity-80">TOTAL</span>
                <span className="font-bold">5,100/=</span>
              </div>
              <div className="w-full bg-white/20 rounded text-center py-1 text-[9px] font-bold">
                Charge →
              </div>
            </div>
          </div>
        </div>

        {/* Status bar */}
        <div className="flex items-center gap-4 px-4 py-2 bg-stone-50 border-t border-stone-100">
          <span className="text-[9px] text-emerald-600 font-semibold flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full inline-block"/>
            Online
          </span>
          <span className="text-[9px] text-stone-400">TIN: 100-234-567</span>
          <span className="text-[9px] text-stone-400 ml-auto">19/05/2026  09:41:22</span>
        </div>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────
export default function LandingPage() {
  const scrollY = useScrollY();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#fafaf9] text-stone-900 overflow-x-hidden">

      {/* ── Navbar ─────────────────────────────────────────────────────── */}
      <header className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
        scrollY > 20 ? 'bg-white/95 backdrop-blur border-b border-stone-200 shadow-sm' : 'bg-transparent'
      }`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Logo />

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-8">
            {['Features', 'Who It\'s For', 'Pricing', 'Install App'].map(item => (
              <a key={item} href={`#${item.toLowerCase().replace(/[^a-z]/g, '-')}`}
                className="text-sm text-stone-600 hover:text-stone-900 transition-colors">
                {item}
              </a>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-3">
            <Link to="/login"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-stone-700 border border-stone-400 px-5 py-2 rounded-sm hover:border-stone-900 hover:text-stone-900 hover:bg-stone-50 transition-colors">
              Sign In
            </Link>
            <Link to="/register"
              className="btn-primary py-2 px-5 text-[11px]">
              Start Free Trial
            </Link>
          </div>

          {/* Mobile: Sign In always visible + hamburger */}
          <div className="md:hidden flex items-center gap-2">
            <Link to="/login"
              className="inline-flex items-center text-sm font-bold text-white bg-primary-600 hover:bg-primary-700 px-4 py-2 rounded-sm transition-colors">
              Sign In
            </Link>
            <button className="p-2 text-stone-600" onClick={() => setMobileOpen(o => !o)}>
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="md:hidden bg-white border-t border-stone-200 px-4 py-5 space-y-4">
            {['Features', 'Who It\'s For', 'Pricing', 'Install App'].map(item => (
              <a key={item} href={`#${item.toLowerCase().replace(/[^a-z]/g, '-')}`}
                onClick={() => setMobileOpen(false)}
                className="block text-sm font-medium text-stone-700 py-1">
                {item}
              </a>
            ))}
            <div className="pt-2 flex flex-col gap-3">
              <Link to="/login" className="btn-secondary py-2.5 text-center" onClick={() => setMobileOpen(false)}>Sign In</Link>
              <Link to="/register" className="btn-primary py-2.5 text-center" onClick={() => setMobileOpen(false)}>Start Free Trial</Link>
            </div>
          </div>
        )}
      </header>

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="relative pt-32 pb-20 lg:pt-40 lg:pb-28 overflow-hidden">
        {/* Warm gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#fdf6ed] via-[#fafaf9] to-[#f0fdfa] pointer-events-none" />
        {/* Decorative circles */}
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-primary-100/40 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -left-20 w-80 h-80 rounded-full bg-duka-100/30 blur-3xl pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:grid lg:grid-cols-2 lg:gap-16 items-center">

            {/* Left copy */}
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary-100 text-primary-700 text-xs font-semibold mb-6 border border-primary-200">
                <Zap size={12} className="fill-primary-600" />
                Built for East African businesses
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.1] tracking-tight mb-6">
                Run your business
                <span className="block text-primary-600">smarter, faster</span>
                <span className="block text-stone-400 font-light">every single day.</span>
              </h1>

              <p className="text-lg text-stone-500 leading-relaxed mb-8 max-w-lg">
                MauzoSmart is the all-in-one business management platform for retail, restaurants, pharmacies, salons, and more —
                with built-in TRA compliance, real-time inventory, and Android POS.
              </p>

              <div className="flex flex-wrap gap-3 mb-5">
                <Link to="/register"
                  className="inline-flex items-center gap-2 bg-stone-900 text-white text-sm font-semibold px-7 py-3.5 rounded-sm hover:bg-stone-800 transition-colors shadow-sm">
                  Start Free Trial <ArrowRight size={16} />
                </Link>
                <Link to="/login"
                  className="inline-flex items-center gap-2 bg-primary-600 text-white text-sm font-semibold px-7 py-3.5 rounded-sm hover:bg-primary-700 transition-colors shadow-sm">
                  Sign In <ArrowRight size={16} />
                </Link>
              </div>
              <p className="text-xs text-stone-400 mb-8">
                New here?{' '}
                <a href="#features" className="underline hover:text-stone-600 transition-colors">See what MauzoSmart can do →</a>
              </p>

              {/* Trust signals */}
              <div className="flex flex-wrap items-center gap-6 text-xs text-stone-500">
                {[
                  { icon: Check, text: '30-day free trial' },
                  { icon: Lock, text: 'No credit card required' },
                  { icon: RefreshCw, text: 'Cancel anytime' },
                ].map(({ icon: Icon, text }) => (
                  <span key={text} className="flex items-center gap-1.5">
                    <Icon size={12} className="text-emerald-600" /> {text}
                  </span>
                ))}
              </div>
            </div>

            {/* Right mockup */}
            <div className="mt-16 lg:mt-0">
              <PosMockup />
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats bar ──────────────────────────────────────────────────── */}
      <section className="bg-stone-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
            {STATS.map(({ value, label }) => (
              <div key={label} className="text-center">
                <p className="text-3xl font-bold text-primary-400 mb-1">{value}</p>
                <p className="text-sm text-stone-400">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ───────────────────────────────────────────────────── */}
      <section id="features" className="py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <p className="text-xs font-semibold tracking-widest text-primary-600 uppercase mb-3">Platform Features</p>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Everything your business needs</h2>
            <p className="text-stone-500 max-w-xl mx-auto">
              One platform, configured automatically for your business type.
              No plugins, no complicated setup — just what you need, ready to go.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {FEATURES.map(({ icon: Icon, title, desc, color }) => (
              <div key={title}
                className="bg-white border border-stone-200 rounded-xl p-6 hover:border-stone-300 hover:shadow-sm transition-all group">
                <div className={`w-10 h-10 rounded-lg ${color} flex items-center justify-center mb-4`}>
                  <Icon size={18} />
                </div>
                <h3 className="text-sm font-bold text-stone-900 mb-2">{title}</h3>
                <p className="text-xs text-stone-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Who It's For ───────────────────────────────────────────────── */}
      <section id="who-it-s-for" className="py-24 bg-stone-50 border-y border-stone-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <p className="text-xs font-semibold tracking-widest text-primary-600 uppercase mb-3">Business Types</p>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Built for your industry</h2>
            <p className="text-stone-500 max-w-xl mx-auto">
              Select your business type during registration and MauzoSmart auto-configures
              modules, tax modes, units, and workflows — no manual setup needed.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 gap-4">
            {BUSINESS_TYPES.map(({ icon: Icon, label, desc }) => (
              <div key={label}
                className="bg-white border border-stone-200 rounded-xl p-5 flex items-start gap-4 hover:border-primary-300 hover:bg-primary-50/30 transition-all group">
                <div className="w-9 h-9 rounded-lg bg-primary-100 text-primary-700 flex items-center justify-center flex-shrink-0 group-hover:bg-primary-200 transition-colors">
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

      {/* ── How it works ───────────────────────────────────────────────── */}
      <section className="py-24">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <p className="text-xs font-semibold tracking-widest text-primary-600 uppercase mb-3">Get Started</p>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Up and running in minutes</h2>
            <p className="text-stone-500 max-w-lg mx-auto">
              No training required. No implementation consultant needed. Just sign up and sell.
            </p>
          </div>

          <div className="relative">
            {/* Connector line */}
            <div className="hidden lg:block absolute top-8 left-[calc(16.67%+24px)] right-[calc(16.67%+24px)] h-px bg-stone-200" />

            <div className="grid lg:grid-cols-3 gap-10">
              {HOW_IT_WORKS.map(({ step, title, desc }) => (
                <div key={step} className="relative text-center lg:text-left">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-stone-900 text-white text-sm font-bold mb-5 lg:mb-4 relative z-10">
                    {step}
                  </div>
                  <h3 className="text-base font-bold text-stone-900 mb-2">{title}</h3>
                  <p className="text-sm text-stone-500 leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Receipt highlight ────────────────────────────────────────── */}
      <section className="py-20 bg-gradient-to-r from-primary-600 to-primary-700 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:grid lg:grid-cols-2 lg:gap-16 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-white/90 text-xs font-semibold mb-6 border border-white/20">
                <Printer size={12} /> Automatic Receipts
              </div>
              <h2 className="text-3xl font-bold mb-4">Receipts generated automatically on every sale.</h2>
              <p className="text-white/80 leading-relaxed mb-6">
                Every sale through MauzoSmart auto-generates a receipt with your shop details, TIN, VRN,
                itemised products, tax breakdown, and payment summary. Print or share instantly — no extra setup.
              </p>
              <ul className="space-y-3">
                {[
                  'Shop name, address & phone on every receipt',
                  'TIN & VRN printed when configured',
                  'Tax codes: A (18% VAT) · C (Zero-rated) · E (Exempt)',
                  'Customer TIN field for B2B invoices',
                  'Date, time & unique receipt number on every sale',
                ].map(item => (
                  <li key={item} className="flex items-start gap-2.5 text-sm text-white/90">
                    <Check size={15} className="text-emerald-300 mt-0.5 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Receipt preview */}
            <div className="mt-12 lg:mt-0 flex justify-center">
              <div className="bg-white text-stone-900 rounded-xl shadow-2xl w-64 font-mono text-[10px] overflow-hidden">
                <div className="bg-stone-900 text-white text-center py-2 text-[10px] tracking-widest">
                  RECEIPT PREVIEW
                </div>
                <div className="p-4 space-y-1 border-b border-dashed border-stone-300">
                  <p className="text-center font-bold text-sm">DUKA YA MWANGA</p>
                  <p className="text-center text-stone-500">Kariakoo, Dar es Salaam</p>
                  <p className="text-center text-stone-500">Tel: +255 712 345 678</p>
                </div>
                <div className="p-4 space-y-1 border-b border-dashed border-stone-300">
                  <p className="text-center font-bold">TIN: 100-234-567</p>
                  <p className="text-center text-stone-500">VRN: 40-123456-A</p>
                </div>
                <div className="p-4 space-y-1 border-b border-dashed border-stone-300 text-stone-700">
                  <div className="flex justify-between"><span>Date:</span><span>19/05/2026</span></div>
                  <div className="flex justify-between"><span>Time:</span><span>14:30:22</span></div>
                  <div className="flex justify-between font-bold"><span>Receipt:</span><span>RCP-0001</span></div>
                </div>
                <div className="p-4 space-y-1">
                  <div className="flex justify-between text-stone-500 text-[9px] mb-2">
                    <span>ITEM</span><span>TC</span><span>AMOUNT</span>
                  </div>
                  <div className="flex justify-between"><span className="flex-1">Amoxicillin 500mg</span><span className="w-6 text-center">A</span><span>2,500</span></div>
                  <div className="flex justify-between"><span className="flex-1">Paracetamol 500mg</span><span className="w-6 text-center">A</span><span>1,000</span></div>
                  <div className="border-t border-dashed border-stone-300 mt-2 pt-2">
                    <div className="flex justify-between font-bold text-sm"><span>TOTAL</span><span>TZS 3,500</span></div>
                  </div>
                </div>
                <div className="p-3 bg-stone-50 border-t border-stone-200 text-center text-[8px] text-stone-500 space-y-0.5">
                  <p className="font-bold text-stone-700">ASANTE KWA KUNUNUA!</p>
                  <p>Powered by MauzoSmart</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Pricing ────────────────────────────────────────────────────── */}
      <section id="pricing" className="py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <p className="text-xs font-semibold tracking-widest text-primary-600 uppercase mb-3">Pricing</p>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Plans for every stage of growth</h2>
            <p className="text-stone-500 max-w-lg mx-auto">
              Start free. Upgrade as you grow. No setup fees, no hidden charges.
              All plans include automatic receipts.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {PLANS.map(({ name, price, period, description, highlight, features }) => (
              <div key={name} className={`relative rounded-xl border p-6 flex flex-col ${
                highlight
                  ? 'bg-stone-900 border-stone-900 text-white shadow-2xl scale-105'
                  : 'bg-white border-stone-200 hover:border-stone-300 hover:shadow-sm transition-all'
              }`}>
                {highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="inline-flex items-center gap-1 bg-primary-500 text-white text-[10px] font-bold px-3 py-1 rounded-full">
                      <Star size={10} className="fill-white" /> Most Popular
                    </span>
                  </div>
                )}

                <div className="mb-5">
                  <p className={`text-xs font-bold uppercase tracking-widest mb-2 ${highlight ? 'text-primary-400' : 'text-primary-600'}`}>
                    {name}
                  </p>
                  <div className="flex items-baseline gap-1 mb-1">
                    <span className={`text-2xl font-bold ${highlight ? 'text-white' : 'text-stone-900'}`}>{price}</span>
                    <span className={`text-xs ${highlight ? 'text-stone-400' : 'text-stone-400'}`}>{period}</span>
                  </div>
                  <p className={`text-xs leading-snug ${highlight ? 'text-stone-400' : 'text-stone-500'}`}>{description}</p>
                </div>

                <ul className="space-y-2.5 flex-1 mb-6">
                  {features.map(f => (
                    <li key={f} className="flex items-start gap-2">
                      <Check size={13} className={`mt-0.5 flex-shrink-0 ${highlight ? 'text-primary-400' : 'text-emerald-600'}`} />
                      <span className={`text-xs ${highlight ? 'text-stone-300' : 'text-stone-600'}`}>{f}</span>
                    </li>
                  ))}
                </ul>

                <Link to="/register"
                  className={`block text-center text-xs font-bold uppercase tracking-widest py-2.5 rounded-sm transition-colors ${
                    highlight
                      ? 'bg-primary-600 text-white hover:bg-primary-500'
                      : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                  }`}>
                  {name === 'Enterprise' ? 'Contact Us' : 'Get Started'}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Install on Android ─────────────────────────────────────────── */}
      <section id="android-app" className="py-24 bg-stone-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:grid lg:grid-cols-2 lg:gap-16 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-white/90 text-xs font-semibold mb-6 border border-white/20">
                <Smartphone size={12} /> Install on Android
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">
                Take MauzoSmart with you.<br />Install it like an app.
              </h2>
              <p className="text-white/70 leading-relaxed mb-8">
                No Play Store, no APK downloads. Open MauzoSmart in Chrome, tap
                <strong className="text-white"> "Add to Home Screen"</strong>, and it installs instantly —
                full-screen, fast, and always up to date.
              </p>
              <ul className="space-y-3 mb-10">
                {[
                  'Full POS — sell, collect payment, print receipts',
                  'Real-time stock & inventory updates',
                  'Sales dashboard, reports, and consignment',
                  'Works on any Android phone or tablet',
                  'Always updated — no manual installs ever',
                ].map(item => (
                  <li key={item} className="flex items-start gap-2.5 text-sm text-white/80">
                    <Check size={15} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>

              {/* Install steps */}
              <div className="bg-white/5 border border-white/10 rounded-xl p-5 mb-6">
                <p className="text-xs font-semibold uppercase tracking-widest text-white/50 mb-4">How to install</p>
                <div className="space-y-3">
                  {[
                    { step: '1', text: 'Open Chrome and go to the MauzoSmart URL' },
                    { step: '2', text: 'Tap the three-dot menu ⋮ in the top-right corner' },
                    { step: '3', text: 'Tap "Add to Home screen" → "Add"' },
                    { step: '4', text: 'Done — MauzoSmart icon appears on your home screen' },
                  ].map(({ step, text }) => (
                    <div key={step} className="flex items-start gap-3">
                      <span className="w-6 h-6 rounded-full bg-primary-600 text-white text-xs font-bold flex items-center justify-center shrink-0">{step}</span>
                      <p className="text-sm text-white/70">{text}</p>
                    </div>
                  ))}
                </div>
              </div>

              <p className="text-xs text-white/30">Works on Chrome for Android 8.0+. No "unknown sources" setting needed.</p>
            </div>

            {/* Phone mockup */}
            <div className="mt-12 lg:mt-0 flex justify-center">
              <div className="relative">
                <div className="w-52 h-96 bg-stone-800 rounded-3xl border-2 border-stone-700 shadow-2xl flex flex-col overflow-hidden">
                  <div className="bg-stone-700 h-6 flex items-center justify-center">
                    <div className="w-16 h-1.5 bg-stone-600 rounded-full" />
                  </div>
                  <div className="flex-1 bg-stone-900 p-3 space-y-2">
                    <div className="bg-stone-800 rounded-lg p-3">
                      <p className="text-white/40 text-[9px] uppercase tracking-widest">Today's Sales</p>
                      <p className="text-white font-bold text-xl mt-0.5">TZS 247,500</p>
                      <p className="text-emerald-400 text-[10px] mt-0.5">↑ 12% from yesterday</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-stone-800 rounded-lg p-2.5">
                        <p className="text-white/40 text-[8px]">Transactions</p>
                        <p className="text-white font-bold text-sm">34</p>
                      </div>
                      <div className="bg-stone-800 rounded-lg p-2.5">
                        <p className="text-white/40 text-[8px]">Items Sold</p>
                        <p className="text-white font-bold text-sm">128</p>
                      </div>
                    </div>
                    <div className="bg-primary-600/30 border border-primary-500/30 rounded-lg p-2.5 text-center">
                      <p className="text-primary-300 font-bold text-xs">✓ Installed as App</p>
                    </div>
                    <div className="space-y-1.5">
                      {['Unga wa Dona 2kg', 'Mafuta ya Bia 1L', 'Sukari Kilo 1'].map(p => (
                        <div key={p} className="bg-stone-800 rounded p-2 flex justify-between items-center">
                          <p className="text-white/70 text-[9px]">{p}</p>
                          <p className="text-white text-[9px] font-bold">× 1</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-20 h-1.5 bg-stone-700 rounded-full" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Final CTA ──────────────────────────────────────────────────── */}
      <section className="py-24 bg-stone-50 border-t border-stone-200">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary-100 text-primary-700 text-xs font-semibold mb-6 border border-primary-200">
            <TrendingUp size={12} />
            Join businesses across Tanzania
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Ready to grow your business?
          </h2>
          <p className="text-stone-500 mb-8 text-lg">
            Start your 30-day free trial today. No credit card. No setup fees.
            Cancel anytime.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link to="/register"
              className="inline-flex items-center gap-2 bg-stone-900 text-white font-semibold px-8 py-4 rounded-sm hover:bg-stone-800 transition-colors shadow-sm">
              Create Free Account <ArrowRight size={18} />
            </Link>
            <Link to="/login"
              className="inline-flex items-center gap-2 bg-primary-600 text-white font-semibold px-8 py-4 rounded-sm hover:bg-primary-700 transition-colors shadow-sm">
              Sign In
            </Link>
          </div>
          <div className="flex flex-wrap justify-center gap-6 mt-8 text-xs text-stone-400">
            {['30-day free trial', 'No credit card', 'Cancel anytime', 'Auto receipts'].map(t => (
              <span key={t} className="flex items-center gap-1.5">
                <Check size={11} className="text-emerald-500" /> {t}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="bg-stone-900 text-stone-400 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-10">
            <div className="sm:col-span-2 lg:col-span-1">
              <div className="flex items-center gap-2.5 mb-4">
                <svg width="24" height="24" viewBox="0 0 40 40" fill="none">
                  <rect width="40" height="40" rx="9" fill="#a66624"/>
                  <rect x="6" y="27" width="7" height="9" rx="1.5" fill="white" opacity="0.6"/>
                  <rect x="16.5" y="21" width="7" height="15" rx="1.5" fill="white" opacity="0.8"/>
                  <rect x="27" y="14" width="7" height="22" rx="1.5" fill="white"/>
                  <path d="M30.5 11 L30.5 6 M27.5 8.5 L30.5 5.5 L33.5 8.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span className="text-white font-bold tracking-tight">
                  Mauzo<span className="font-light text-primary-500">Smart</span>
                </span>
              </div>
              <p className="text-sm leading-relaxed text-stone-500">
                The all-in-one business management platform built for East African businesses.
              </p>
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-stone-300 mb-4">Product</p>
              <ul className="space-y-2.5">
                {[
                  { label: 'Features', href: '#features' },
                  { label: 'Pricing', href: '#pricing' },
                  { label: 'Install App', href: '#android-app' },
                ].map(({ label, href }) => (
                  <li key={label}><a href={href} className="text-sm hover:text-white transition-colors">{label}</a></li>
                ))}
              </ul>
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-stone-300 mb-4">Industries</p>
              <ul className="space-y-2.5">
                {['Retail & Wholesale', 'Pharmacy & Clinic', 'Restaurant & Café', 'Salon & Spa'].map(l => (
                  <li key={l}><a href="#" className="text-sm hover:text-white transition-colors">{l}</a></li>
                ))}
              </ul>
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-stone-300 mb-4">Company</p>
              <ul className="space-y-2.5">
                {['About', 'Contact', 'Privacy Policy', 'Terms of Service'].map(l => (
                  <li key={l}><a href="#" className="text-sm hover:text-white transition-colors">{l}</a></li>
                ))}
              </ul>
              <div className="mt-5">
                <p className="text-xs text-stone-500 mb-1">Reach us</p>
                <p className="text-sm text-stone-300">info@mauzosmart.co.tz</p>
              </div>
            </div>
          </div>

          <div className="border-t border-stone-800 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-xs text-stone-600">© 2026 MauzoSmart. All rights reserved.</p>
            <p className="text-xs text-stone-600 flex items-center gap-1.5">
              <Printer size={11} /> Made in Tanzania
            </p>
          </div>
        </div>
      </footer>

    </div>
  );
}
