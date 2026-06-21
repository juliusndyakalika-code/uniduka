import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowUpDown, Plus, Search, X, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { format } from 'date-fns';
import api from '../../api/client';
import { useAuthStore } from '../../store/authStore';

interface Movement {
  id: string; type: string; quantity: number; note?: string;
  product: { name: string; sku: string; unit: string };
  user?: { fullName: string } | null;
  createdAt: string;
}
interface Meta { total: number; page: number; limit: number; pages: number }
interface AdjustForm { productId: string; qty: number; reason: string; type: 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT'; }

const TYPE_BADGE: Record<string, string> = {
  SALE:             'bg-red-100 text-red-700',
  PURCHASE:         'bg-emerald-100 text-emerald-700',
  ADJUSTMENT:       'bg-blue-100 text-blue-700',
  TRANSFER_IN:      'bg-violet-100 text-violet-700',
  TRANSFER_OUT:     'bg-orange-100 text-orange-700',
  RETURN:           'bg-amber-100 text-amber-700',
  WASTE:            'bg-stone-100 text-stone-600',
  RECIPE_DEDUCTION: 'bg-pink-100 text-pink-700',
};

function typeLabel(type: string) {
  return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function downloadCsv(rows: Movement[]) {
  const headers = ['Date', 'Type', 'Product', 'SKU', 'Qty', 'Unit', 'Note', 'By'];
  const lines = rows.map(m => [
    format(new Date(m.createdAt), 'yyyy-MM-dd HH:mm'),
    m.type,
    m.product.name,
    m.product.sku,
    m.quantity,
    m.product.unit,
    m.note || '',
    m.user?.fullName || '',
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
  const csv = [headers.join(','), ...lines].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `stock-movements-${format(new Date(), 'yyyy-MM-dd')}.csv`;
  a.click();
}

export default function StockPage() {
  const { shopId } = useAuthStore();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showAdj, setShowAdj] = useState(false);
  const [error, setError] = useState('');

  const { register, handleSubmit, reset } = useForm<AdjustForm>({ defaultValues: { type: 'ADJUSTMENT_IN' } });

  const { data, isLoading } = useQuery<{ data: Movement[]; meta: Meta }>({
    queryKey: ['stock-movements', shopId, search, page],
    queryFn: () =>
      api.get('/inventory/movements', { params: { search: search || undefined, page, limit: 50 } })
        .then(r => ({ data: r.data.data, meta: r.data.meta })),
    enabled: !!shopId,
    placeholderData: prev => prev,
  });

  const movements = data?.data ?? [];
  const meta = data?.meta;

  const { data: products = [] } = useQuery<{ id: string; name: string; sku: string }[]>({
    queryKey: ['products-min', shopId],
    queryFn: () => api.get('/inventory/products', { params: { limit: 500 } }).then(r => r.data.data),
    enabled: !!shopId,
  });

  const { mutate: adjust, isPending } = useMutation({
    mutationFn: (d: AdjustForm) => api.post('/inventory/stock/adjust', d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock-movements'] });
      setShowAdj(false);
      reset();
      setPage(1);
    },
    onError: (e: unknown) => setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed'),
  });

  // Export all matching movements (fetch without pagination)
  async function handleExport() {
    const res = await api.get('/inventory/movements', { params: { search: search || undefined, limit: 5000 } });
    downloadCsv(res.data.data);
  }

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div>
          <h1 className="page-title">Stock Movements</h1>
          <p className="page-subtitle">
            {meta ? `${meta.total.toLocaleString()} total movements` : 'Inventory ledger'}
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={handleExport}>
            <Download size={14} className="mr-1.5" /> Export CSV
          </button>
          <button className="btn-primary" onClick={() => { setError(''); setShowAdj(true); }}>
            <Plus size={14} className="mr-1.5" /> Adjust Stock
          </button>
        </div>
      </div>

      <div className="relative">
        <Search size={14} className="absolute left-3 top-3 text-stone-400" />
        <input
          className="input pl-8"
          placeholder="Search by product name…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
        />
      </div>

      <div className="card">
        {isLoading ? (
          <div className="p-8 text-center text-stone-400">Loading…</div>
        ) : (
          <>
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Product</th>
                    <th>Qty</th>
                    <th>Note</th>
                    <th>By</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map(m => (
                    <tr key={m.id}>
                      <td>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${TYPE_BADGE[m.type] ?? 'bg-stone-100 text-stone-600'}`}>
                          {typeLabel(m.type)}
                        </span>
                      </td>
                      <td>
                        <p className="font-medium text-stone-900">{m.product.name}</p>
                        <p className="text-xs text-stone-400 font-mono">{m.product.sku}</p>
                      </td>
                      <td className={`font-mono font-semibold ${m.quantity < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        {m.quantity > 0 ? '+' : ''}{m.quantity} <span className="font-normal text-stone-400">{m.product.unit}</span>
                      </td>
                      <td className="text-stone-500 text-xs max-w-[160px] truncate">{m.note || '—'}</td>
                      <td className="text-stone-600 text-xs">{m.user?.fullName || '—'}</td>
                      <td className="text-stone-500 text-xs whitespace-nowrap">
                        {format(new Date(m.createdAt), 'MMM d, yyyy')}
                        <span className="text-stone-400 ml-1">{format(new Date(m.createdAt), 'HH:mm')}</span>
                      </td>
                    </tr>
                  ))}
                  {movements.length === 0 && (
                    <tr><td colSpan={6} className="text-center text-stone-400 py-10">No movements found</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {meta && meta.pages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-stone-100">
                <p className="text-xs text-stone-500">
                  Showing {(page - 1) * meta.limit + 1}–{Math.min(page * meta.limit, meta.total)} of {meta.total.toLocaleString()}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-1.5 rounded hover:bg-stone-100 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft size={15} />
                  </button>
                  {Array.from({ length: Math.min(meta.pages, 7) }, (_, i) => {
                    const p = meta.pages <= 7 ? i + 1
                      : page <= 4 ? i + 1
                      : page >= meta.pages - 3 ? meta.pages - 6 + i
                      : page - 3 + i;
                    return (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        className={`w-7 h-7 text-xs rounded ${p === page ? 'bg-primary-600 text-white' : 'hover:bg-stone-100 text-stone-600'}`}
                      >
                        {p}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setPage(p => Math.min(meta.pages, p + 1))}
                    disabled={page === meta.pages}
                    className="p-1.5 rounded hover:bg-stone-100 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ChevronRight size={15} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Adjust Stock modal */}
      {showAdj && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card p-6 w-full max-w-sm">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold text-stone-900">Stock Adjustment</h3>
              <button onClick={() => setShowAdj(false)} className="text-stone-400 hover:text-stone-700"><X size={18} /></button>
            </div>
            {error && <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">{error}</div>}
            <form onSubmit={handleSubmit(d => adjust(d))} className="space-y-4">
              <div>
                <label className="label">Product *</label>
                <select {...register('productId', { required: true })} className="select w-full">
                  <option value="">Select product…</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                </select>
              </div>
              <div>
                <label className="label">Direction *</label>
                <select {...register('type')} className="select w-full">
                  <option value="ADJUSTMENT_IN">Add stock (+)</option>
                  <option value="ADJUSTMENT_OUT">Remove stock (−)</option>
                </select>
              </div>
              <div>
                <label className="label">Quantity *</label>
                <input {...register('qty', { required: true, valueAsNumber: true, min: 1 })} type="number" min={1} className="input w-full" placeholder="1" />
              </div>
              <div>
                <label className="label">Reason *</label>
                <input {...register('reason', { required: true })} className="input w-full" placeholder="Damage, count correction, theft…" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" className="btn-secondary flex-1" onClick={() => setShowAdj(false)}>Cancel</button>
                <button type="submit" disabled={isPending} className="btn-primary flex-1">{isPending ? 'Saving…' : 'Adjust'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
