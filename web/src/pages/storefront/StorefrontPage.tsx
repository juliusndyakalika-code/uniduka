/**
 * Public shop storefront at /s/:slug — no auth, no app chrome.
 *
 * Mobile-first: most shoppers arrive from a WhatsApp or Instagram link on a
 * phone, so the cart is a bottom sheet rather than a sidebar.
 */
import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Search, ShoppingBag, Plus, Minus, X, MapPin, Phone, Store,
  CheckCircle2, Truck, Package, Loader2, AlertCircle, MessageCircle,
} from 'lucide-react';
import publicApi from '../../api/publicClient';
import { buildOrderMessage, waLink } from '../../utils/whatsapp';

interface Shop {
  slug: string; name: string; bio?: string; logoUrl?: string; bannerUrl?: string;
  phone?: string; city?: string; region?: string; addressLine1?: string;
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
    style: 'currency', currency, maximumFractionDigits: 0,
  }).format(n);
}

function apiError(e: unknown, fallback: string) {
  return (e as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;
}

export default function StorefrontPage() {
  const { slug = '' } = useParams();

  const [search, setSearch]     = useState('');
  const [category, setCategory] = useState('');
  const [cart, setCart]         = useState<Line[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkout, setCheckout] = useState(false);
  const [placed, setPlaced]     = useState<Placed | null>(null);

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

  const { data: products = [], isLoading: loadingProducts } = useQuery<Product[]>({
    queryKey: ['storefront-products', slug, search, category],
    queryFn: () => publicApi.get(`/shops/${slug}/products`, {
      params: { search: search || undefined, category: category || undefined, limit: 48 },
    }).then(r => r.data.data),
    enabled: !!shop,
    placeholderData: prev => prev,
  });

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

  const subtotal    = useMemo(() => cart.reduce((s, l) => s + l.product.price * l.qty, 0), [cart]);
  const itemCount   = useMemo(() => cart.reduce((s, l) => s + l.qty, 0), [cart]);
  const deliveryFee = mode === 'DELIVERY' && shop ? shop.deliveryFee : 0;
  const total       = subtotal + deliveryFee;
  const belowMin    = !!shop && shop.minOrderValue > 0 && subtotal < shop.minOrderValue;

  function addToCart(p: Product) {
    setCart(c => {
      const found = c.find(l => l.product.id === p.id);
      if (found) return c.map(l => l.product.id === p.id ? { ...l, qty: l.qty + 1 } : l);
      return [...c, { product: p, qty: 1 }];
    });
  }
  function setQty(id: string, qty: number) {
    setCart(c => qty <= 0 ? c.filter(l => l.product.id !== id)
                          : c.map(l => l.product.id === id ? { ...l, qty } : l));
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
      <div className="min-h-screen grid place-items-center bg-stone-50">
        <Loader2 className="animate-spin text-stone-400" size={28} />
      </div>
    );
  }
  if (isError || !shop) {
    return (
      <div className="min-h-screen grid place-items-center bg-stone-50 p-6 text-center">
        <div>
          <Store size={40} className="mx-auto mb-3 text-stone-300" />
          <h1 className="text-lg font-bold text-stone-800">Shop not found</h1>
          <p className="text-sm text-stone-500 mt-1">
            This storefront doesn't exist or isn't open right now.
          </p>
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
      <div className="min-h-screen bg-stone-50 grid place-items-center p-5">
        <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-7 max-w-sm w-full text-center">
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
                className="inline-flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-[#25D366] text-white text-sm font-bold active:bg-[#1da851]">
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

  return (
    <div className="min-h-screen bg-stone-50 pb-28">
      {/* Banner + shop identity */}
      <div className="relative">
        <div className="h-28 sm:h-40 bg-gradient-to-br from-primary-500 to-primary-700 overflow-hidden">
          {shop.bannerUrl && (
            <img src={shop.bannerUrl} alt="" className="w-full h-full object-cover" />
          )}
        </div>
        <div className="px-4 sm:px-6 -mt-10">
          <div className="max-w-5xl mx-auto">
            <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-4 sm:p-5 flex gap-4 items-start">
              <div className="w-16 h-16 rounded-xl bg-stone-100 shrink-0 grid place-items-center overflow-hidden">
                {shop.logoUrl
                  ? <img src={shop.logoUrl} alt="" className="w-full h-full object-cover" />
                  : <Store size={26} className="text-stone-400" />}
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-lg sm:text-xl font-bold text-stone-900 truncate">{shop.name}</h1>
                {shop.bio && <p className="text-sm text-stone-500 mt-0.5 line-clamp-2">{shop.bio}</p>}
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-stone-400">
                  {(shop.city || shop.addressLine1) && (
                    <span className="flex items-center gap-1">
                      <MapPin size={11} /> {[shop.addressLine1, shop.city].filter(Boolean).join(', ')}
                    </span>
                  )}
                  {shop.phone && (
                    <a href={`tel:${shop.phone}`} className="flex items-center gap-1 hover:text-primary-600">
                      <Phone size={11} /> {shop.phone}
                    </a>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 mt-3">
                  {shop.acceptsDelivery && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-[11px] font-semibold">
                      <Truck size={11} /> Delivery {shop.deliveryFee > 0 ? money(shop.deliveryFee, shop.currency) : 'free'}
                    </span>
                  )}
                  {shop.acceptsPickup && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-stone-100 text-stone-600 text-[11px] font-semibold">
                      <Package size={11} /> Pickup
                    </span>
                  )}
                  <span className="inline-flex items-center px-2 py-1 rounded-lg bg-amber-50 text-amber-700 text-[11px] font-semibold">
                    Pay on delivery
                  </span>
                </div>
                {shop.deliveryNote && (
                  <p className="text-[11px] text-stone-400 mt-2">{shop.deliveryNote}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Search + categories */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 mt-5 space-y-3">
        <div className="relative">
          <Search size={15} className="absolute left-3.5 top-3.5 text-stone-400" />
          <input
            className="w-full pl-10 pr-4 py-3 rounded-xl border border-stone-200 bg-white text-sm outline-none focus:border-primary-400"
            placeholder={`Search ${shop.name}…`}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        {shop.categories.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            <button
              onClick={() => setCategory('')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border transition-colors ${
                !category ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-600 border-stone-200'}`}>
              All
            </button>
            {shop.categories.map(c => (
              <button key={c} onClick={() => setCategory(c)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border transition-colors ${
                  category === c ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-600 border-stone-200'}`}>
                {c}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Products */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 mt-4">
        {loadingProducts && products.length === 0 ? (
          <div className="py-16 grid place-items-center">
            <Loader2 className="animate-spin text-stone-300" size={22} />
          </div>
        ) : products.length === 0 ? (
          <div className="py-16 text-center">
            <ShoppingBag size={32} className="mx-auto mb-2 text-stone-300" />
            <p className="text-sm text-stone-500">
              {search || category ? 'Nothing matches that search' : 'This shop has no items listed yet'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {products.map(p => {
              const inCart = cart.find(l => l.product.id === p.id);
              return (
                <div key={p.id} className="bg-white rounded-xl border border-stone-100 overflow-hidden flex flex-col">
                  <div className="aspect-square bg-stone-100 relative">
                    {p.imageUrl
                      ? <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" loading="lazy" />
                      : <div className="w-full h-full grid place-items-center"><ShoppingBag size={26} className="text-stone-300" /></div>}
                    {!p.inStock && (
                      <div className="absolute inset-0 bg-white/70 grid place-items-center">
                        <span className="text-[11px] font-bold text-stone-500 uppercase tracking-wide">Out of stock</span>
                      </div>
                    )}
                    {p.inStock && p.lowStock && (
                      <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-amber-500 text-white text-[10px] font-bold">
                        Few left
                      </span>
                    )}
                  </div>
                  <div className="p-2.5 flex flex-col flex-1">
                    <p className="text-xs font-semibold text-stone-900 line-clamp-2 leading-snug">{p.name}</p>
                    {p.brand && <p className="text-[10px] text-stone-400 mt-0.5">{p.brand}</p>}
                    <p className="text-sm font-bold text-stone-900 mt-1.5">
                      {money(p.price, shop.currency)}
                      <span className="text-[10px] font-normal text-stone-400 ml-1">/{p.unit}</span>
                    </p>
                    <div className="mt-2">
                      {!p.inStock ? (
                        <button disabled className="w-full py-1.5 rounded-lg bg-stone-100 text-stone-400 text-xs font-semibold cursor-not-allowed">
                          Unavailable
                        </button>
                      ) : inCart ? (
                        <div className="flex items-center justify-between bg-stone-100 rounded-lg">
                          <button onClick={() => setQty(p.id, inCart.qty - 1)}
                            className="w-8 h-8 grid place-items-center text-stone-600 active:bg-stone-200 rounded-l-lg">
                            <Minus size={13} />
                          </button>
                          <span className="text-xs font-bold text-stone-900">{inCart.qty}</span>
                          <button onClick={() => setQty(p.id, inCart.qty + 1)}
                            className="w-8 h-8 grid place-items-center text-stone-600 active:bg-stone-200 rounded-r-lg">
                            <Plus size={13} />
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => addToCart(p)}
                          className="w-full py-1.5 rounded-lg bg-stone-900 text-white text-xs font-semibold active:bg-stone-700">
                          Add
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Sticky cart bar */}
      {itemCount > 0 && !cartOpen && (
        <button
          onClick={() => setCartOpen(true)}
          className="fixed bottom-4 left-4 right-4 max-w-md mx-auto py-3.5 px-5 rounded-2xl bg-stone-900 text-white shadow-xl flex items-center justify-between z-30"
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            <span className="w-6 h-6 rounded-full bg-white text-stone-900 text-xs font-bold grid place-items-center">
              {itemCount}
            </span>
            View cart
          </span>
          <span className="font-bold">{money(subtotal, shop.currency)}</span>
        </button>
      )}

      {/* Cart / checkout sheet */}
      {cartOpen && (
        <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => { setCartOpen(false); setCheckout(false); }} />
          <div className="relative bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl max-h-[88vh] overflow-y-auto">
            <div className="sticky top-0 bg-white px-5 py-4 border-b border-stone-100 flex items-center justify-between">
              <h2 className="font-bold text-stone-900">
                {checkout ? 'Your details' : `Cart (${itemCount})`}
              </h2>
              <button onClick={() => { setCartOpen(false); setCheckout(false); }}
                className="text-stone-400 hover:text-stone-700"><X size={18} /></button>
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
                      <div className="w-12 h-12 rounded-lg bg-stone-100 shrink-0 overflow-hidden grid place-items-center">
                        {l.product.imageUrl
                          ? <img src={l.product.imageUrl} alt="" className="w-full h-full object-cover" />
                          : <ShoppingBag size={16} className="text-stone-300" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-stone-900 truncate">{l.product.name}</p>
                        <p className="text-xs text-stone-500">{money(l.product.price, shop.currency)}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button onClick={() => setQty(l.product.id, l.qty - 1)}
                          className="w-7 h-7 grid place-items-center rounded-lg border border-stone-200 text-stone-500">
                          <Minus size={12} />
                        </button>
                        <span className="w-6 text-center text-xs font-bold">{l.qty}</span>
                        <button onClick={() => setQty(l.product.id, l.qty + 1)}
                          className="w-7 h-7 grid place-items-center rounded-lg border border-stone-200 text-stone-500">
                          <Plus size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {cart.length === 0 && (
                    <p className="text-center text-sm text-stone-400 py-8">Your cart is empty</p>
                  )}
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-stone-600 mb-1.5">Your name *</label>
                    <input className="w-full px-3 py-2.5 rounded-xl border border-stone-200 text-sm outline-none focus:border-primary-400"
                      value={name} onChange={e => setName(e.target.value)} placeholder="Asha Juma" autoFocus />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-stone-600 mb-1.5">Phone number *</label>
                    <input className="w-full px-3 py-2.5 rounded-xl border border-stone-200 text-sm outline-none focus:border-primary-400"
                      value={phone} onChange={e => setPhone(e.target.value)} placeholder="0712 345 678" inputMode="tel" />
                    <p className="text-[11px] text-stone-400 mt-1">The shop will call this number to confirm.</p>
                  </div>

                  {shop.acceptsDelivery && shop.acceptsPickup && (
                    <div>
                      <label className="block text-xs font-semibold text-stone-600 mb-1.5">How do you want it?</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button type="button" onClick={() => setMode('DELIVERY')}
                          className={`py-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 ${
                            mode === 'DELIVERY' ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-stone-200 text-stone-500'}`}>
                          <Truck size={13} /> Delivery
                        </button>
                        <button type="button" onClick={() => setMode('PICKUP')}
                          className={`py-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 ${
                            mode === 'PICKUP' ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-stone-200 text-stone-500'}`}>
                          <Package size={13} /> Pickup
                        </button>
                      </div>
                    </div>
                  )}

                  {mode === 'DELIVERY' && (
                    <div>
                      <label className="block text-xs font-semibold text-stone-600 mb-1.5">Delivery address *</label>
                      <textarea rows={2}
                        className="w-full px-3 py-2.5 rounded-xl border border-stone-200 text-sm outline-none focus:border-primary-400 resize-none"
                        value={address} onChange={e => setAddress(e.target.value)}
                        placeholder="Street, area, landmark" />
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-stone-600 mb-1.5">Note (optional)</label>
                    <input className="w-full px-3 py-2.5 rounded-xl border border-stone-200 text-sm outline-none focus:border-primary-400"
                      value={note} onChange={e => setNote(e.target.value)} placeholder="Anything the shop should know" />
                  </div>
                </>
              )}
            </div>

            {/* Totals + action */}
            {cart.length > 0 && (
              <div className="sticky bottom-0 bg-white border-t border-stone-100 p-5 space-y-3">
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
                    <span>Total</span><span>{money(total, shop.currency)}</span>
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
                    className="w-full py-3 rounded-xl bg-stone-900 text-white text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Continue
                  </button>
                ) : (
                  <button
                    disabled={submitting || belowMin || !name.trim() || !phone.trim() || (mode === 'DELIVERY' && !address.trim())}
                    onClick={submitOrder}
                    className="w-full py-3 rounded-xl bg-stone-900 text-white text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
