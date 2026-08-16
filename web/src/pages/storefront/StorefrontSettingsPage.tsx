/**
 * Shop-side control panel for the public storefront: the link, whether it is
 * open, delivery terms, and which products are listed.
 */
import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Globe, Copy, Check, ExternalLink, Search, Loader2, AlertCircle,
  Truck, Package, ShoppingBag, Bell, BellOff,
} from 'lucide-react';
import api from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { PageLoader } from '../../components/ui/Loader';
import { requestOrderNotifications } from '../../hooks/useOrderAlerts';

interface ShopConfig {
  id: string; tradingName: string; phone?: string; currency: string;
  storefrontEnabled: boolean; slug?: string | null;
  storefrontBio?: string | null; storefrontBanner?: string | null;
  acceptsDelivery: boolean; acceptsPickup: boolean;
  deliveryFee: number; deliveryNote?: string | null;
  minOrderValue: number; orderPhone?: string | null;
}
interface Product {
  id: string; name: string; sku?: string; sellingPrice: number; stock: number;
  imageUrl?: string; category?: string; isActive: boolean;
  isPublished?: boolean; publicPrice?: number | null;
}

function apiError(e: unknown, fallback: string) {
  return (e as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;
}
function money(n: number, c = 'TZS') {
  return new Intl.NumberFormat('sw-TZ', { style: 'currency', currency: c, maximumFractionDigits: 0 }).format(n);
}

export default function StorefrontSettingsPage() {
  const { shopId } = useAuthStore();
  const qc = useQueryClient();

  const [form, setForm] = useState({
    slug: '', storefrontBio: '', acceptsDelivery: true, acceptsPickup: true,
    deliveryFee: 0, deliveryNote: '', minOrderValue: 0,
  });
  const [error, setError]   = useState('');
  const [saved, setSaved]   = useState(false);
  const [copied, setCopied] = useState(false);
  const [search, setSearch] = useState('');
  const [notifyPerm, setNotifyPerm] = useState<NotificationPermission | 'unsupported'>(
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  );

  const { data: config, isLoading } = useQuery<ShopConfig>({
    queryKey: ['shop-config', shopId],
    queryFn: () => api.get(`/shops/${shopId}/config`).then(r => r.data.data.shop),
    enabled: !!shopId,
  });

  const { data: products = [], isLoading: loadingProducts } = useQuery<Product[]>({
    queryKey: ['products-storefront', shopId, search],
    queryFn: () => api.get('/inventory/products', {
      params: { search: search || undefined, active: 'true', limit: 200 },
    }).then(r => r.data.data),
    enabled: !!shopId,
  });

  useEffect(() => {
    if (config) {
      setForm({
        slug: config.slug ?? '',
        storefrontBio: config.storefrontBio ?? '',
        acceptsDelivery: config.acceptsDelivery,
        acceptsPickup: config.acceptsPickup,
        deliveryFee: config.deliveryFee,
        deliveryNote: config.deliveryNote ?? '',
        minOrderValue: config.minOrderValue,
      });
    }
  }, [config]);

  const { mutate: saveSettings, isPending } = useMutation({
    mutationFn: (patch: Record<string, unknown>) => api.put(`/shops/${shopId}`, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shop-config', shopId] });
      setError(''); setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
    onError: (e) => setError(apiError(e, 'Could not save')),
  });

  const { mutate: togglePublish } = useMutation({
    mutationFn: ({ id, isPublished }: { id: string; isPublished: boolean }) =>
      api.patch(`/inventory/products/${id}`, { isPublished }),
    onMutate: async ({ id, isPublished }) => {
      // Optimistic — the toggle should feel instant when publishing a long list.
      const key = ['products-storefront', shopId, search];
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Product[]>(key);
      qc.setQueryData<Product[]>(key, old =>
        (old ?? []).map(p => p.id === id ? { ...p, isPublished } : p));
      return { prev, key };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(ctx.key, ctx.prev);
      setError(apiError(e, 'Could not update product'));
    },
  });

  const publishedCount = products.filter(p => p.isPublished).length;
  const liveUrl = config?.slug ? `${window.location.origin}/s/${config.slug}` : '';
  const isLive  = !!config?.storefrontEnabled && !!config?.slug;

  function copyLink() {
    navigator.clipboard.writeText(liveUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => setError('Could not copy the link'));
  }

  if (isLoading) return <PageLoader />;

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div>
          <h1 className="page-title">Online Store</h1>
          <p className="page-subtitle">Let customers browse and order from you, paying on delivery</p>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
          <AlertCircle size={14} className="shrink-0 mt-0.5" /> <span>{error}</span>
        </div>
      )}

      {/* Live status */}
      <div className={`card p-5 border-l-4 ${isLive ? 'border-emerald-400' : 'border-stone-300'}`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <Globe size={20} className={isLive ? 'text-emerald-500 mt-0.5' : 'text-stone-400 mt-0.5'} />
            <div className="min-w-0">
              <p className="font-semibold text-stone-900">
                {isLive ? 'Your store is open' : 'Your store is closed'}
              </p>
              <p className="text-xs text-stone-500 mt-0.5">
                {isLive
                  ? `${publishedCount} item${publishedCount === 1 ? '' : 's'} listed for customers`
                  : 'Customers cannot see your shop or place orders yet'}
              </p>
              {isLive && (
                <div className="flex flex-wrap items-center gap-2 mt-2.5">
                  <code className="text-xs bg-stone-100 px-2 py-1 rounded font-mono text-stone-700 break-all">
                    {liveUrl}
                  </code>
                  <button onClick={copyLink}
                    className="inline-flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 font-semibold">
                    {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
                  </button>
                  <a href={liveUrl} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 font-semibold">
                    <ExternalLink size={12} /> Open
                  </a>
                </div>
              )}
            </div>
          </div>

          <button
            onClick={() => saveSettings({ storefrontEnabled: !config?.storefrontEnabled, slug: form.slug || undefined })}
            disabled={isPending}
            className={`px-4 py-2 rounded-lg text-xs font-bold shrink-0 transition-colors ${
              config?.storefrontEnabled
                ? 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
          >
            {config?.storefrontEnabled ? 'Close store' : 'Open store'}
          </button>
        </div>

        {isLive && publishedCount === 0 && (
          <p className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Your store is open but nothing is listed. Publish some products below so customers have something to buy.
          </p>
        )}
      </div>

      {/* Order alerts */}
      {notifyPerm !== 'unsupported' && (
        <div className="card p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            {notifyPerm === 'granted'
              ? <Bell size={18} className="text-emerald-500 mt-0.5 shrink-0" />
              : <BellOff size={18} className="text-stone-400 mt-0.5 shrink-0" />}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-stone-900">
                {notifyPerm === 'granted' ? 'Order alerts are on' : 'Turn on order alerts'}
              </p>
              <p className="text-xs text-stone-500 mt-0.5">
                {notifyPerm === 'granted'
                  ? 'You will get a pop-up and a chime when an order comes in, on any page.'
                  : notifyPerm === 'denied'
                  ? 'Blocked by your browser. Allow notifications for this site in your browser settings.'
                  : 'Get a pop-up and a chime the moment a customer orders, even on another page.'}
              </p>
            </div>
          </div>
          {notifyPerm === 'default' && (
            <button
              onClick={async () => setNotifyPerm(await requestOrderNotifications())}
              className="btn-secondary text-xs shrink-0"
            >
              <Bell size={12} className="mr-1.5" /> Enable
            </button>
          )}
        </div>
      )}

      {/* Store details */}
      <div className="card p-5 space-y-4">
        <h3 className="text-sm font-semibold text-stone-700">Store details</h3>

        <div>
          <label className="label">Store link *</label>
          <div className="flex items-center gap-2">
            <span className="text-xs text-stone-400 shrink-0 font-mono">/s/</span>
            <input
              className="input flex-1"
              value={form.slug}
              onChange={e => setForm(f => ({ ...f, slug: e.target.value }))}
              placeholder="mama-duka"
            />
          </div>
          <p className="text-[11px] text-stone-400 mt-1">
            Letters, numbers and hyphens. This is the link you share with customers, so keep it short.
          </p>
        </div>

        <div>
          <label className="label">About your shop</label>
          <textarea rows={2} className="input resize-none"
            value={form.storefrontBio}
            onChange={e => setForm(f => ({ ...f, storefrontBio: e.target.value }))}
            placeholder="Fresh groceries delivered around Mikocheni" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button type="button"
            onClick={() => setForm(f => ({ ...f, acceptsDelivery: !f.acceptsDelivery }))}
            className={`p-3 rounded-xl border text-left transition-colors ${
              form.acceptsDelivery ? 'border-primary-400 bg-primary-50' : 'border-stone-200'}`}>
            <div className="flex items-center gap-2">
              <Truck size={15} className={form.acceptsDelivery ? 'text-primary-600' : 'text-stone-400'} />
              <span className="text-xs font-semibold text-stone-800">Delivery</span>
              {form.acceptsDelivery && <Check size={13} className="text-primary-600 ml-auto" />}
            </div>
            <p className="text-[11px] text-stone-400 mt-1">You deliver to the customer</p>
          </button>

          <button type="button"
            onClick={() => setForm(f => ({ ...f, acceptsPickup: !f.acceptsPickup }))}
            className={`p-3 rounded-xl border text-left transition-colors ${
              form.acceptsPickup ? 'border-primary-400 bg-primary-50' : 'border-stone-200'}`}>
            <div className="flex items-center gap-2">
              <Package size={15} className={form.acceptsPickup ? 'text-primary-600' : 'text-stone-400'} />
              <span className="text-xs font-semibold text-stone-800">Pickup</span>
              {form.acceptsPickup && <Check size={13} className="text-primary-600 ml-auto" />}
            </div>
            <p className="text-[11px] text-stone-400 mt-1">Customer collects from your shop</p>
          </button>
        </div>

        {!form.acceptsDelivery && !form.acceptsPickup && (
          <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Choose at least one. With both off, customers have no way to receive their order.
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Delivery fee</label>
            <input type="number" min={0} className="input"
              value={form.deliveryFee}
              onChange={e => setForm(f => ({ ...f, deliveryFee: Number(e.target.value) || 0 }))}
              disabled={!form.acceptsDelivery} />
          </div>
          <div>
            <label className="label">Minimum order</label>
            <input type="number" min={0} className="input"
              value={form.minOrderValue}
              onChange={e => setForm(f => ({ ...f, minOrderValue: Number(e.target.value) || 0 }))} />
          </div>
        </div>

        <div>
          <label className="label">Delivery note</label>
          <input className="input"
            value={form.deliveryNote}
            onChange={e => setForm(f => ({ ...f, deliveryNote: e.target.value }))}
            placeholder="We deliver within Dar es Salaam, same day before 6pm"
            disabled={!form.acceptsDelivery} />
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={() => saveSettings(form)}
            disabled={isPending || (!form.acceptsDelivery && !form.acceptsPickup)}
            className="btn-primary disabled:opacity-40"
          >
            {isPending ? 'Saving…' : 'Save changes'}
          </button>
          {saved && (
            <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
              <Check size={13} /> Saved
            </span>
          )}
        </div>
      </div>

      {/* Product listing */}
      <div className="card">
        <div className="px-5 py-4 border-b border-stone-100 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-stone-700">Listed products</h3>
            <p className="text-xs text-stone-400 mt-0.5">
              {publishedCount} of {products.length} shown online
            </p>
          </div>
          <div className="relative w-full sm:w-56">
            <Search size={14} className="absolute left-3 top-3 text-stone-400" />
            <input className="input pl-8 w-full" placeholder="Search products…"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>

        {loadingProducts ? (
          <div className="py-12 grid place-items-center">
            <Loader2 className="animate-spin text-stone-300" size={20} />
          </div>
        ) : products.length === 0 ? (
          <div className="py-12 text-center text-stone-400">
            <ShoppingBag size={28} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm">No products found</p>
          </div>
        ) : (
          <div className="divide-y divide-stone-50">
            {products.map(p => (
              <div key={p.id} className="px-5 py-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-stone-100 shrink-0 overflow-hidden grid place-items-center">
                  {p.imageUrl
                    ? <img src={p.imageUrl} alt="" className="w-full h-full object-cover" />
                    : <ShoppingBag size={15} className="text-stone-300" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-stone-900 truncate">{p.name}</p>
                  <p className="text-xs text-stone-400">
                    {money(p.sellingPrice, config?.currency)}
                    <span className={`ml-2 ${p.stock <= 0 ? 'text-red-500' : ''}`}>
                      {p.stock <= 0 ? 'Out of stock' : `${p.stock} in stock`}
                    </span>
                  </p>
                </div>
                <button
                  onClick={() => togglePublish({ id: p.id, isPublished: !p.isPublished })}
                  className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
                    p.isPublished ? 'bg-emerald-500' : 'bg-stone-200'}`}
                  title={p.isPublished ? 'Listed online' : 'Hidden'}
                >
                  <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${
                    p.isPublished ? 'left-[22px]' : 'left-0.5'}`} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-[11px] text-stone-400 px-1">
        Orders never reduce your stock on their own. Stock only moves when you mark an order fulfilled,
        so unconfirmed orders can't affect what your POS shows as available.
      </p>
    </div>
  );
}
