/**
 * Public shop storefront at /s/:slug — no auth, no app chrome.
 *
 * Laid out like a big marketplace, because that is what shoppers already know
 * how to use: a search bar that dominates the header, categories one tap
 * away, a banner, then a dense grid where the price is the loudest thing on
 * each card. Mobile-first: most shoppers arrive from a WhatsApp or Instagram
 * link on a phone, so the cart is a bottom sheet and a product opens as a
 * sheet rather than a new page.
 */
import { useState, useEffect, useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import {
  Search, ShoppingBag, ShoppingCart, Plus, Minus, X, MapPin, Phone, Store,
  CheckCircle2, Truck, Package, Loader2, AlertCircle, MessageCircle,
  Wallet, LayoutGrid, Flame, ChevronRight, ShieldCheck,
} from 'lucide-react';
import publicApi from '../../api/publicClient';
import { mediaUrl } from '../../lib/media';
import { buildOrderMessage, waLink } from '../../utils/whatsapp';
import { LogoMark } from '../../components/ui/Logo';
import { Price, ProductImage } from '../../components/storefront/shared';

interface Shop {
  slug: string; name: string; bio?: string; logoUrl?: string; bannerUrl?: string;
  phone?: string; whatsapp?: string; city?: string; region?: string; addressLine1?: string;
  currency: string; businessType: string;
  acceptsDelivery: boolean; acceptsPickup: boolean;
  deliveryFee: number; deliveryNote?: string; minOrderValue: number;
  categories: string[];
}
interface Product {
  id: string; name: string; description?: string; imageUrl?: string;
  category?: string; brand?: string; unit: string;
  price: number; inStock: boolean; lowStock: boolean;
}
interface Page { data: Product[]; meta: { total: number; page: number; pages: number } }
interface Placed {
  orderNo: string; status: string; total: number;
  subtotal: number; deliveryFee: number;
  fulfilment: 'DELIVERY' | 'PICKUP';
  placedAt: string; shopName: string; shopPhone?: string;
  shopWhatsapp?: string; currency?: string;
  buyerName: string; deliveryAddress?: string | null;
  items: { name: string; quantity: number; unitLabel: string; lineTotal: number }[];
}

type Line = { product: Product; qty: number };

function money(n: number, currency = 'TZS') {
  return new Intl.NumberFormat('sw-TZ', {
    style: 'currency', currency, currencyDisplay: 'code', maximumFractionDigits: 0,
  }).format(n);
}

function apiError(e: unknown, fallback: string) {
  return (e as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;
}

export default function StorefrontPage() {
  const { slug = '' } = useParams();

  const [query, setQuery]       = useState('');    // what is typed
  const [search, setSearch]     = useState('');    // what is searched
  const [category, setCategory] = useState('');
  const [cart, setCart]         = useState<Line[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkout, setCheckout] = useState(false);
  const [placed, setPlaced]     = useState<Placed | null>(null);
  const [viewing, setViewing]   = useState<Product | null>(null);
  const [viewQty, setViewQty]   = useState(1);

  // Checkout form
  const [name, setName]         = useState('');
  const [phone, setPhone]       = useState('');
  const [mode, setMode]         = useState<'DELIVERY' | 'PICKUP'>('DELIVERY');
  const [address, setAddress]   = useState('');
  const [note, setNote]         = useState('');
  const [submitting, setSubmit] = useState(false);
  const [error, setError]       = useState('');

  const { data: shop, isLoading, isError } = useQuery<Shop>({
    queryKey: ['storefront', slug],
    queryFn: () => publicApi.get(`/shops/${slug}`).then(r => r.data.data),
    retry: false,
  });

  // The unfiltered first page feeds the category tiles and the "few left"
  // row, so they stay put while the shopper searches or filters below.
  const { data: showcase = [] } = useQuery<Product[]>({
    queryKey: ['storefront-showcase', slug],
    queryFn: () => publicApi.get(`/shops/${slug}/products`, { params: { limit: 48 } }).then(r => r.data.data),
    enabled: !!shop,
    staleTime: 60_000,
  });

  const listing = useInfiniteQuery<Page>({
    queryKey: ['storefront-products', slug, search, category],
    queryFn: ({ pageParam }) => publicApi.get(`/shops/${slug}/products`, {
      params: { search: search || undefined, category: category || undefined, limit: 24, page: pageParam },
    }).then(r => r.data),
    initialPageParam: 1,
    getNextPageParam: last => (last.meta.page < last.meta.pages ? last.meta.page + 1 : undefined),
    enabled: !!shop,
    placeholderData: prev => prev,
  });
  const products = useMemo(() => listing.data?.pages.flatMap(p => p.data) ?? [], [listing.data]);
  const total = listing.data?.pages[0]?.meta.total ?? 0;

  // Arriving from the marketplace with ?product=<id>: open that product, so
  // the tap that brought the shopper here is not wasted.
  const [params, setParams] = useSearchParams();
  const linked = params.get('product');
  useEffect(() => {
    if (!shop || !linked) return;
    publicApi.get(`/shops/${slug}/products/${linked}`)
      .then(r => { setViewing(r.data.data); setViewQty(1); })
      .catch(() => { /* gone or unlisted: just show the store */ })
      .finally(() => setParams(p => { p.delete('product'); return p; }, { replace: true }));
  }, [shop, linked, slug, setParams]);

  // Search as you type, but only once typing pauses.
  useEffect(() => {
    const id = setTimeout(() => setSearch(query.trim()), 350);
    return () => clearTimeout(id);
  }, [query]);

  // Cart survives a refresh, scoped per shop so two storefronts don't collide.
  const cartKey = `ud_cart_${slug}`;
  useEffect(() => {
    try {
      const raw = localStorage.getItem(cartKey);
      if (raw) setCart(JSON.parse(raw));
    } catch { /* ignore corrupt cart */ }
  }, [cartKey]);
  useEffect(() => {
    try { localStorage.setItem(cartKey, JSON.stringify(cart)); } catch { /* quota */ }
  }, [cart, cartKey]);

  // Default the fulfilment mode to whatever the shop actually offers.
  useEffect(() => {
    if (shop && !shop.acceptsDelivery && shop.acceptsPickup) setMode('PICKUP');
  }, [shop]);

  // A product sheet or the cart open: the page behind should not scroll.
  useEffect(() => {
    document.body.style.overflow = viewing || cartOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [viewing, cartOpen]);

  const subtotal    = useMemo(() => cart.reduce((s, l) => s + l.product.price * l.qty, 0), [cart]);
  const itemCount   = useMemo(() => cart.reduce((s, l) => s + l.qty, 0), [cart]);
  const deliveryFee = mode === 'DELIVERY' && shop ? shop.deliveryFee : 0;
  const orderTotal  = subtotal + deliveryFee;
  const belowMin    = !!shop && shop.minOrderValue > 0 && subtotal < shop.minOrderValue;

  /** One picture per category for the round tiles: the first product with a photo. */
  const tiles = useMemo(() => (shop?.categories ?? []).map(c => ({
    name: c,
    product: showcase.find(p => p.category === c && p.imageUrl) ?? showcase.find(p => p.category === c),
  })), [shop?.categories, showcase]);
  const fewLeft = useMemo(() => showcase.filter(p => p.inStock && p.lowStock).slice(0, 12), [showcase]);

  function addToCart(p: Product, qty = 1) {
    setCart(c => {
      const found = c.find(l => l.product.id === p.id);
      if (found) return c.map(l => l.product.id === p.id ? { ...l, qty: l.qty + qty } : l);
      return [...c, { product: p, qty }];
    });
  }
  function setQty(id: string, qty: number) {
    setCart(c => qty <= 0 ? c.filter(l => l.product.id !== id)
                          : c.map(l => l.product.id === id ? { ...l, qty } : l));
  }
  function openProduct(p: Product) { setViewing(p); setViewQty(1); }
  function pickCategory(c: string) {
    setCategory(c);
    document.getElementById('all-products')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function submitOrder() {
    setError(''); setSubmit(true);
    try {
      const res = await publicApi.post(`/shops/${slug}/orders`, {
        buyerName: name,
        buyerPhone: phone,
        fulfilment: mode,
        deliveryAddress: mode === 'DELIVERY' ? address : undefined,
        note: note || undefined,
        items: cart.map(l => ({ productId: l.product.id, quantity: l.qty })),
      });
      setPlaced(res.data.data);
      setCart([]);
      setCheckout(false);
      setCartOpen(false);
    } catch (e) {
      setError(apiError(e, 'Could not place your order. Please try again.'));
    }
    setSubmit(false);
  }

  // ── States ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-screen grid place-items-center mh-ground">
        <Loader2 className="animate-spin text-stone-400" size={28} />
      </div>
    );
  }
  if (isError || !shop) {
    return (
      <div className="min-h-screen grid place-items-center mh-ground p-6 text-center">
        <div>
          <Store size={40} className="mx-auto mb-3 text-stone-300" />
          <h1 className="text-lg font-bold text-stone-800">Shop not found</h1>
          <p className="text-sm text-stone-500 mt-1">
            This storefront doesn't exist or isn't open right now.
          </p>
          <Link to="/shops" className="inline-flex items-center gap-1 mt-4 text-sm font-semibold text-primary-700">
            Browse other shops <ChevronRight size={14} />
          </Link>
        </div>
      </div>
    );
  }

  // Order confirmation replaces the page — nothing else matters at this point.
  if (placed) {
    const waHref = waLink(
      placed.shopWhatsapp ?? placed.shopPhone,
      buildOrderMessage({
        orderNo: placed.orderNo,
        buyerName: placed.buyerName,
        buyerPhone: phone,
        fulfilment: placed.fulfilment,
        deliveryAddress: placed.deliveryAddress,
        note: note || null,
        items: placed.items,
        subtotal: placed.subtotal,
        deliveryFee: placed.deliveryFee,
        total: placed.total,
        currency: placed.currency,
      }),
    );

    return (
      <div className="min-h-screen mh-ground grid place-items-center p-5">
        <div className="card p-7 max-w-sm w-full text-center">
          <CheckCircle2 size={44} className="mx-auto mb-3 text-emerald-500" />
          <h1 className="text-lg font-bold text-stone-900">Order placed</h1>
          <p className="text-sm text-stone-500 mt-1">
            {waHref
              ? `Send it to ${placed.shopName} on WhatsApp so they see it straight away.`
              : `${placed.shopName} will call you to confirm.`}
          </p>
          <div className="my-5 py-4 border-y border-stone-100 space-y-1">
            <p className="text-[11px] uppercase tracking-widest text-stone-400">Order number</p>
            <p className="font-mono font-bold text-stone-900">{placed.orderNo}</p>
            <p className="text-xl font-bold text-stone-900 pt-1">{money(placed.total, shop.currency)}</p>
            <p className="text-xs text-stone-500">Pay on {placed.fulfilment === 'PICKUP' ? 'pickup' : 'delivery'}</p>
          </div>

          {waHref && (
            <>
              <a href={waHref} target="_blank" rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-[#25D366] text-snow text-sm font-bold active:bg-[#1da851]">
                <MessageCircle size={16} /> Send to {placed.shopName}
              </a>
              <p className="text-[11px] text-stone-400 mt-2">
                Your order is saved either way. This just reaches them faster.
              </p>
            </>
          )}

          {placed.shopPhone && (
            <a href={`tel:${placed.shopPhone}`}
              className={`inline-flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-semibold ${
                waHref ? 'mt-2 border border-stone-200 text-stone-600' : 'mt-4 bg-stone-900 text-white'}`}>
              <Phone size={14} /> Call instead
            </a>
          )}
          <button onClick={() => setPlaced(null)}
            className="mt-2 w-full py-2.5 rounded-xl text-stone-500 text-sm font-semibold">
            Keep shopping
          </button>
        </div>
      </div>
    );
  }

  const location = [shop.addressLine1, shop.city].filter(Boolean).join(', ');
  const whatsappHref = waLink(shop.whatsapp ?? shop.phone, `Hello ${shop.name}, I saw your online shop.`);

  return (
    <div className="min-h-screen mh-ground pb-24">

      {/* ── Header: identity, the big search, the cart ─────────────────── */}
      <header className="sticky top-0 z-30 mh-ground mh-bar">
        <div className="max-w-6xl mx-auto px-3 sm:px-5 py-2.5 flex items-center gap-3">
          <div className="flex items-center gap-2 min-w-0 shrink-0 sm:max-w-[14rem]">
            <div className="w-9 h-9 rounded-lg bg-stone-100 overflow-hidden grid place-items-center shrink-0">
              {shop.logoUrl
                ? <img src={mediaUrl(shop.logoUrl)} alt="" className="w-full h-full object-cover" />
                : <Store size={18} className="text-primary-700" />}
            </div>
            <span className="hidden sm:block font-extrabold text-stone-900 truncate tracking-tight">{shop.name}</span>
          </div>

          <form className="flex-1 min-w-0" onSubmit={e => { e.preventDefault(); setSearch(query.trim()); }} role="search">
            <div className="flex items-stretch rounded-full border-2 border-primary-600 mh-ground overflow-hidden">
              <input
                className="flex-1 min-w-0 px-4 py-2 text-sm bg-transparent outline-none text-stone-900 placeholder:text-stone-400"
                placeholder={`Search in ${shop.name}`}
                value={query}
                onChange={e => setQuery(e.target.value)}
                aria-label={`Search in ${shop.name}`}
              />
              {query && (
                <button type="button" onClick={() => { setQuery(''); setSearch(''); }}
                  className="px-2 text-stone-400 hover:text-stone-700" aria-label="Clear search">
                  <X size={15} />
                </button>
              )}
              <button type="submit" className="px-4 sm:px-6 bg-primary-600 hover:bg-primary-700 text-snow grid place-items-center" aria-label="Search">
                <Search size={17} />
              </button>
            </div>
          </form>

          <button onClick={() => setCartOpen(true)} className="relative shrink-0 p-2 rounded-full hover:bg-stone-100 text-stone-800" aria-label={`Cart, ${itemCount} items`}>
            <ShoppingCart size={23} />
            {itemCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-snow text-[10px] font-bold grid place-items-center">
                {itemCount > 99 ? '99+' : itemCount}
              </span>
            )}
          </button>
        </div>

        {/* Category bar */}
        {shop.categories.length > 0 && (
          <nav className="max-w-6xl mx-auto px-3 sm:px-5 flex gap-5 overflow-x-auto text-[13px] scrollbar-none" aria-label="Categories">
            {['', ...shop.categories].map(c => (
              <button key={c || 'all'} onClick={() => pickCategory(c)}
                className={`py-2 whitespace-nowrap border-b-2 transition-colors ${
                  category === c ? 'border-primary-600 text-primary-700 font-bold' : 'border-transparent text-stone-600 hover:text-stone-900'}`}>
                {c || 'All'}
              </button>
            ))}
          </nav>
        )}
      </header>

      {/* ── Trust strip ──────────────────────────────────────────────────── */}
      <div className="mh-ground border-b border-stone-200/60">
        <div className="max-w-6xl mx-auto px-3 sm:px-5 py-2 flex gap-x-6 gap-y-1 overflow-x-auto text-[12px] text-stone-600 scrollbar-none">
          <span className="flex items-center gap-1.5 whitespace-nowrap"><Wallet size={13} className="text-primary-700" /> Pay on {shop.acceptsDelivery ? 'delivery' : 'pickup'}</span>
          {shop.acceptsDelivery && (
            <span className="flex items-center gap-1.5 whitespace-nowrap"><Truck size={13} className="text-primary-700" />
              {shop.deliveryFee > 0 ? `Delivery ${money(shop.deliveryFee, shop.currency)}` : 'Free delivery'}</span>
          )}
          {shop.acceptsPickup && <span className="flex items-center gap-1.5 whitespace-nowrap"><Package size={13} className="text-primary-700" /> Pickup from the shop</span>}
          {location && <span className="flex items-center gap-1.5 whitespace-nowrap"><MapPin size={13} className="text-primary-700" /> {location}</span>}
          {shop.minOrderValue > 0 && <span className="whitespace-nowrap">Min. order {money(shop.minOrderValue, shop.currency)}</span>}
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-3 sm:px-5 mt-4 space-y-5">

        {/* ── Hero: categories, banner, shop card ─────────────────────── */}
        <section className="grid gap-4 lg:grid-cols-[13rem_minmax(0,1fr)_15rem]">
          {shop.categories.length > 0 && (
            <div className="hidden lg:block card p-2">
              <p className="px-2 py-1.5 text-xs font-bold text-stone-900 flex items-center gap-1.5"><LayoutGrid size={13} /> Categories</p>
              <ul className="max-h-[15rem] overflow-y-auto">
                {shop.categories.map(c => (
                  <li key={c}>
                    <button onClick={() => pickCategory(c)}
                      className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-[13px] text-left ${
                        category === c ? 'bg-primary-50 text-primary-800 font-semibold' : 'text-stone-700 hover:bg-stone-100'}`}>
                      <span className="truncate">{c}</span><ChevronRight size={13} className="text-stone-300 shrink-0" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className={`relative rounded-xl overflow-hidden min-h-[9.5rem] sm:min-h-[15rem] ${shop.categories.length ? '' : 'lg:col-span-2'}`}>
            {shop.bannerUrl
              ? <img src={mediaUrl(shop.bannerUrl)} alt="" className="absolute inset-0 w-full h-full object-cover" />
              : (
                <div className="absolute inset-0 bg-gradient-to-br from-primary-500 via-primary-600 to-primary-800">
                  {/* A few product photos tilted on the banner, so it looks like this shop and not any shop. */}
                  <div className="absolute right-3 sm:right-8 top-1/2 -translate-y-1/2 flex gap-3 sm:gap-4">
                    {showcase.filter(p => p.imageUrl).slice(0, 2).map((p, i) => (
                      <div key={p.id} className={`w-16 h-16 sm:w-28 sm:h-28 rounded-xl overflow-hidden bg-snow shadow-lg ${i === 1 ? '-translate-y-3' : 'translate-y-2'}`}>
                        <ProductImage p={p} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            <div className="relative h-full p-4 sm:p-7 flex flex-col justify-center max-w-[58%] sm:max-w-[50%]">
              <p className="text-snow/90 text-[11px] sm:text-xs font-semibold uppercase tracking-widest">Welcome to</p>
              <h1 className="text-snow text-xl sm:text-3xl font-extrabold leading-tight mt-0.5 drop-shadow-sm">{shop.name}</h1>
              {shop.bio && <p className="text-snow/90 text-xs sm:text-sm mt-1.5 line-clamp-2">{shop.bio}</p>}
              <button onClick={() => document.getElementById('all-products')?.scrollIntoView({ behavior: 'smooth' })}
                className="mt-3 self-start px-4 py-1.5 rounded-full bg-snow text-primary-700 text-xs sm:text-sm font-bold shadow">
                Shop now
              </button>
            </div>
          </div>

          <aside className="hidden lg:flex flex-col card p-4 gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-11 h-11 rounded-full bg-primary-50 grid place-items-center overflow-hidden">
                {shop.logoUrl ? <img src={mediaUrl(shop.logoUrl)} alt="" className="w-full h-full object-cover" /> : <Store size={18} className="text-primary-700" />}
              </div>
              <div className="min-w-0">
                <p className="font-bold text-sm text-stone-900 truncate">{shop.name}</p>
                <p className="text-[11px] text-stone-500 truncate">{total} products</p>
              </div>
            </div>
            <ul className="text-[12px] text-stone-600 space-y-1.5">
              <li className="flex items-center gap-1.5"><ShieldCheck size={13} className="text-emerald-600" /> No payment until you receive it</li>
              <li className="flex items-center gap-1.5"><Phone size={13} className="text-emerald-600" /> The shop confirms every order</li>
            </ul>
            <div className="mt-auto space-y-2">
              {whatsappHref && (
                <a href={whatsappHref} target="_blank" rel="noreferrer"
                  className="flex items-center justify-center gap-1.5 w-full py-2 rounded-full bg-[#25D366] text-snow text-xs font-bold">
                  <MessageCircle size={14} /> Chat on WhatsApp
                </a>
              )}
              {shop.phone && (
                <a href={`tel:${shop.phone}`} className="flex items-center justify-center gap-1.5 w-full py-2 rounded-full border border-stone-200 text-stone-700 text-xs font-semibold">
                  <Phone size={13} /> Call the shop
                </a>
              )}
            </div>
          </aside>
        </section>

        {/* ── Round category tiles ───────────────────────────────────── */}
        {tiles.length > 1 && (
          <section className="card px-2 py-3">
            <div className="flex gap-1 sm:gap-3 overflow-x-auto scrollbar-none">
              {tiles.map(({ name: c, product }) => (
                <button key={c} onClick={() => pickCategory(c)} className="flex flex-col items-center gap-1.5 w-[4.6rem] sm:w-24 shrink-0">
                  <span className={`w-14 h-14 sm:w-[4.5rem] sm:h-[4.5rem] rounded-full overflow-hidden ring-2 ${category === c ? 'ring-primary-600' : 'ring-transparent'} bg-stone-100`}>
                    {product ? <ProductImage p={product} /> : null}
                  </span>
                  <span className={`text-[11px] leading-tight text-center line-clamp-2 ${category === c ? 'text-primary-700 font-bold' : 'text-stone-700'}`}>{c}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ── Few left: the marketplace "deals" row ──────────────────── */}
        {fewLeft.length > 0 && !search && !category && (
          <section className="card p-3">
            <h2 className="flex items-center gap-1.5 text-sm sm:text-base font-extrabold text-stone-900 mb-2.5">
              <Flame size={17} className="text-red-600" /> Few left, order now
            </h2>
            <div className="flex gap-3 overflow-x-auto scrollbar-none">
              {fewLeft.map(p => (
                <button key={p.id} onClick={() => openProduct(p)} className="w-28 sm:w-36 shrink-0 text-left">
                  <div className="relative aspect-square rounded-lg overflow-hidden">
                    <ProductImage p={p} />
                    <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-red-600 text-snow text-[10px] font-bold">Few left</span>
                  </div>
                  <div className="mt-1.5"><Price value={p.price} currency={shop.currency} /></div>
                  <p className="text-[11px] text-stone-600 truncate">{p.name}</p>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ── All products ───────────────────────────────────────────── */}
        <section id="all-products" className="scroll-mt-28">
          <div className="flex items-baseline justify-between gap-2 px-1 py-2">
            <h2 className="text-base sm:text-lg font-extrabold text-stone-900">
              {search ? `Results for “${search}”` : category || 'More to love'}
            </h2>
            {(search || category) && (
              <button onClick={() => { setQuery(''); setSearch(''); setCategory(''); }} className="text-xs font-semibold text-primary-700 shrink-0">
                Clear
              </button>
            )}
          </div>

          {listing.isLoading && products.length === 0 ? (
            <div className="py-16 grid place-items-center"><Loader2 className="animate-spin text-stone-300" size={22} /></div>
          ) : products.length === 0 ? (
            <div className="py-16 text-center card">
              <ShoppingBag size={32} className="mx-auto mb-2 text-stone-300" />
              <p className="text-sm text-stone-500">
                {search || category ? 'Nothing matches that search' : 'This shop has no items listed yet'}
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
                {products.map(p => {
                  const inCart = cart.find(l => l.product.id === p.id);
                  return (
                    <div key={p.id} className="group card-hover flex flex-col">
                      <button onClick={() => openProduct(p)} className="relative aspect-square overflow-hidden text-left" aria-label={`View ${p.name}`}>
                        <ProductImage p={p} className="group-hover:scale-[1.03] transition-transform duration-300" />
                        {!p.inStock && (
                          <span className="absolute inset-0 bg-white/70 grid place-items-center text-[11px] font-bold text-stone-500 uppercase tracking-wide">Out of stock</span>
                        )}
                        {p.inStock && p.lowStock && (
                          <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-red-600 text-snow text-[10px] font-bold">Few left</span>
                        )}
                      </button>
                      <div className="p-2 sm:p-2.5 flex flex-col flex-1">
                        <button onClick={() => openProduct(p)} className="text-left">
                          <p className="text-[12.5px] text-stone-800 line-clamp-2 leading-snug min-h-[2.2rem]">{p.name}</p>
                        </button>
                        <div className="mt-1 flex items-end justify-between gap-1">
                          <div className="min-w-0">
                            <Price value={p.price} currency={shop.currency} />
                            <p className="text-[10px] text-stone-400">per {p.unit}{p.brand ? ` · ${p.brand}` : ''}</p>
                          </div>
                          {p.inStock && (inCart ? (
                            <div className="flex items-center rounded-full bg-primary-50 text-primary-800 shrink-0">
                              <button onClick={() => setQty(p.id, inCart.qty - 1)} className="w-7 h-7 grid place-items-center" aria-label="One less"><Minus size={12} /></button>
                              <span className="text-xs font-bold w-4 text-center">{inCart.qty}</span>
                              <button onClick={() => setQty(p.id, inCart.qty + 1)} className="w-7 h-7 grid place-items-center" aria-label="One more"><Plus size={12} /></button>
                            </div>
                          ) : (
                            <button onClick={() => addToCart(p)} className="w-8 h-8 rounded-full bg-primary-600 hover:bg-primary-700 text-snow grid place-items-center shrink-0 shadow-sm" aria-label={`Add ${p.name} to cart`}>
                              <ShoppingCart size={15} />
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {listing.hasNextPage && (
                <div className="flex justify-center pt-4">
                  <button onClick={() => listing.fetchNextPage()} disabled={listing.isFetchingNextPage}
                    className="btn-secondary px-8 py-2.5 disabled:opacity-50">
                    {listing.isFetchingNextPage && <Loader2 size={14} className="animate-spin" />} Load more
                  </button>
                </div>
              )}
            </>
          )}
        </section>

        {/* ── Footer ─────────────────────────────────────────────────── */}
        <footer className="card p-4 sm:p-5 text-[12px] text-stone-500 grid gap-3 sm:grid-cols-[1fr_auto] items-center">
          <div className="space-y-1">
            <p className="font-bold text-stone-800">{shop.name}</p>
            {location && <p className="flex items-center gap-1"><MapPin size={12} /> {location}</p>}
            {shop.phone && <a href={`tel:${shop.phone}`} className="flex items-center gap-1 hover:text-stone-800"><Phone size={12} /> {shop.phone}</a>}
            {shop.deliveryNote && <p>{shop.deliveryNote}</p>}
          </div>
          <Link to="/shops" className="flex items-center gap-1.5 text-stone-500 hover:text-stone-800">
            <LogoMark size={18} /> More shops on MauzoHalisi <ChevronRight size={13} />
          </Link>
        </footer>
      </main>

      {/* ── Sticky cart bar (phones) ──────────────────────────────────── */}
      {itemCount > 0 && !cartOpen && !viewing && (
        <button
          onClick={() => setCartOpen(true)}
          className="fixed bottom-4 left-4 right-4 max-w-md mx-auto py-3 px-5 rounded-full bg-primary-600 text-snow shadow-xl flex items-center justify-between z-30 sm:hidden"
        >
          <span className="flex items-center gap-2 text-sm font-bold">
            <ShoppingCart size={17} /> {itemCount} in cart
          </span>
          <span className="font-extrabold">{money(subtotal, shop.currency)}</span>
        </button>
      )}

      {/* ── Product sheet ─────────────────────────────────────────────── */}
      {viewing && (
        <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label={viewing.name}>
          <div className="absolute inset-0 bg-black/50" onClick={() => setViewing(null)} />
          <div className="relative mh-ground w-full sm:max-w-3xl rounded-t-3xl sm:rounded-2xl max-h-[92vh] overflow-y-auto sm:grid sm:grid-cols-2">
            <button onClick={() => setViewing(null)} className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-white/90 shadow grid place-items-center text-stone-600" aria-label="Close">
              <X size={16} />
            </button>
            <div className="aspect-square bg-stone-100 sm:rounded-l-2xl overflow-hidden">
              <ProductImage p={viewing} size="full" />
            </div>
            <div className="p-5 flex flex-col gap-3">
              <div>
                <Price value={viewing.price} currency={shop.currency} size="lg" />
                <p className="text-xs text-stone-400">per {viewing.unit}</p>
              </div>
              <h3 className="text-base font-semibold text-stone-900 leading-snug">{viewing.name}</h3>
              <div className="flex flex-wrap gap-1.5 text-[11px]">
                {viewing.category && <span className="px-2 py-0.5 rounded bg-stone-100 text-stone-600">{viewing.category}</span>}
                {viewing.brand && <span className="px-2 py-0.5 rounded bg-stone-100 text-stone-600">{viewing.brand}</span>}
                {viewing.inStock
                  ? viewing.lowStock
                    ? <span className="px-2 py-0.5 rounded bg-red-50 text-red-700 font-semibold">Few left</span>
                    : <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold">In stock</span>
                  : <span className="px-2 py-0.5 rounded bg-stone-100 text-stone-500 font-semibold">Out of stock</span>}
              </div>
              {viewing.description && <p className="text-sm text-stone-600 whitespace-pre-line">{viewing.description}</p>}
              <ul className="text-[12px] text-stone-500 space-y-1 border-t border-stone-100 pt-3">
                {shop.acceptsDelivery && <li className="flex items-center gap-1.5"><Truck size={13} /> {shop.deliveryFee > 0 ? `Delivery ${money(shop.deliveryFee, shop.currency)}` : 'Free delivery'}</li>}
                {shop.acceptsPickup && <li className="flex items-center gap-1.5"><Package size={13} /> Pickup from the shop</li>}
                <li className="flex items-center gap-1.5"><Wallet size={13} /> Pay when you receive it</li>
              </ul>
              {viewing.inStock && (
                <div className="mt-auto flex items-center gap-3 pt-2">
                  <div className="flex items-center rounded-full border border-stone-200">
                    <button onClick={() => setViewQty(q => Math.max(1, q - 1))} className="w-9 h-9 grid place-items-center text-stone-600" aria-label="One less"><Minus size={14} /></button>
                    <span className="w-7 text-center text-sm font-bold">{viewQty}</span>
                    <button onClick={() => setViewQty(q => q + 1)} className="w-9 h-9 grid place-items-center text-stone-600" aria-label="One more"><Plus size={14} /></button>
                  </div>
                  <button onClick={() => { addToCart(viewing, viewQty); setViewing(null); }}
                    className="flex-1 py-2.5 rounded-full bg-primary-600 hover:bg-primary-700 text-snow text-sm font-bold flex items-center justify-center gap-1.5">
                    <ShoppingCart size={15} /> Add to cart
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Cart / checkout sheet ─────────────────────────────────────── */}
      {cartOpen && (
        <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => { setCartOpen(false); setCheckout(false); }} />
          <div className="relative mh-ground w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl max-h-[88vh] overflow-y-auto">
            <div className="sticky top-0 mh-ground px-5 py-4 border-b border-stone-100 flex items-center justify-between">
              <h2 className="font-bold text-stone-900">
                {checkout ? 'Your details' : `Cart (${itemCount})`}
              </h2>
              <button onClick={() => { setCartOpen(false); setCheckout(false); }}
                className="text-stone-400 hover:text-stone-700" aria-label="Close"><X size={18} /></button>
            </div>

            <div className="p-5 space-y-4">
              {error && (
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                  <AlertCircle size={14} className="shrink-0 mt-0.5" /> <span>{error}</span>
                </div>
              )}

              {!checkout ? (
                <>
                  {cart.map(l => (
                    <div key={l.product.id} className="flex gap-3 items-center">
                      <div className="w-14 h-14 rounded-lg bg-stone-100 shrink-0 overflow-hidden">
                        <ProductImage p={l.product} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-stone-800 line-clamp-2">{l.product.name}</p>
                        <Price value={l.product.price} currency={shop.currency} />
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button onClick={() => setQty(l.product.id, l.qty - 1)}
                          className="w-7 h-7 grid place-items-center rounded-full border border-stone-200 text-stone-500" aria-label="One less">
                          <Minus size={12} />
                        </button>
                        <span className="w-6 text-center text-xs font-bold">{l.qty}</span>
                        <button onClick={() => setQty(l.product.id, l.qty + 1)}
                          className="w-7 h-7 grid place-items-center rounded-full border border-stone-200 text-stone-500" aria-label="One more">
                          <Plus size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {cart.length === 0 && (
                    <div className="text-center py-8">
                      <ShoppingCart size={30} className="mx-auto mb-2 text-stone-300" />
                      <p className="text-sm text-stone-400">Your cart is empty</p>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-stone-600 mb-1.5">Your name *</label>
                    <input className="w-full px-3 py-2.5 rounded-xl border border-stone-200 text-sm outline-none focus:border-primary-500"
                      value={name} onChange={e => setName(e.target.value)} placeholder="Asha Juma" autoFocus />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-stone-600 mb-1.5">Phone number *</label>
                    <input className="w-full px-3 py-2.5 rounded-xl border border-stone-200 text-sm outline-none focus:border-primary-500"
                      value={phone} onChange={e => setPhone(e.target.value)} placeholder="0712 345 678" inputMode="tel" />
                    <p className="text-[11px] text-stone-400 mt-1">The shop will call this number to confirm.</p>
                  </div>

                  {shop.acceptsDelivery && shop.acceptsPickup && (
                    <div>
                      <label className="block text-xs font-semibold text-stone-600 mb-1.5">How do you want it?</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button type="button" onClick={() => setMode('DELIVERY')}
                          className={`py-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 ${
                            mode === 'DELIVERY' ? 'border-primary-600 bg-primary-50 text-primary-800' : 'border-stone-200 text-stone-500'}`}>
                          <Truck size={13} /> Delivery
                        </button>
                        <button type="button" onClick={() => setMode('PICKUP')}
                          className={`py-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 ${
                            mode === 'PICKUP' ? 'border-primary-600 bg-primary-50 text-primary-800' : 'border-stone-200 text-stone-500'}`}>
                          <Package size={13} /> Pickup
                        </button>
                      </div>
                    </div>
                  )}

                  {mode === 'DELIVERY' && (
                    <div>
                      <label className="block text-xs font-semibold text-stone-600 mb-1.5">Delivery address *</label>
                      <textarea rows={2}
                        className="w-full px-3 py-2.5 rounded-xl border border-stone-200 text-sm outline-none focus:border-primary-500 resize-none"
                        value={address} onChange={e => setAddress(e.target.value)}
                        placeholder="Street, area, landmark" />
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-stone-600 mb-1.5">Note (optional)</label>
                    <input className="w-full px-3 py-2.5 rounded-xl border border-stone-200 text-sm outline-none focus:border-primary-500"
                      value={note} onChange={e => setNote(e.target.value)} placeholder="Anything the shop should know" />
                  </div>
                </>
              )}
            </div>

            {/* Totals + action */}
            {cart.length > 0 && (
              <div className="sticky bottom-0 mh-ground border-t border-stone-100 p-5 space-y-3">
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between text-stone-500">
                    <span>Subtotal</span><span>{money(subtotal, shop.currency)}</span>
                  </div>
                  {mode === 'DELIVERY' && deliveryFee > 0 && (
                    <div className="flex justify-between text-stone-500">
                      <span>Delivery</span><span>{money(deliveryFee, shop.currency)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-stone-900 pt-1 border-t border-stone-100">
                    <span>Total</span><span className="text-primary-700">{money(orderTotal, shop.currency)}</span>
                  </div>
                </div>

                {belowMin && (
                  <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    Minimum order is {money(shop.minOrderValue, shop.currency)}. Add{' '}
                    {money(shop.minOrderValue - subtotal, shop.currency)} more to check out.
                  </p>
                )}

                {!checkout ? (
                  <button
                    disabled={belowMin}
                    onClick={() => { setError(''); setCheckout(true); }}
                    className="w-full py-3 rounded-full bg-primary-600 hover:bg-primary-700 text-snow text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Check out
                  </button>
                ) : (
                  <button
                    disabled={submitting || belowMin || !name.trim() || !phone.trim() || (mode === 'DELIVERY' && !address.trim())}
                    onClick={submitOrder}
                    className="w-full py-3 rounded-full bg-primary-600 hover:bg-primary-700 text-snow text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {submitting && <Loader2 size={14} className="animate-spin" />}
                    {submitting ? 'Placing order…' : `Place order · Pay on ${mode === 'PICKUP' ? 'pickup' : 'delivery'}`}
                  </button>
                )}
                <p className="text-[11px] text-center text-stone-400">
                  No payment now. You pay when you receive your order.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
