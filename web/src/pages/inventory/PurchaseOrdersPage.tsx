import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X, ChevronRight, CheckCircle, Truck } from 'lucide-react';
import { useForm, useFieldArray } from 'react-hook-form';
import api from '../../api/client';
import { useAuthStore } from '../../store/authStore';

interface POLine { productId: string; qty: number; unitCost: number; }
interface PO { id: string; poNumber: string; status: string; total: number; supplier: { name: string }; lines: (POLine & { product: { name: string } })[]; createdAt: string; expectedDate?: string; }
interface Form { supplierId: string; expectedDate?: string; notes?: string; lines: POLine[]; }

const STATUS_BADGE: Record<string, string> = {
  DRAFT: 'badge-stone', SENT: 'badge-blue', PARTIALLY_RECEIVED: 'badge-amber', RECEIVED: 'badge-green', CANCELLED: 'badge-red',
};

function fmt(n: number) {
  return new Intl.NumberFormat('sw-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 0 }).format(n);
}

export default function PurchaseOrdersPage() {
  const { shopId } = useAuthStore();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');

  const { register, handleSubmit, control, reset } = useForm<Form>({
    defaultValues: { lines: [{ productId: '', qty: 1, unitCost: 0 }] },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'lines' });

  const { data: orders = [], isLoading } = useQuery<PO[]>({
    queryKey: ['purchase-orders', shopId],
    queryFn: () => api.get('/inventory/purchase-orders').then(r => r.data.data),
    enabled: !!shopId,
  });

  const { data: suppliers = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['suppliers', shopId],
    queryFn: () => api.get('/inventory/suppliers').then(r => r.data.data),
    enabled: !!shopId,
  });

  const { data: products = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['products-min', shopId],
    queryFn: () => api.get('/inventory/products', { params: { limit: 200 } }).then(r => r.data.data.items),
    enabled: !!shopId,
  });

  const { mutate: create, isPending } = useMutation({
    mutationFn: (d: Form) => api.post('/inventory/purchase-orders', d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['purchase-orders'] }); setShowForm(false); reset(); },
    onError: (e: unknown) => setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed'),
  });

  const { mutate: receive } = useMutation({
    mutationFn: (id: string) => api.post(`/inventory/purchase-orders/${id}/receive`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['purchase-orders'] }),
  });

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div>
          <h1 className="page-title">Purchase Orders</h1>
          <p className="page-subtitle">{orders.length} orders</p>
        </div>
        <button className="btn-primary" onClick={() => { setError(''); setShowForm(true); }}>
          <Plus size={14} className="mr-1.5" /> New PO
        </button>
      </div>

      <div className="card">
        {isLoading ? (
          <div className="p-8 text-center text-stone-400">Loading…</div>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>PO Number</th>
                  <th>Supplier</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Expected</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {orders.map(po => (
                  <tr key={po.id}>
                    <td className="font-mono text-xs">{po.poNumber}</td>
                    <td className="font-medium">{po.supplier.name}</td>
                    <td>{fmt(po.total)}</td>
                    <td><span className={`badge ${STATUS_BADGE[po.status] ?? 'badge-stone'}`}>{po.status}</span></td>
                    <td className="text-stone-400 text-xs">
                      {po.expectedDate ? new Date(po.expectedDate).toLocaleDateString('sw-TZ') : '—'}
                    </td>
                    <td>
                      {(po.status === 'SENT' || po.status === 'DRAFT') && (
                        <button
                          onClick={() => { if (confirm('Mark as received?')) receive(po.id); }}
                          className="flex items-center gap-1 text-xs text-duka-600 hover:underline"
                        >
                          <Truck size={12} /> Receive
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {orders.length === 0 && (
                  <tr><td colSpan={6} className="text-center text-stone-400 py-8">No purchase orders yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold text-stone-900">New Purchase Order</h3>
              <button onClick={() => setShowForm(false)} className="text-stone-400 hover:text-stone-700"><X size={18} /></button>
            </div>
            {error && <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">{error}</div>}
            <form onSubmit={handleSubmit(d => create(d))} className="space-y-4">
              <div>
                <label className="label">Supplier</label>
                <select {...register('supplierId', { required: true })} className="select">
                  <option value="">Select supplier…</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Expected Date</label>
                <input {...register('expectedDate')} type="date" className="input" />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="label mb-0">Line Items</label>
                  <button type="button" onClick={() => append({ productId: '', qty: 1, unitCost: 0 })} className="text-xs text-primary-600 hover:underline">+ Add line</button>
                </div>
                <div className="space-y-2">
                  {fields.map((field, idx) => (
                    <div key={field.id} className="grid grid-cols-7 gap-2 items-center">
                      <div className="col-span-3">
                        <select {...register(`lines.${idx}.productId`, { required: true })} className="select text-xs">
                          <option value="">Product…</option>
                          {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </div>
                      <div className="col-span-1">
                        <input {...register(`lines.${idx}.qty`, { required: true, valueAsNumber: true })} type="number" min={1} className="input text-xs" placeholder="qty" />
                      </div>
                      <div className="col-span-2">
                        <input {...register(`lines.${idx}.unitCost`, { required: true, valueAsNumber: true })} type="number" step="0.01" className="input text-xs" placeholder="unit cost" />
                      </div>
                      <button type="button" onClick={() => remove(idx)} className="text-red-400 hover:text-red-600 text-center"><X size={14} /></button>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="label">Notes</label>
                <textarea {...register('notes')} className="input" rows={2} placeholder="Optional notes…" />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" className="btn-secondary flex-1" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" disabled={isPending} className="btn-primary flex-1">{isPending ? 'Creating…' : 'Create PO'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
