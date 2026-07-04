import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X, Users, Package, AlertCircle, Trash2, Trophy, Calendar } from 'lucide-react';
import { useForm, useWatch } from 'react-hook-form';
import api from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
  const { shopId, user } = useAuthStore();
  const isOwner = user?.role === 'ACCOUNT_OWNER';
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('Sales');
  const [error, setError] = useState('');
  const [reportFrom, setReportFrom] = useState('');
  const [reportTo, setReportTo]     = useState('');

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
    queryKey: ['consignment-profit-report', shopId, reportFrom, reportTo],
    queryFn: () => api.get('/consignment/profit-report', {
      params: {
        ...(reportFrom && { from: reportFrom }),
        ...(reportTo   && { to: reportTo }),
      },
    }).then(r => r.data.data),
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

  // Tab label helper
  function tabLabel(tabKey: Tab): string {
    if (tabKey === 'Sales') return t('consignment.salesTab');
    if (tabKey === 'Partners') return t('consignment.partnersTab');
    return t('consignment.reportTab');
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('consignment.title')}</h1>
          <p className="page-subtitle">Goods sold on behalf — record the profit when sold</p>
        </div>
        <div className="flex gap-2">
          {tab === 'Partners' && isOwner && (
            <button className="btn-primary" onClick={() => { setError(''); setShowPartnerForm(true); }}>
              <Plus size={14} className="mr-1.5" /> {t('consignment.addPartner')}
            </button>
          )}
          {tab === 'Sales' && (
            <button className="btn-primary" onClick={() => { setError(''); saleForm.reset(); setShowSaleForm(true); }}>
              <Plus size={14} className="mr-1.5" /> {t('consignment.recordSale')}
            </button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="card p-4">
          <p className="text-xs text-stone-500 mb-1">{t('consignment.totalProfit')}</p>
          <p className="text-xl font-bold text-green-600">{fmt(totalProfit)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-stone-500 mb-1">Sales Recorded</p>
          <p className="text-xl font-bold text-stone-800">{sales.length}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-stone-500 mb-1">{t('consignment.totalRevenue')}</p>
          <p className="text-xl font-bold text-stone-800">{fmt(totalRevenue)}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-stone-200">
        <div className="flex gap-0">
          {TABS.map(tabKey => (
            <button
              key={tabKey}
              onClick={() => { setTab(tabKey); setError(''); }}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === tabKey
                  ? 'border-primary-600 text-primary-700'
                  : 'border-transparent text-stone-500 hover:text-stone-700'
              }`}
            >
              {tabLabel(tabKey)}
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
            <div className="p-8 text-center text-stone-400">{t('common.loading')}</div>
          ) : sales.length === 0 ? (
            <div className="p-10 text-center text-stone-400">
              <Package size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">{t('consignment.noSales')}</p>
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('consignment.product')}</th>
                    <th>{t('consignment.partner')}</th>
                    <th>Cost / Sell</th>
                    <th>{t('consignment.qty')}</th>
                    <th>{t('consignment.profit')}</th>
                    <th>Sold By</th>
                    <th>{t('common.date')}</th>
                    {isOwner && <th></th>}
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
                      {isOwner && (
                        <td>
                          <button className="btn-sm btn-ghost text-red-500" onClick={() => removeSale(s.id)} title="Delete">
                            <Trash2 size={14} />
                          </button>
                        </td>
                      )}
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
              <p className="text-sm">{t('consignment.noPartners')}</p>
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr><th>Name</th><th>{t('common.phone')}</th><th>{t('common.email')}</th></tr>
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
        <>
          {/* Date filter */}
          <div className="card px-4 py-3 flex flex-wrap items-center gap-3">
            <Calendar size={15} className="text-stone-400 shrink-0" />
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-stone-600">{t('consignment.filterFrom')}</label>
              <input type="date" value={reportFrom} onChange={e => setReportFrom(e.target.value)}
                className="input py-1.5 text-xs w-36" />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-stone-600">{t('consignment.filterTo')}</label>
              <input type="date" value={reportTo} onChange={e => setReportTo(e.target.value)}
                className="input py-1.5 text-xs w-36" />
            </div>
            {(reportFrom || reportTo) && (
              <button onClick={() => { setReportFrom(''); setReportTo(''); }}
                className="text-xs text-stone-400 hover:text-red-500 transition-colors">
                {t('consignment.clearFilter')}
              </button>
            )}
          </div>

        <div className="card">
          {reportLoading ? (
            <div className="p-8 text-center text-stone-400">{t('common.loading')}</div>
          ) : report.length === 0 ? (
            <div className="p-10 text-center text-stone-400">
              <Trophy size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">{t('consignment.noReport')}</p>
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('consignment.seller')}</th>
                    <th>{t('consignment.salesCount')}</th>
                    <th>{t('consignment.totalQty')}</th>
                    <th>{t('consignment.totalRevenue')}</th>
                    <th>{t('consignment.totalProfit')}</th>
                  </tr>
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
        </>
      )}

      {/* ── Modal: Add Partner ───────────────────────────────────────────────── */}
      {showPartnerForm && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="card w-full sm:max-w-sm rounded-t-2xl sm:rounded-xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
              <h2 className="text-sm font-bold text-stone-900">{t('consignment.addPartner')}</h2>
              <button onClick={() => { setShowPartnerForm(false); setError(''); }} className="text-stone-400 hover:text-stone-700"><X size={18} /></button>
            </div>
            <form onSubmit={partnerForm.handleSubmit(d => savePartner(d))} className="space-y-4 p-5">
              <div>
                <label className="label">{t('consignment.partnerName')} *</label>
                <input className="input" {...partnerForm.register('name', { required: true })} placeholder="Partner / business name" autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">{t('common.phone')}</label>
                  <input className="input" {...partnerForm.register('phone')} placeholder="+255…" />
                </div>
                <div>
                  <label className="label">{t('common.email')}</label>
                  <input className="input" type="email" {...partnerForm.register('email')} />
                </div>
              </div>
              <div>
                <label className="label">{t('common.notes')}</label>
                <textarea className="input" rows={2} {...partnerForm.register('notes')} />
              </div>
              <div className="flex gap-3 pt-1 pb-2">
                <button type="button" className="btn-secondary flex-1" onClick={() => { setShowPartnerForm(false); setError(''); }}>{t('common.cancel')}</button>
                <button type="submit" className="btn-primary flex-1" disabled={savingPartner}>
                  {savingPartner ? t('common.saving') : t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Record Sale ───────────────────────────────────────────────── */}
      {showSaleForm && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="card w-full sm:max-w-md rounded-t-2xl sm:rounded-xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
              <h2 className="text-sm font-bold text-stone-900">{t('consignment.recordSale')}</h2>
              <button onClick={() => { setShowSaleForm(false); setError(''); }} className="text-stone-400 hover:text-stone-700"><X size={18} /></button>
            </div>
            <form onSubmit={saleForm.handleSubmit(d => saveSale(d))} className="space-y-4 p-5">
              <div>
                <label className="label">{t('consignment.partner')} *</label>
                <select className="select w-full" {...saleForm.register('partnerId', { required: true })} autoFocus>
                  <option value="">Select partner…</option>
                  {partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">{t('consignment.product')} *</label>
                <input className="input" {...saleForm.register('productName', { required: true })} placeholder="e.g. Samsung A05 (128GB)" />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label className="label">{t('consignment.costPrice')} *</label>
                  <input className="input" type="number" min="0" step="any" {...saleForm.register('costPrice', { required: true, min: 0 })} placeholder="0" />
                  <p className="text-[10px] text-stone-400 mt-0.5">Owed to partner / unit</p>
                </div>
                <div>
                  <label className="label">{t('consignment.sellingPrice')} *</label>
                  <input className="input" type="number" min="0" step="any" {...saleForm.register('sellingPrice', { required: true, min: 0 })} placeholder="0" />
                  <p className="text-[10px] text-stone-400 mt-0.5">Sold to customer for</p>
                </div>
                <div>
                  <label className="label">{t('consignment.qty')} *</label>
                  <input className="input" type="number" min="1" step="any" {...saleForm.register('qty', { required: true, min: 1 })} placeholder="0" />
                </div>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 flex items-center justify-between">
                <span className="text-xs text-green-700">{t('consignment.profit')}</span>
                <span className="text-sm font-bold text-green-700">{fmt(previewProfit)}</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">{t('common.date')}</label>
                  <input className="input" type="date" {...saleForm.register('soldAt')} />
                </div>
                <div>
                  <label className="label">{t('common.notes')}</label>
                  <input className="input" {...saleForm.register('notes')} placeholder="Optional" />
                </div>
              </div>
              <div className="flex gap-3 pt-1 pb-2">
                <button type="button" className="btn-secondary flex-1" onClick={() => { setShowSaleForm(false); setError(''); }}>{t('common.cancel')}</button>
                <button type="submit" className="btn-primary flex-1" disabled={savingSale}>
                  {savingSale ? t('common.saving') : t('consignment.recordSale')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
