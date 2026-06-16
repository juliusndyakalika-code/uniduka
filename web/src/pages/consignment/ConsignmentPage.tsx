import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X, Users, Package, AlertCircle, Trash2, Trophy } from 'lucide-react';
import { useForm, useWatch } from 'react-hook-form';
import api from '../../api/client';
import { useAuthStore } from '../../store/authStore';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Partner { id: string; name: string; phone?: string; email?: string; notes?: string; }
interface Sale {
  id: string; productName: string; costPrice: number; sellingPrice: number;
  qty: number; profit: number; notes?: string; soldAt: string;
  partner: { id: string; name: string };
  soldBy: { id: string; fullName: string };
}
interface SellerStat {
  sellerId: string; sellerName: string;
  salesCount: number; totalQty: number; totalRevenue: number; totalProfit: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TABS = ['Sales', 'Partners', 'Profit Report'] as const;
type Tab = typeof TABS[number];

function fmt(n: number) {
  return new Intl.NumberFormat('sw-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 0 }).format(n);
}
function date(s: string) { return new Date(s).toLocaleDateString('en-TZ', { day: '2-digit', month: 'short', year: 'numeric' }); }

// ── Forms ─────────────────────────────────────────────────────────────────────

type PartnerForm = { name: string; phone?: string; email?: string; notes?: string; };
type SaleForm = { partnerId: string; productName: string; costPrice: number; sellingPrice: number; qty: number; notes?: string; soldAt?: string; };

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ConsignmentPage() {
  const { shopId } = useAuthStore();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('Sales');
  const [error, setError] = useState('');

  // modal state
  const [showPartnerForm, setShowPartnerForm] = useState(false);
  const [showSaleForm, setShowSaleForm] = useState(false);

  function err(e: unknown) {
    return (e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Something went wrong';
  }

  // ── Queries ──────────────────────────────────────────────────────────────────

  const { data: partners = [] } = useQuery<Partner[]>({
    queryKey: ['consignment-partners', shopId],
    queryFn: () => api.get('/consignment/partners').then(r => r.data.data),
    enabled: !!shopId,
  });

  const { data: sales = [], isLoading: salesLoading } = useQuery<Sale[]>({
    queryKey: ['consignment-sales', shopId],
    queryFn: () => api.get('/consignment/sales').then(r => r.data.data),
    enabled: !!shopId,
  });

  const { data: report = [], isLoading: reportLoading } = useQuery<SellerStat[]>({
    queryKey: ['consignment-profit-report', shopId],
    queryFn: () => api.get('/consignment/profit-report').then(r => r.data.data),
    enabled: !!shopId && tab === 'Profit Report',
  });

  // ── Mutations ─────────────────────────────────────────────────────────────────

  const partnerForm = useForm<PartnerForm>();
  const { mutate: savePartner, isPending: savingPartner } = useMutation({
    mutationFn: (d: PartnerForm) => api.post('/consignment/partners', d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['consignment-partners'] }); setShowPartnerForm(false); partnerForm.reset(); setError(''); },
    onError: (e) => setError(err(e)),
  });

  const saleForm = useForm<SaleForm>();
  const { mutate: saveSale, isPending: savingSale } = useMutation({
    mutationFn: (d: SaleForm) => api.post('/consignment/sales', d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['consignment-sales'] });
      qc.invalidateQueries({ queryKey: ['consignment-profit-report'] });
      setShowSaleForm(false); saleForm.reset(); setError('');
    },
    onError: (e) => setError(err(e)),
  });

  const { mutate: removeSale } = useMutation({
    mutationFn: (id: string) => api.delete(`/consignment/sales/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['consignment-sales'] });
      qc.invalidateQueries({ queryKey: ['consignment-profit-report'] });
    },
    onError: (e) => setError(err(e)),
  });

  // ── Live profit preview in the sale form ────────────────────────────────────

  const watchCost = useWatch({ control: saleForm.control, name: 'costPrice' });
  const watchSell = useWatch({ control: saleForm.control, name: 'sellingPrice' });
  const watchQty = useWatch({ control: saleForm.control, name: 'qty' });
  const previewProfit = (Number(watchSell) - Number(watchCost) || 0) * (Number(watchQty) || 0);

  // ── Summary stats ─────────────────────────────────────────────────────────────

  const totalProfit = sales.reduce((s, x) => s + x.profit, 0);
  const totalRevenue = sales.reduce((s, x) => s + x.sellingPrice * x.qty, 0);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Consignment</h1>
          <p className="page-subtitle">Goods sold on behalf — record the profit when sold</p>
        </div>
        <div className="flex gap-2">
          {tab === 'Partners' && (
            <button className="btn-primary" onClick={() => { setError(''); setShowPartnerForm(true); }}>
              <Plus size={14} className="mr-1.5" /> Add Partner
            </button>
          )}
          {tab === 'Sales' && (
            <button className="btn-primary" onClick={() => { setError(''); saleForm.reset(); setShowSaleForm(true); }}>
              <Plus size={14} className="mr-1.5" /> Record Sale
            </button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="card p-4">
          <p className="text-xs text-stone-500 mb-1">Total Profit</p>
          <p className="text-xl font-bold text-green-600">{fmt(totalProfit)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-stone-500 mb-1">Sales Recorded</p>
          <p className="text-xl font-bold text-stone-800">{sales.length}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-stone-500 mb-1">Total Revenue</p>
          <p className="text-xl font-bold text-stone-800">{fmt(totalRevenue)}</p>
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

      {/* ── Sales Tab ─────────────────────────────────────────────────────────── */}
      {tab === 'Sales' && (
        <div className="card">
          {salesLoading ? (
            <div className="p-8 text-center text-stone-400">Loading…</div>
          ) : sales.length === 0 ? (
            <div className="p-10 text-center text-stone-400">
              <Package size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">No consignment sales recorded yet</p>
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Partner</th>
                    <th>Cost / Sell</th>
                    <th>Qty</th>
                    <th>Profit</th>
                    <th>Sold By</th>
                    <th>Date</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map(s => (
                    <tr key={s.id}>
                      <td className="font-medium">{s.productName}</td>
                      <td className="text-stone-500">{s.partner.name}</td>
                      <td>
                        <span className="text-xs text-stone-500">{fmt(s.costPrice)}</span>
                        <span className="mx-1 text-stone-300">/</span>
                        <span className="text-xs font-medium">{fmt(s.sellingPrice)}</span>
                      </td>
                      <td className="text-xs">{s.qty}</td>
                      <td className="font-semibold text-green-600">{fmt(s.profit)}</td>
                      <td className="text-stone-500">{s.soldBy.fullName}</td>
                      <td className="text-stone-400">{date(s.soldAt)}</td>
                      <td>
                        <button className="btn-sm btn-ghost text-red-500" onClick={() => removeSale(s.id)} title="Delete">
                          <Trash2 size={14} />
                        </button>
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

      {/* ── Profit Report Tab ────────────────────────────────────────────────── */}
      {tab === 'Profit Report' && (
        <div className="card">
          {reportLoading ? (
            <div className="p-8 text-center text-stone-400">Loading…</div>
          ) : report.length === 0 ? (
            <div className="p-10 text-center text-stone-400">
              <Trophy size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">No consignment profits recorded yet</p>
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr><th>Seller</th><th>Sales</th><th>Qty Sold</th><th>Revenue</th><th>Profit</th></tr>
                </thead>
                <tbody>
                  {report.map(r => (
                    <tr key={r.sellerId}>
                      <td className="font-medium">{r.sellerName}</td>
                      <td className="text-xs">{r.salesCount}</td>
                      <td className="text-xs">{r.totalQty}</td>
                      <td className="text-stone-500">{fmt(r.totalRevenue)}</td>
                      <td className="font-semibold text-green-600">{fmt(r.totalProfit)}</td>
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

      {/* ── Modal: Record Sale ───────────────────────────────────────────────── */}
      {showSaleForm && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">Record Consignment Sale</h2>
              <button onClick={() => { setShowSaleForm(false); setError(''); }} className="modal-close"><X size={16} /></button>
            </div>
            <form onSubmit={saleForm.handleSubmit(d => saveSale(d))} className="space-y-3 p-4">
              <div>
                <label className="label">Partner *</label>
                <select className="input" {...saleForm.register('partnerId', { required: true })}>
                  <option value="">Select partner…</option>
                  {partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Product / Item Name *</label>
                <input className="input" {...saleForm.register('productName', { required: true })} placeholder="e.g. Samsung A05 (128GB)" />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label className="label">Cost Price *</label>
                  <input className="input" type="number" min="0" step="any" {...saleForm.register('costPrice', { required: true, min: 0 })} placeholder="0" />
                  <p className="text-[10px] text-stone-400 mt-0.5">Owed to partner / unit</p>
                </div>
                <div>
                  <label className="label">Selling Price *</label>
                  <input className="input" type="number" min="0" step="any" {...saleForm.register('sellingPrice', { required: true, min: 0 })} placeholder="0" />
                  <p className="text-[10px] text-stone-400 mt-0.5">Sold to customer for</p>
                </div>
                <div>
                  <label className="label">Qty *</label>
                  <input className="input" type="number" min="1" step="any" {...saleForm.register('qty', { required: true, min: 1 })} placeholder="0" />
                </div>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 flex items-center justify-between">
                <span className="text-xs text-green-700">Profit</span>
                <span className="text-sm font-bold text-green-700">{fmt(previewProfit)}</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Date Sold</label>
                  <input className="input" type="date" {...saleForm.register('soldAt')} />
                </div>
                <div>
                  <label className="label">Notes</label>
                  <input className="input" {...saleForm.register('notes')} placeholder="Optional" />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" className="btn-ghost" onClick={() => { setShowSaleForm(false); setError(''); }}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={savingSale}>
                  {savingSale ? 'Saving…' : 'Record Sale'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
