import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Wrench, X, ChevronRight, Trash2, CheckCircle2, Clock, Package, AlertCircle } from 'lucide-react';
import { useForm, useFieldArray } from 'react-hook-form';
import api from '../../api/client';
import { format } from 'date-fns';

type JobStatus = 'OPEN' | 'IN_PROGRESS' | 'AWAITING_PARTS' | 'COMPLETED' | 'INVOICED';

interface Part { productId: string; quantity: number; unitCost: number; markup: number; product?: { name: string } }
interface WorkOrder {
  id: string; jobNo: string; customerId?: string; deviceDesc?: string;
  fault?: string; diagnosis?: string; status: JobStatus; technicianId?: string;
  labourHours: number; labourRate: number; partsTotal: number; totalAmount: number;
  serialNo?: string; createdAt: string;
  parts: Part[];
}
interface Product { id: string; name: string; sellingPrice: number; costPrice?: number }

const STATUS_META: Record<JobStatus, { label: string; color: string; icon: typeof Clock }> = {
  OPEN:           { label: 'Open',          color: 'bg-blue-100 text-blue-700',    icon: Clock },
  IN_PROGRESS:    { label: 'In Progress',   color: 'bg-amber-100 text-amber-700',  icon: Wrench },
  AWAITING_PARTS: { label: 'Awaiting Parts',color: 'bg-orange-100 text-orange-700',icon: Package },
  COMPLETED:      { label: 'Completed',     color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
  INVOICED:       { label: 'Invoiced',      color: 'bg-stone-100 text-stone-600',  icon: CheckCircle2 },
};

const STATUSES = Object.keys(STATUS_META) as JobStatus[];

const fmt = (n: number) => new Intl.NumberFormat('sw-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 0 }).format(n);

interface WOForm {
  deviceDesc: string; fault: string; serialNo: string;
  labourHours: number; labourRate: number;
  parts: { productId: string; quantity: number; unitCost: number; markup: number }[];
}

export default function WorkOrdersPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<JobStatus | ''>('');
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<WorkOrder | null>(null);
  const [statusUpdating, setStatusUpdating] = useState(false);

  const { data: orders = [] } = useQuery<WorkOrder[]>({
    queryKey: ['work-orders', filter, q],
    queryFn: () => api.get('/work-orders', { params: { status: filter || undefined, q: q || undefined } }).then(r => r.data.data),
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ['products-simple'],
    queryFn: () => api.get('/inventory/products').then(r => r.data.data),
  });

  const { register, control, handleSubmit, reset, watch } = useForm<WOForm>({
    defaultValues: { parts: [] },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'parts' });
  const watchedParts = watch('parts');
  const watchedLabHrs = watch('labourHours') ?? 0;
  const watchedLabRate = watch('labourRate') ?? 0;

  const partsTotal = watchedParts.reduce((s, p) => s + (Number(p.unitCost) * Number(p.quantity) * (1 + Number(p.markup || 0) / 100)), 0);
  const labourTotal = Number(watchedLabHrs) * Number(watchedLabRate);
  const grandTotal = partsTotal + labourTotal;

  const { mutate: createOrder, isPending: creating } = useMutation({
    mutationFn: (data: WOForm) => api.post('/work-orders', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['work-orders'] }); setShowCreate(false); reset(); },
  });

  const { mutate: updateStatus } = useMutation({
    mutationFn: ({ id, status }: { id: string; status: JobStatus }) => api.put(`/work-orders/${id}`, { status }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['work-orders'] });
      setSelected(res.data.data);
      setStatusUpdating(false);
    },
  });

  const { mutate: deleteOrder } = useMutation({
    mutationFn: (id: string) => api.delete(`/work-orders/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['work-orders'] }); setSelected(null); },
  });

  function onSubmit(data: WOForm) { createOrder(data); }

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      {/* Sidebar list */}
      <div className="w-80 border-r border-stone-200 flex flex-col bg-white flex-shrink-0">
        <div className="p-3 border-b border-stone-200 space-y-2">
          <div className="flex items-center justify-between">
            <h1 className="font-bold text-stone-900 flex items-center gap-2"><Wrench size={16} className="text-primary-600" /> Work Orders</h1>
            <button className="btn-primary py-1 px-2 text-xs flex items-center gap-1" onClick={() => setShowCreate(true)}>
              <Plus size={13} /> New
            </button>
          </div>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search job no, device…" className="input pl-7 w-full text-xs py-1.5" />
          </div>
          <div className="flex flex-wrap gap-1">
            <button onClick={() => setFilter('')} className={`text-[10px] px-2 py-0.5 rounded-full border ${!filter ? 'bg-stone-900 text-white border-stone-900' : 'border-stone-200 text-stone-600'}`}>All</button>
            {STATUSES.map(s => (
              <button key={s} onClick={() => setFilter(s)} className={`text-[10px] px-2 py-0.5 rounded-full border ${filter === s ? 'bg-stone-900 text-white border-stone-900' : 'border-stone-200 text-stone-600'}`}>
                {STATUS_META[s].label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-stone-100">
          {orders.length === 0 && <p className="text-xs text-stone-400 text-center py-8">No work orders found</p>}
          {orders.map(o => {
            const meta = STATUS_META[o.status];
            return (
              <button key={o.id} onClick={() => setSelected(o)} className={`w-full text-left px-3 py-3 hover:bg-stone-50 flex items-start gap-3 ${selected?.id === o.id ? 'bg-primary-50' : ''}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-xs font-bold text-stone-900">{o.jobNo}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${meta.color}`}>{meta.label}</span>
                  </div>
                  <p className="text-xs text-stone-600 truncate">{o.deviceDesc || '—'}</p>
                  <p className="text-[10px] text-stone-400">{format(new Date(o.createdAt), 'MMM d')}</p>
                </div>
                <ChevronRight size={13} className="text-stone-300 mt-1 flex-shrink-0" />
              </button>
            );
          })}
        </div>
      </div>

      {/* Detail pane */}
      <div className="flex-1 overflow-y-auto bg-stone-50 p-6">
        {!selected && (
          <div className="flex flex-col items-center justify-center h-full text-stone-300">
            <Wrench size={40} className="mb-3" />
            <p className="text-sm">Select a work order</p>
          </div>
        )}
        {selected && (
          <div className="max-w-2xl space-y-5">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold text-stone-900">{selected.jobNo}</h2>
                <p className="text-xs text-stone-500">{format(new Date(selected.createdAt), 'PPP')}</p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={selected.status}
                  onChange={e => { setStatusUpdating(true); updateStatus({ id: selected.id, status: e.target.value as JobStatus }); }}
                  disabled={statusUpdating}
                  className="input text-xs py-1"
                >
                  {STATUSES.map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                </select>
                <button onClick={() => { if (confirm('Delete this work order?')) deleteOrder(selected.id); }} className="text-stone-400 hover:text-red-500">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            {/* Info cards */}
            <div className="grid grid-cols-2 gap-4">
              <div className="card p-4">
                <p className="text-[10px] text-stone-400 uppercase tracking-wide mb-2">Device</p>
                <p className="text-sm font-medium text-stone-900">{selected.deviceDesc || '—'}</p>
                {selected.serialNo && <p className="text-xs text-stone-500">S/N: {selected.serialNo}</p>}
              </div>
              <div className="card p-4">
                <p className="text-[10px] text-stone-400 uppercase tracking-wide mb-2">Fault Reported</p>
                <p className="text-sm text-stone-900">{selected.fault || '—'}</p>
              </div>
              {selected.diagnosis && (
                <div className="card p-4 col-span-2">
                  <p className="text-[10px] text-stone-400 uppercase tracking-wide mb-2">Diagnosis</p>
                  <p className="text-sm text-stone-900">{selected.diagnosis}</p>
                </div>
              )}
            </div>

            {/* Parts */}
            {selected.parts.length > 0 && (
              <div className="card p-4">
                <p className="text-[10px] text-stone-400 uppercase tracking-wide mb-3">Parts Used</p>
                <div className="space-y-2">
                  {selected.parts.map((p, i) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="text-stone-700">{p.product?.name || p.productId} × {p.quantity}</span>
                      <span className="text-stone-900 font-medium">{fmt(p.unitCost * p.quantity * (1 + (p.markup || 0) / 100))}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Totals */}
            <div className="card p-4">
              <p className="text-[10px] text-stone-400 uppercase tracking-wide mb-3">Invoice Summary</p>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between"><span className="text-stone-500">Labour ({selected.labourHours}h × {fmt(selected.labourRate)})</span><span>{fmt(selected.labourHours * selected.labourRate)}</span></div>
                <div className="flex justify-between"><span className="text-stone-500">Parts</span><span>{fmt(selected.partsTotal)}</span></div>
                <div className="flex justify-between font-bold text-sm pt-2 border-t border-stone-100"><span>Total</span><span className="text-primary-700">{fmt(selected.totalAmount)}</span></div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-xl max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-stone-900">New Work Order</h3>
              <button onClick={() => { setShowCreate(false); reset(); }} className="text-stone-400 hover:text-stone-700"><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="label">Device / Item Description</label>
                  <input {...register('deviceDesc')} className="input w-full" placeholder="e.g. Samsung Galaxy S22" />
                </div>
                <div>
                  <label className="label">Serial Number</label>
                  <input {...register('serialNo')} className="input w-full" placeholder="Optional" />
                </div>
                <div>
                  <label className="label">Fault Reported *</label>
                  <input {...register('fault', { required: true })} className="input w-full" placeholder="e.g. Screen cracked" />
                </div>
                <div>
                  <label className="label">Labour Hours</label>
                  <input {...register('labourHours')} type="number" step="0.5" className="input w-full" placeholder="0" />
                </div>
                <div>
                  <label className="label">Labour Rate (TZS/hr)</label>
                  <input {...register('labourRate')} type="number" className="input w-full" placeholder="0" />
                </div>
              </div>

              {/* Parts */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="label mb-0">Parts / Components</label>
                  <button type="button" className="text-xs text-primary-600 hover:text-primary-800 flex items-center gap-1" onClick={() => append({ productId: '', quantity: 1, unitCost: 0, markup: 0 })}>
                    <Plus size={12} /> Add Part
                  </button>
                </div>
                <div className="space-y-2">
                  {fields.map((f, i) => (
                    <div key={f.id} className="flex gap-2 items-start">
                      <select {...register(`parts.${i}.productId`)} className="input flex-1 text-xs" onChange={e => {
                        const p = products.find(pr => pr.id === e.target.value);
                        if (p) {
                          const el = document.querySelector(`[name="parts.${i}.unitCost"]`) as HTMLInputElement;
                          if (el) el.value = String(p.costPrice ?? p.sellingPrice);
                        }
                      }}>
                        <option value="">Select product…</option>
                        {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                      <input {...register(`parts.${i}.quantity`)} type="number" step="1" className="input w-14 text-xs" placeholder="Qty" />
                      <input {...register(`parts.${i}.unitCost`)} type="number" className="input w-20 text-xs" placeholder="Cost" />
                      <input {...register(`parts.${i}.markup`)} type="number" className="input w-14 text-xs" placeholder="Mark%" />
                      <button type="button" onClick={() => remove(i)} className="text-stone-400 hover:text-red-500 mt-2"><X size={13} /></button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Summary */}
              <div className="bg-stone-50 rounded-lg px-4 py-3 text-xs">
                <div className="flex justify-between"><span className="text-stone-500">Labour</span><span>{fmt(labourTotal)}</span></div>
                <div className="flex justify-between"><span className="text-stone-500">Parts</span><span>{fmt(partsTotal)}</span></div>
                <div className="flex justify-between font-bold text-sm mt-1 pt-1 border-t border-stone-200"><span>Total</span><span>{fmt(grandTotal)}</span></div>
              </div>

              <div className="flex gap-3">
                <button type="button" className="btn-secondary flex-1" onClick={() => { setShowCreate(false); reset(); }}>Cancel</button>
                <button type="submit" className="btn-primary flex-1" disabled={creating}>{creating ? 'Creating…' : 'Create Work Order'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
