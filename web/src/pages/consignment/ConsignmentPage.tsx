import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X, Users, Package, AlertCircle, CheckCircle, Clock, TrendingDown } from 'lucide-react';
import { useForm } from 'react-hook-form';
import api from '../../api/client';
import { useAuthStore } from '../../store/authStore';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Partner { id: string; name: string; phone?: string; email?: string; notes?: string; }
interface Batch {
  id: string; productName: string; costPrice: number; sellingPrice: number;
  qtyReceived: number; qtySold: number; qtyRemaining: number;
  totalOwed: number; settledAmount: number; settledQty: number; outstanding: number;
  status: 'ACTIVE' | 'PARTIAL' | 'SETTLED'; receivedAt: string; notes?: string;
  partner: { id: string; name: string };
  settlements: { qtySold: number; amountPaid: number }[];
}
interface Liability {
  partnerId: string; partnerName: string; phone?: string;
  totalOwed: number; totalPaid: number; outstanding: number; batches: number;
}
interface Settlement {
  id: string; qtySold: number; amountOwed: number; amountPaid: number;
  paidAt: string; notes?: string;
  batch: { productName: string; partner: { name: string } };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TABS = ['Batches', 'Partners', 'Liability', 'Settlements'] as const;
type Tab = typeof TABS[number];

const STATUS_BADGE: Record<string, string> = {
  ACTIVE: 'badge-blue', PARTIAL: 'badge-amber', SETTLED: 'badge-green',
};

function fmt(n: number) {
  return new Intl.NumberFormat('sw-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 0 }).format(n);
}
function date(s: string) { return new Date(s).toLocaleDateString('en-TZ', { day: '2-digit', month: 'short', year: 'numeric' }); }

// ── Forms ─────────────────────────────────────────────────────────────────────

type PartnerForm = { name: string; phone?: string; email?: string; notes?: string; };
type BatchForm = { partnerId: string; productName: string; costPrice: number; sellingPrice: number; qtyReceived: number; notes?: string; receivedAt?: string; };
type SettleForm = { qtySold: number; amountPaid: number; notes?: string; paidAt?: string; };
type SoldForm = { qtySold: number; };

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ConsignmentPage() {
  const { shopId } = useAuthStore();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('Batches');
  const [error, setError] = useState('');

  // modal state
  const [showPartnerForm, setShowPartnerForm] = useState(false);
  const [showBatchForm, setShowBatchForm] = useState(false);
  const [settlingBatch, setSettlingBatch] = useState<Batch | null>(null);
  const [markingSoldBatch, setMarkingSoldBatch] = useState<Batch | null>(null);

  function err(e: unknown) {
    return (e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Something went wrong';
  }

  // ── Queries ──────────────────────────────────────────────────────────────────

  const { data: partners = [] } = useQuery<Partner[]>({
    queryKey: ['consignment-partners', shopId],
    queryFn: () => api.get('/consignment/partners').then(r => r.data.data),
    enabled: !!shopId,
  });

  const { data: batches = [], isLoading: batchLoading } = useQuery<Batch[]>({
    queryKey: ['consignment-batches', shopId],
    queryFn: () => api.get('/consignment/batches').then(r => r.data.data),
    enabled: !!shopId,
  });

  const { data: liability = [] } = useQuery<Liability[]>({
    queryKey: ['consignment-liability', shopId],
    queryFn: () => api.get('/consignment/liability').then(r => r.data.data),
    enabled: !!shopId && tab === 'Liability',
  });

  const { data: settlements = [], isLoading: settleLoading } = useQuery<Settlement[]>({
    queryKey: ['consignment-settlements', shopId],
    queryFn: () => api.get('/consignment/settlements').then(r => r.data.data),
    enabled: !!shopId && tab === 'Settlements',
  });

  // ── Mutations ─────────────────────────────────────────────────────────────────

  const partnerForm = useForm<PartnerForm>();
  const { mutate: savePartner, isPending: savingPartner } = useMutation({
    mutationFn: (d: PartnerForm) => api.post('/consignment/partners', d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['consignment-partners'] }); setShowPartnerForm(false); partnerForm.reset(); setError(''); },
    onError: (e) => setError(err(e)),
  });

  const batchForm = useForm<BatchForm>();
  const { mutate: saveBatch, isPending: savingBatch } = useMutation({
    mutationFn: (d: BatchForm) => api.post('/consignment/batches', d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['consignment-batches'] }); setShowBatchForm(false); batchForm.reset(); setError(''); },
    onError: (e) => setError(err(e)),
  });

  const settleForm = useForm<SettleForm>();
  const { mutate: settle, isPending: settling } = useMutation({
    mutationFn: (d: SettleForm & { batchId: string }) => api.post('/consignment/settlements', d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['consignment-batches'] });
      qc.invalidateQueries({ queryKey: ['consignment-settlements'] });
      qc.invalidateQueries({ queryKey: ['consignment-liability'] });
      setSettlingBatch(null); settleForm.reset(); setError('');
    },
    onError: (e) => setError(err(e)),
  });

  const soldForm = useForm<SoldForm>();
  const { mutate: markSold, isPending: markingSold } = useMutation({
    mutationFn: (d: SoldForm & { batchId: string }) => api.patch(`/consignment/batches/${d.batchId}/sold`, { qtySold: d.qtySold }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['consignment-batches'] }); setMarkingSoldBatch(null); soldForm.reset(); setError(''); },
    onError: (e) => setError(err(e)),
  });

  // ── Summary stats ─────────────────────────────────────────────────────────────

  const totalOutstanding = batches.reduce((s, b) => s + b.outstanding, 0);
  const activeBatches = batches.filter(b => b.status !== 'SETTLED').length;
  const totalProfit = batches.reduce((s, b) => s + (b.qtySold * (b.sellingPrice - b.costPrice)), 0);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Consignment</h1>
          <p className="page-subtitle">Goods taken on behalf — track, sell, settle</p>
        </div>
        <div className="flex gap-2">
          {tab === 'Partners' && (
            <button className="btn-primary" onClick={() => { setError(''); setShowPartnerForm(true); }}>
              <Plus size={14} className="mr-1.5" /> Add Partner
            </button>
          )}
          {tab === 'Batches' && (
            <button className="btn-primary" onClick={() => { setError(''); setShowBatchForm(true); }}>
              <Plus size={14} className="mr-1.5" /> Receive Batch
            </button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card p-4">
          <p className="text-xs text-stone-500 mb-1">Outstanding Liability</p>
          <p className="text-xl font-bold text-red-600">{fmt(totalOutstanding)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-stone-500 mb-1">Active Batches</p>
          <p className="text-xl font-bold text-stone-800">{activeBatches}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-stone-500 mb-1">Markup Earned</p>
          <p className="text-xl font-bold text-green-600">{fmt(totalProfit)}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-stone-200">
        <div className="flex gap-0">
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => { setTab(t); setError(''); }}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === t
                  ? 'border-primary-600 text-primary-700'
                  : 'border-transparent text-stone-500 hover:text-stone-700'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded-lg">
          <AlertCircle size={14} /> {error}
          <button onClick={() => setError('')} className="ml-auto"><X size={12} /></button>
        </div>
      )}

      {/* ── Batches Tab ───────────────────────────────────────────────────────── */}
      {tab === 'Batches' && (
        <div className="card">
          {batchLoading ? (
            <div className="p-8 text-center text-stone-400">Loading…</div>
          ) : batches.length === 0 ? (
            <div className="p-10 text-center text-stone-400">
              <Package size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">No batches yet — receive your first consignment batch</p>
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Partner</th>
                    <th>Received</th>
                    <th>Cost / Sell</th>
                    <th>Qty In / Sold / Left</th>
                    <th>Outstanding</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map(b => (
                    <tr key={b.id}>
                      <td className="font-medium">{b.productName}</td>
                      <td className="text-stone-500">{b.partner.name}</td>
                      <td className="text-stone-400">{date(b.receivedAt)}</td>
                      <td>
                        <span className="text-xs text-stone-500">{fmt(b.costPrice)}</span>
                        <span className="mx-1 text-stone-300">/</span>
                        <span className="text-xs font-medium">{fmt(b.sellingPrice)}</span>
                      </td>
                      <td>
                        <span className="text-xs">{b.qtyReceived} / </span>
                        <span className="text-xs font-semibold text-amber-600">{b.qtySold}</span>
                        <span className="text-xs"> / {b.qtyRemaining}</span>
                      </td>
                      <td className={b.outstanding > 0 ? 'font-semibold text-red-600' : 'text-stone-400'}>
                        {fmt(b.outstanding)}
                      </td>
                      <td>
                        <span className={`badge ${STATUS_BADGE[b.status]}`}>{b.status}</span>
                      </td>
                      <td>
                        <div className="flex gap-1">
                          <button
                            className="btn-sm btn-ghost"
                            onClick={() => { soldForm.setValue('qtySold', b.qtySold); setMarkingSoldBatch(b); setError(''); }}
                          >
                            Mark Sold
                          </button>
                          {b.status !== 'SETTLED' && (
                            <button
                              className="btn-sm btn-primary"
                              onClick={() => { settleForm.reset(); setSettlingBatch(b); setError(''); }}
                            >
                              Settle
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Partners Tab ──────────────────────────────────────────────────────── */}
      {tab === 'Partners' && (
        <div className="card">
          {partners.length === 0 ? (
            <div className="p-10 text-center text-stone-400">
              <Users size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">No partners yet — add the first consignor</p>
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr><th>Name</th><th>Phone</th><th>Email</th></tr>
                </thead>
                <tbody>
                  {partners.map(p => (
                    <tr key={p.id}>
                      <td className="font-medium">{p.name}</td>
                      <td className="text-stone-500">{p.phone || '—'}</td>
                      <td className="text-stone-500">{p.email || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Liability Tab ─────────────────────────────────────────────────────── */}
      {tab === 'Liability' && (
        <div className="space-y-3">
          {liability.length === 0 ? (
            <div className="card p-10 text-center text-stone-400">
              <CheckCircle size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">No outstanding liability</p>
            </div>
          ) : (
            liability.map(l => (
              <div key={l.partnerId} className="card p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-stone-900">{l.partnerName}</p>
                    {l.phone && <p className="text-xs text-stone-400">{l.phone}</p>}
                    <p className="text-xs text-stone-400 mt-0.5">{l.batches} active batch{l.batches !== 1 ? 'es' : ''}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-stone-400">Outstanding</p>
                    <p className="text-lg font-bold text-red-600">{fmt(l.outstanding)}</p>
                    <p className="text-[10px] text-stone-400">Owed {fmt(l.totalOwed)} · Paid {fmt(l.totalPaid)}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Settlements Tab ───────────────────────────────────────────────────── */}
      {tab === 'Settlements' && (
        <div className="card">
          {settleLoading ? (
            <div className="p-8 text-center text-stone-400">Loading…</div>
          ) : settlements.length === 0 ? (
            <div className="p-10 text-center text-stone-400">
              <Clock size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">No settlements recorded yet</p>
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr><th>Partner</th><th>Product</th><th>Qty Settled</th><th>Owed</th><th>Paid</th><th>Date</th></tr>
                </thead>
                <tbody>
                  {settlements.map(s => (
                    <tr key={s.id}>
                      <td className="font-medium">{s.batch.partner.name}</td>
                      <td className="text-stone-600">{s.batch.productName}</td>
                      <td>{s.qtySold}</td>
                      <td>{fmt(s.amountOwed)}</td>
                      <td className="font-medium">{fmt(s.amountPaid)}</td>
                      <td className="text-stone-400">{date(s.paidAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Modal: Add Partner ───────────────────────────────────────────────── */}
      {showPartnerForm && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">New Consignment Partner</h2>
              <button onClick={() => { setShowPartnerForm(false); setError(''); }} className="modal-close"><X size={16} /></button>
            </div>
            <form onSubmit={partnerForm.handleSubmit(d => savePartner(d))} className="space-y-3 p-4">
              <div>
                <label className="label">Name *</label>
                <input className="input" {...partnerForm.register('name', { required: true })} placeholder="Partner / business name" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Phone</label>
                  <input className="input" {...partnerForm.register('phone')} placeholder="+255…" />
                </div>
                <div>
                  <label className="label">Email</label>
                  <input className="input" type="email" {...partnerForm.register('email')} />
                </div>
              </div>
              <div>
                <label className="label">Notes</label>
                <textarea className="input" rows={2} {...partnerForm.register('notes')} />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" className="btn-ghost" onClick={() => { setShowPartnerForm(false); setError(''); }}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={savingPartner}>
                  {savingPartner ? 'Saving…' : 'Save Partner'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Receive Batch ─────────────────────────────────────────────── */}
      {showBatchForm && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">Receive Consignment Batch</h2>
              <button onClick={() => { setShowBatchForm(false); setError(''); }} className="modal-close"><X size={16} /></button>
            </div>
            <form onSubmit={batchForm.handleSubmit(d => saveBatch(d))} className="space-y-3 p-4">
              <div>
                <label className="label">Partner *</label>
                <select className="input" {...batchForm.register('partnerId', { required: true })}>
                  <option value="">Select partner…</option>
                  {partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Product / Item Name *</label>
                <input className="input" {...batchForm.register('productName', { required: true })} placeholder="e.g. Samsung A05 (128GB)" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="label">Cost Price *</label>
                  <input className="input" type="number" min="0" step="any" {...batchForm.register('costPrice', { required: true, min: 0 })} placeholder="0" />
                  <p className="text-[10px] text-stone-400 mt-0.5">What you owe per unit</p>
                </div>
                <div>
                  <label className="label">Selling Price *</label>
                  <input className="input" type="number" min="0" step="any" {...batchForm.register('sellingPrice', { required: true, min: 0 })} placeholder="0" />
                  <p className="text-[10px] text-stone-400 mt-0.5">Your price to customer</p>
                </div>
                <div>
                  <label className="label">Qty Received *</label>
                  <input className="input" type="number" min="1" step="any" {...batchForm.register('qtyReceived', { required: true, min: 1 })} placeholder="0" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Date Received</label>
                  <input className="input" type="date" {...batchForm.register('receivedAt')} />
                </div>
                <div>
                  <label className="label">Notes</label>
                  <input className="input" {...batchForm.register('notes')} placeholder="Optional" />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" className="btn-ghost" onClick={() => { setShowBatchForm(false); setError(''); }}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={savingBatch}>
                  {savingBatch ? 'Saving…' : 'Record Batch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Mark Sold ─────────────────────────────────────────────────── */}
      {markingSoldBatch && (
        <div className="modal-backdrop">
          <div className="modal max-w-sm">
            <div className="modal-header">
              <h2 className="modal-title">Update Quantity Sold</h2>
              <button onClick={() => { setMarkingSoldBatch(null); setError(''); }} className="modal-close"><X size={16} /></button>
            </div>
            <form onSubmit={soldForm.handleSubmit(d => markSold({ ...d, batchId: markingSoldBatch.id }))} className="space-y-3 p-4">
              <p className="text-xs text-stone-500">
                Batch: <span className="font-medium text-stone-800">{markingSoldBatch.productName}</span>
                {' '}· Received: {markingSoldBatch.qtyReceived}
              </p>
              <div>
                <label className="label">Total Qty Sold So Far *</label>
                <input
                  className="input"
                  type="number"
                  min="0"
                  max={markingSoldBatch.qtyReceived}
                  step="any"
                  {...soldForm.register('qtySold', { required: true, min: 0, max: markingSoldBatch.qtyReceived })}
                />
                <p className="text-[10px] text-stone-400 mt-0.5">
                  Enter the running total sold from this batch (not just new sales)
                </p>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" className="btn-ghost" onClick={() => { setMarkingSoldBatch(null); setError(''); }}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={markingSold}>
                  {markingSold ? 'Saving…' : 'Update'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Settle ────────────────────────────────────────────────────── */}
      {settlingBatch && (
        <div className="modal-backdrop">
          <div className="modal max-w-sm">
            <div className="modal-header">
              <h2 className="modal-title">Record Settlement</h2>
              <button onClick={() => { setSettlingBatch(null); setError(''); }} className="modal-close"><X size={16} /></button>
            </div>
            <form onSubmit={settleForm.handleSubmit(d => settle({ ...d, batchId: settlingBatch.id }))} className="space-y-3 p-4">
              <div className="bg-stone-50 rounded-lg p-3 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-stone-500">Product</span>
                  <span className="font-medium">{settlingBatch.productName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-stone-500">Partner</span>
                  <span>{settlingBatch.partner.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-stone-500">Qty Sold</span>
                  <span>{settlingBatch.qtySold}</span>
                </div>
                <div className="flex justify-between font-semibold text-red-600">
                  <span>Outstanding</span>
                  <span>{fmt(settlingBatch.outstanding)}</span>
                </div>
              </div>
              <div>
                <label className="label">Qty Being Settled *</label>
                <input
                  className="input"
                  type="number"
                  min="1"
                  step="any"
                  defaultValue={settlingBatch.qtySold - (settlingBatch.settledQty ?? 0)}
                  {...settleForm.register('qtySold', { required: true, min: 1 })}
                />
              </div>
              <div>
                <label className="label">Amount Paid (TZS) *</label>
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="any"
                  {...settleForm.register('amountPaid', { required: true, min: 0 })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Date Paid</label>
                  <input className="input" type="date" {...settleForm.register('paidAt')} />
                </div>
                <div>
                  <label className="label">Notes</label>
                  <input className="input" {...settleForm.register('notes')} placeholder="Optional" />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" className="btn-ghost" onClick={() => { setSettlingBatch(null); setError(''); }}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={settling}>
                  {settling ? 'Recording…' : 'Record Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
