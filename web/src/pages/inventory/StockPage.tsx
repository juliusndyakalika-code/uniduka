import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowUpDown, Plus, Search, X } from 'lucide-react';
import { useForm } from 'react-hook-form';
import api from '../../api/client';
import { useAuthStore } from '../../store/authStore';

interface Movement {
  id: string; type: string; qty: number; reason?: string;
  product: { name: string; sku: string; unit: string };
  createdAt: string; user?: { fullName: string };
}
interface AdjustForm { productId: string; qty: number; reason: string; type: 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT'; }

export default function StockPage() {
  const { shopId } = useAuthStore();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [showAdj, setShowAdj] = useState(false);
  const [error, setError] = useState('');

  const { register, handleSubmit, reset } = useForm<AdjustForm>({ defaultValues: { type: 'ADJUSTMENT_IN' } });

  const { data: movements = [], isLoading } = useQuery<Movement[]>({
    queryKey: ['stock-movements', shopId, search],
    queryFn: () => api.get('/inventory/stock/movements', { params: { search } }).then(r => r.data.data),
    enabled: !!shopId,
  });

  const { data: products = [] } = useQuery<{ id: string; name: string; sku: string }[]>({
    queryKey: ['products-min', shopId],
    queryFn: () => api.get('/inventory/products', { params: { limit: 500 } }).then(r => r.data.data),
    enabled: !!shopId,
  });

  const { mutate: adjust, isPending } = useMutation({
    mutationFn: (d: AdjustForm) => api.post('/inventory/stock/adjust', d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['stock-movements'] }); setShowAdj(false); reset(); },
    onError: (e: unknown) => setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed'),
  });

  const MOVEMENT_COLORS: Record<string, string> = {
    SALE: 'badge-red',
    PURCHASE_RECEIPT: 'badge-green',
    ADJUSTMENT_IN: 'badge-blue',
    ADJUSTMENT_OUT: 'badge-amber',
    TRANSFER_IN: 'badge-duka',
    TRANSFER_OUT: 'badge-stone',
    OPENING: 'badge-stone',
  };

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div>
          <h1 className="page-title">Stock Movements</h1>
          <p className="page-subtitle">Inventory ledger</p>
        </div>
        <button className="btn-primary" onClick={() => { setError(''); setShowAdj(true); }}>
          <Plus size={14} className="mr-1.5" /> Adjust Stock
        </button>
      </div>

      <div className="relative">
        <Search size={14} className="absolute left-3 top-3 text-stone-400" />
        <input className="input pl-8" placeholder="Filter by product…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="card">
        {isLoading ? (
          <div className="p-8 text-center text-stone-400">Loading…</div>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th><ArrowUpDown size={12} className="inline mr-1" />Type</th>
                  <th>Product</th>
                  <th>Qty</th>
                  <th>Reason</th>
                  <th>By</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {movements.map(m => (
                  <tr key={m.id}>
                    <td><span className={`badge ${MOVEMENT_COLORS[m.type] ?? 'badge-stone'}`}>{m.type.replace(/_/g, ' ')}</span></td>
                    <td>
                      <p className="font-medium text-stone-900">{m.product.name}</p>
                      <p className="text-xs text-stone-400 font-mono">{m.product.sku}</p>
                    </td>
                    <td className={`font-mono font-medium ${m.type.includes('OUT') || m.type === 'SALE' ? 'text-red-600' : 'text-green-600'}`}>
                      {m.type.includes('OUT') || m.type === 'SALE' ? '-' : '+'}{Math.abs(m.qty)} {m.product.unit}
                    </td>
                    <td className="text-stone-400 text-xs">{m.reason || '—'}</td>
                    <td className="text-stone-400 text-xs">{m.user?.fullName || '—'}</td>
                    <td className="text-stone-400 text-xs">
                      {new Date(m.createdAt).toLocaleDateString('sw-TZ')}
                    </td>
                  </tr>
                ))}
                {movements.length === 0 && (
                  <tr><td colSpan={6} className="text-center text-stone-400 py-8">No movements found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
                <label className="label">Product</label>
                <select {...register('productId', { required: true })} className="select">
                  <option value="">Select product…</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                </select>
              </div>
              <div>
                <label className="label">Direction</label>
                <select {...register('type')} className="select">
                  <option value="ADJUSTMENT_IN">Add stock (+)</option>
                  <option value="ADJUSTMENT_OUT">Remove stock (−)</option>
                </select>
              </div>
              <div>
                <label className="label">Quantity</label>
                <input {...register('qty', { required: true, valueAsNumber: true, min: 1 })} type="number" min={1} className="input" placeholder="1" />
              </div>
              <div>
                <label className="label">Reason</label>
                <input {...register('reason', { required: true })} className="input" placeholder="Damage, count correction…" />
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
