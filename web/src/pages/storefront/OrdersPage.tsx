/**
 * Orders inbox — online orders from the shop's public storefront.
 *
 * Accepting is a promise to the buyer; fulfilling is the moment goods and money
 * change hands, so only that step touches stock and creates a sale.
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search, Phone, MapPin, Truck, Package, Check, X, Loader2,
  Inbox, ChevronLeft, ChevronRight, Clock, AlertCircle, Receipt,
} from 'lucide-react';
import api from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { PageLoader } from '../../components/ui/Loader';

interface OrderItem {
  id: string; productId: string; name: string;
  quantity: number; unitLabel: string; unitPrice: number; lineTotal: number;
}
interface Order {
  id: string; orderNo: string; status: string; fulfilment: 'DELIVERY' | 'PICKUP';
  buyerName: string; buyerPhone: string; buyerEmail?: string | null;
  deliveryAddress?: string | null; note?: string | null; cancelReason?: string | null;
  subtotal: number; deliveryFee: number; total: number;
  createdAt: string; expiresAt: string; acceptedAt?: string | null; fulfilledAt?: string | null;
  items: OrderItem[];
}
interface Meta {
  total: number; page: number; limit: number; pages: number;
  counts: Record<string, number>;
}

const STATUS_STYLE: Record<string, string> = {
  PENDING:   'bg-amber-100 text-amber-700',
  ACCEPTED:  'bg-blue-100 text-blue-700',
  FULFILLED: 'bg-emerald-100 text-emerald-700',
  REJECTED:  'bg-red-100 text-red-700',
  CANCELLED: 'bg-stone-100 text-stone-600',
  EXPIRED:   'bg-stone-100 text-stone-500',
};

const TABS = [
  { key: 'PENDING',   label: 'New' },
  { key: 'ACCEPTED',  label: 'Preparing' },
  { key: 'FULFILLED', label: 'Completed' },
  { key: '',          label: 'All' },
];

function money(n: number, c = 'TZS') {
  return new Intl.NumberFormat('sw-TZ', { style: 'currency', currency: c, maximumFractionDigits: 0 }).format(n);
}
function when(iso: string) {
  const d = new Date(iso);
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return d.toLocaleDateString('en-TZ', { day: '2-digit', month: 'short' });
}
function apiError(e: unknown, fallback: string) {
  return (e as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;
}

export default function OrdersPage() {
  const { shopId } = useAuthStore();
  const qc = useQueryClient();

  const [tab, setTab]       = useState('PENDING');
  const [search, setSearch] = useState('');
  const [page, setPage]     = useState(1);
  const [error, setError]   = useState('');
  const [rejecting, setRejecting] = useState<Order | null>(null);
  const [reason, setReason]       = useState('');
  const [busyId, setBusyId]       = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ data: Order[]; meta: Meta }>({
    queryKey: ['orders', shopId, tab, search, page],
    queryFn: () => api.get('/orders', {
      params: { status: tab || undefined, search: search || undefined, page, limit: 25 },
    }).then(r => ({ data: r.data.data, meta: r.data.meta })),
    enabled: !!shopId,
    // New orders arrive without warning, so keep the inbox reasonably fresh.
    refetchInterval: 60_000,
    placeholderData: prev => prev,
  });

  const orders = data?.data ?? [];
  const meta   = data?.meta;
  const counts = meta?.counts ?? {};

  function refresh() {
    qc.invalidateQueries({ queryKey: ['orders'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
    qc.invalidateQueries({ queryKey: ['products'] });
  }

  const act = useMutation({
    mutationFn: ({ id, action, body }: { id: string; action: string; body?: unknown }) =>
      api.post(`/orders/${id}/${action}`, body ?? {}),
    onMutate: ({ id }) => { setBusyId(id); setError(''); },
    onSuccess: () => { refresh(); setRejecting(null); setReason(''); },
    onError: (e) => setError(apiError(e, 'Could not update the order')),
    onSettled: () => setBusyId(null),
  });

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div>
          <h1 className="page-title">Online Orders</h1>
          <p className="page-subtitle">
            Orders from your storefront. Stock only changes when you mark one fulfilled.
          </p>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
          <AlertCircle size={14} className="shrink-0 mt-0.5" /> <span>{error}</span>
        </div>
      )}

      {/* Tabs + search */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="flex gap-1.5 overflow-x-auto flex-1">
          {TABS.map(t => (
            <button key={t.key}
              onClick={() => { setTab(t.key); setPage(1); }}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                tab === t.key ? 'bg-stone-900 text-white' : 'bg-white border border-stone-200 text-stone-600'}`}>
              {t.label}
              {!!t.key && counts[t.key] > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                  tab === t.key ? 'bg-white/20' : t.key === 'PENDING' ? 'bg-amber-100 text-amber-700' : 'bg-stone-100 text-stone-600'}`}>
                  {counts[t.key]}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="relative sm:w-60">
          <Search size={14} className="absolute left-3 top-3 text-stone-400" />
          <input className="input pl-8 w-full" placeholder="Order no, name, phone…"
            value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
      </div>

      {isLoading ? (
        <div className="card"><PageLoader /></div>
      ) : orders.length === 0 ? (
        <div className="card p-12 text-center">
          <Inbox size={34} className="mx-auto mb-3 text-stone-300" />
          <p className="text-sm font-semibold text-stone-700">
            {tab === 'PENDING' ? 'No new orders' : 'Nothing here'}
          </p>
          <p className="text-xs text-stone-400 mt-1">
            {search ? 'Try a different search' : 'Orders from your storefront will appear here'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map(o => {
            const busy = busyId === o.id;
            const isOpen = o.status === 'PENDING' || o.status === 'ACCEPTED';
            return (
              <div key={o.id} className="card p-4">
                {/* Header row */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-bold text-stone-900">{o.orderNo}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_STYLE[o.status] ?? 'bg-stone-100'}`}>
                        {o.status}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-stone-500">
                        {o.fulfilment === 'DELIVERY' ? <><Truck size={10} /> Delivery</> : <><Package size={10} /> Pickup</>}
                      </span>
                      <span className="text-[11px] text-stone-400 flex items-center gap-1">
                        <Clock size={10} /> {when(o.createdAt)}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-stone-900 mt-1.5">{o.buyerName}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-0.5">
                      <a href={`tel:${o.buyerPhone}`}
                        className="text-xs text-primary-600 hover:underline flex items-center gap-1">
                        <Phone size={11} /> {o.buyerPhone}
                      </a>
                      {o.deliveryAddress && (
                        <span className="text-xs text-stone-500 flex items-start gap-1">
                          <MapPin size={11} className="mt-0.5 shrink-0" /> {o.deliveryAddress}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-bold text-stone-900">{money(o.total)}</p>
                    {o.deliveryFee > 0 && (
                      <p className="text-[11px] text-stone-400">
                        {money(o.subtotal)} + {money(o.deliveryFee)} delivery
                      </p>
                    )}
                    <p className="text-[10px] text-amber-700 font-semibold mt-0.5">Pay on {o.fulfilment === 'PICKUP' ? 'pickup' : 'delivery'}</p>
                  </div>
                </div>

                {/* Items */}
                <div className="mt-3 pt-3 border-t border-stone-100 space-y-1">
                  {o.items.map(it => (
                    <div key={it.id} className="flex justify-between text-xs">
                      <span className="text-stone-600">
                        {it.name} <span className="text-stone-400">×{it.quantity} {it.unitLabel}</span>
                      </span>
                      <span className="text-stone-700 font-medium">{money(it.lineTotal)}</span>
                    </div>
                  ))}
                </div>

                {o.note && (
                  <p className="mt-2 text-xs text-stone-500 bg-stone-50 rounded-lg px-3 py-2">
                    <span className="font-semibold">Note:</span> {o.note}
                  </p>
                )}
                {o.cancelReason && (
                  <p className="mt-2 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
                    <span className="font-semibold">Reason:</span> {o.cancelReason}
                  </p>
                )}

                {/* Actions */}
                {isOpen && (
                  <div className="mt-3 pt-3 border-t border-stone-100 flex flex-wrap gap-2">
                    {o.status === 'PENDING' && (
                      <button
                        onClick={() => act.mutate({ id: o.id, action: 'accept' })}
                        disabled={busy}
                        className="btn-secondary text-xs disabled:opacity-40"
                      >
                        {busy ? <Loader2 size={12} className="mr-1.5 animate-spin" /> : <Check size={12} className="mr-1.5" />}
                        Accept
                      </button>
                    )}
                    <button
                      onClick={() => act.mutate({ id: o.id, action: 'fulfil' })}
                      disabled={busy}
                      className="btn-primary text-xs disabled:opacity-40"
                    >
                      {busy ? <Loader2 size={12} className="mr-1.5 animate-spin" /> : <Receipt size={12} className="mr-1.5" />}
                      Mark fulfilled &amp; paid
                    </button>
                    <button
                      onClick={() => { setRejecting(o); setReason(''); }}
                      disabled={busy}
                      className="text-xs px-3 py-2 rounded-lg border border-stone-200 text-stone-500 hover:border-red-300 hover:text-red-600 transition-colors disabled:opacity-40"
                    >
                      <X size={12} className="inline mr-1" /> Reject
                    </button>
                  </div>
                )}

                {o.status === 'FULFILLED' && (
                  <p className="mt-3 pt-3 border-t border-stone-100 text-[11px] text-emerald-700 font-semibold">
                    Recorded as a sale. Stock has been reduced.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {meta && meta.pages > 1 && (
        <div className="card flex items-center justify-between px-4 py-3">
          <p className="text-xs text-stone-500">
            Showing {(page - 1) * meta.limit + 1}–{Math.min(page * meta.limit, meta.total)} of {meta.total}
          </p>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="p-1.5 rounded hover:bg-stone-100 disabled:opacity-40"><ChevronLeft size={15} /></button>
            <span className="text-xs px-2">{page} / {meta.pages}</span>
            <button onClick={() => setPage(p => Math.min(meta.pages, p + 1))} disabled={page === meta.pages}
              className="p-1.5 rounded hover:bg-stone-100 disabled:opacity-40"><ChevronRight size={15} /></button>
          </div>
        </div>
      )}

      {/* Reject dialog */}
      {rejecting && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center z-50 p-4">
          <div className="card p-5 w-full max-w-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-stone-900">Reject order</h3>
              <button onClick={() => setRejecting(null)} className="text-stone-400 hover:text-stone-700">
                <X size={16} />
              </button>
            </div>
            <p className="text-xs text-stone-500 mb-3">
              {rejecting.orderNo} · {rejecting.buyerName}. Let them know why so they can try again.
            </p>
            <input className="input w-full" autoFocus placeholder="Out of stock, outside delivery area…"
              value={reason} onChange={e => setReason(e.target.value)} />
            <div className="flex gap-2 mt-4">
              <button className="btn-secondary flex-1 text-xs" onClick={() => setRejecting(null)}>Cancel</button>
              <button
                className="flex-1 text-xs py-2 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700 disabled:opacity-40"
                disabled={busyId === rejecting.id}
                onClick={() => act.mutate({ id: rejecting.id, action: 'reject', body: { reason } })}
              >
                Reject order
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
