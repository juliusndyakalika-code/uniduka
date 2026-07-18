import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X, Users, Package, AlertCircle, Trash2, Trophy, Calendar } from 'lucide-react';
import { useForm, useWatch } from 'react-hook-form';
import api from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { useTranslation } from 'react-i18next';
import { useDataTable, TableSearch, SortableTh, TablePagination } from '../../components/ui/DataTable';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Partner { id: string; name: string; phone?: string; email?: string; notes?: string; }
interface Sale {
  id: string; productName: string; costPrice: number; sellingPrice: number;
  qty: number; profit: number; notes?: string; soldAt: string; paymentMethod?: string;
  amountPaid?: number;
  partner: { id: string; name: string };
  soldBy: { id: string; fullName: string };
  customer?: { id: string; fullName: string; phone?: string } | null;
}

const PAYMENT_METHODS = [
  { value: 'CASH',          label: 'Cash' },
  { value: 'MOBILE_MONEY',  label: 'Mobile Money' },
  { value: 'CARD',          label: 'Card' },
  { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
  { value: 'DEBIT',         label: 'Debit (Credit — pay later)' },
];
// Revenue and outstanding balance for a sale
function saleRevenue(s: Sale) { return s.sellingPrice * s.qty; }
function saleOutstanding(s: Sale) { return Math.max(0, saleRevenue(s) - (s.amountPaid ?? saleRevenue(s))); }
function paymentLabel(m?: string) {
  return PAYMENT_METHODS.find(p => p.value === m)?.label ?? (m ? m.replace('_', ' ') : '—');
}
interface SellerStat {
  sellerId: string; sellerName: string;
  salesCount: number; totalQty: number; totalRevenue: number; totalProfit: number;
}
interface PaymentStat {
  method: string; label: string;
  salesCount: number; totalQty: number; totalRevenue: number; totalProfit: number;
}
interface ProfitReport {
  bySeller: SellerStat[];
  byPaymentMethod: PaymentStat[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TABS = ['Sales', 'Partners', 'Profit Report'] as const;
type Tab = typeof TABS[number];

function fmt(n: number) {
  return new Intl.NumberFormat('sw-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 0 }).format(n);
}
function date(s: string) { return new Date(s).toLocaleDateString('en-TZ', { day: '2-digit', month: 'short', year: 'numeric' }); }
function ymd(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function todayYmd() { return ymd(new Date()); }

// ── Forms ─────────────────────────────────────────────────────────────────────

type PartnerForm = { name: string; phone?: string; email?: string; notes?: string; };
type SaleForm = { partnerId: string; productName: string; costPrice: number; sellingPrice: number; qty: number; notes?: string; soldAt?: string; paymentMethod?: string; customerId?: string; };
interface CustomerOpt { id: string; fullName: string; phone?: string; }

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
  // Sales tab + summary cards are scoped to a date range, defaulting to today.
  const [salesFrom, setSalesFrom] = useState(todayYmd);
  const [salesTo, setSalesTo]     = useState(todayYmd);

  // modal state
  const [showPartnerForm, setShowPartnerForm] = useState(false);
  const [showSaleForm, setShowSaleForm] = useState(false);
  const [settlingSale, setSettlingSale] = useState<Sale | null>(null);
  const [settleAmount, setSettleAmount] = useState('');
  // Quick-add customer (from inside the credit sale form)
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [savingCust, setSavingCust] = useState(false);
  const [newCustError, setNewCustError] = useState('');

  function err(e: unknown) {
    return (e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Something went wrong';
  }

  // ── Queries ──────────────────────────────────────────────────────────────────

  const { data: partners = [] } = useQuery<Partner[]>({
    queryKey: ['consignment-partners', shopId],
    queryFn: () => api.get('/consignment/partners').then(r => r.data.data),
    enabled: !!shopId,
  });

  // Customers for linking a credit (debit) sale to a debtor
  const { data: customers = [] } = useQuery<CustomerOpt[]>({
    queryKey: ['crm-customers', shopId],
    queryFn: () => api.get('/crm').then(r => (Array.isArray(r.data.data) ? r.data.data : [])),
    enabled: !!shopId && showSaleForm,
  });

  const { data: sales = [], isLoading: salesLoading } = useQuery<Sale[]>({
    queryKey: ['consignment-sales', shopId, salesFrom, salesTo],
    queryFn: () => api.get('/consignment/sales', {
      params: { ...(salesFrom && { from: salesFrom }), ...(salesTo && { to: salesTo }) },
    }).then(r => r.data.data),
    enabled: !!shopId,
  });

  const { data: report, isLoading: reportLoading } = useQuery<ProfitReport>({
    queryKey: ['consignment-profit-report', shopId, reportFrom, reportTo],
    queryFn: () => api.get('/consignment/profit-report', {
      params: {
        ...(reportFrom && { from: reportFrom }),
        ...(reportTo   && { to: reportTo }),
      },
    }).then(r => r.data.data ?? { bySeller: [], byPaymentMethod: [] }),
    enabled: !!shopId && tab === 'Profit Report',
  });
  const reportSellers  = report?.bySeller ?? [];
  const reportPayments = report?.byPaymentMethod ?? [];

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

  const { mutate: settleSale, isPending: settling } = useMutation({
    mutationFn: ({ id, amount }: { id: string; amount: number }) =>
      api.post(`/consignment/sales/${id}/settle`, { amount }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['consignment-sales'] });
      setSettlingSale(null); setSettleAmount(''); setError('');
    },
    onError: (e) => setError(err(e)),
  });

  // ── Live profit preview in the sale form ────────────────────────────────────

  const watchCost = useWatch({ control: saleForm.control, name: 'costPrice' });
  const watchSell = useWatch({ control: saleForm.control, name: 'sellingPrice' });
  const watchQty = useWatch({ control: saleForm.control, name: 'qty' });
  const watchMethod = useWatch({ control: saleForm.control, name: 'paymentMethod' });
  const previewProfit = (Number(watchSell) - Number(watchCost) || 0) * (Number(watchQty) || 0);

  async function saveNewCustomer() {
    if (!newCustName.trim()) { setNewCustError('Name is required'); return; }
    setSavingCust(true); setNewCustError('');
    try {
      const res = await api.post('/crm', { fullName: newCustName.trim(), phone: newCustPhone.trim() || undefined });
      const cust = res.data.data as CustomerOpt;
      await qc.invalidateQueries({ queryKey: ['crm-customers'] });
      saleForm.setValue('customerId', cust.id, { shouldValidate: true });
      setShowNewCustomer(false); setNewCustName(''); setNewCustPhone('');
    } catch (e) {
      setNewCustError(err(e));
    }
    setSavingCust(false);
  }

  // ── Summary stats ─────────────────────────────────────────────────────────────

  const totalProfit = sales.reduce((s, x) => s + x.profit, 0);
  const totalRevenue = sales.reduce((s, x) => s + x.sellingPrice * x.qty, 0);

  // ── Table state (search + sort + pagination) ────────────────────────────────
  const salesTable = useDataTable(sales, {
    searchable: s => [s.productName, s.partner.name, s.soldBy.fullName, paymentLabel(s.paymentMethod)],
    sortValues: {
      productName: s => s.productName,
      partner:     s => s.partner.name,
      sellingPrice: s => s.sellingPrice,
      qty:         s => s.qty,
      profit:      s => s.profit,
      payment:     s => paymentLabel(s.paymentMethod),
      soldBy:      s => s.soldBy.fullName,
      soldAt:      s => new Date(s.soldAt),
    },
    initialSort: { field: 'soldAt', dir: 'desc' },
    pageSize: 12,
  });
  const partnersTable = useDataTable(partners, {
    searchable: p => [p.name, p.phone, p.email],
    sortValues: { name: p => p.name, phone: p => p.phone, email: p => p.email },
    initialSort: { field: 'name', dir: 'asc' },
    pageSize: 12,
  });
  const sellerTable = useDataTable(reportSellers, {
    searchable: r => [r.sellerName],
    sortValues: {
      sellerName: r => r.sellerName, salesCount: r => r.salesCount, totalQty: r => r.totalQty,
      totalRevenue: r => r.totalRevenue, totalProfit: r => r.totalProfit,
    },
    initialSort: { field: 'totalProfit', dir: 'desc' },
    pageSize: 12,
  });
  const paymentTable = useDataTable(reportPayments, {
    searchable: p => [p.label],
    sortValues: {
      label: p => p.label, salesCount: p => p.salesCount, totalQty: p => p.totalQty,
      totalRevenue: p => p.totalRevenue, totalProfit: p => p.totalProfit,
    },
    initialSort: { field: 'totalRevenue', dir: 'desc' },
    pageSize: 12,
  });

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

      {/* Date range — scopes the cards above and the Sales list below (default: today) */}
      {tab === 'Sales' && (
      <div className="card px-4 py-3 flex flex-wrap items-center gap-3">
        <Calendar size={15} className="text-stone-400 shrink-0" />
        {(() => {
          const today = todayYmd();
          const monthStart = ymd(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
          const weekStart = ymd(new Date(Date.now() - 6 * 864e5));
          const presets = [
            { label: t('common.today'), from: today, to: today },
            { label: t('common.thisWeek'), from: weekStart, to: today },
            { label: t('common.thisMonth'), from: monthStart, to: today },
            { label: t('common.all'), from: '', to: '' },
          ];
          return presets.map(p => {
            const active = salesFrom === p.from && salesTo === p.to;
            return (
              <button key={p.label} onClick={() => { setSalesFrom(p.from); setSalesTo(p.to); }}
                className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${active ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-stone-200 text-stone-500 hover:border-stone-300'}`}>
                {p.label}
              </button>
            );
          });
        })()}
        <div className="flex items-center gap-2 ml-auto">
          <input type="date" value={salesFrom} onChange={e => setSalesFrom(e.target.value)} className="input py-1.5 text-xs w-36" />
          <span className="text-stone-400 text-xs">–</span>
          <input type="date" value={salesTo} onChange={e => setSalesTo(e.target.value)} className="input py-1.5 text-xs w-36" />
        </div>
      </div>
      )}

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
            <>
            <div className="px-4 py-3 border-b border-stone-100">
              <TableSearch value={salesTable.search} onChange={salesTable.setSearch} placeholder="Search product, partner, seller…" />
            </div>
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <SortableTh field="productName" sort={salesTable.sort} onSort={salesTable.toggleSort}>{t('consignment.product')}</SortableTh>
                    <SortableTh field="partner" sort={salesTable.sort} onSort={salesTable.toggleSort}>{t('consignment.partner')}</SortableTh>
                    <SortableTh field="sellingPrice" sort={salesTable.sort} onSort={salesTable.toggleSort}>Cost / Sell</SortableTh>
                    <SortableTh field="qty" sort={salesTable.sort} onSort={salesTable.toggleSort}>{t('consignment.qty')}</SortableTh>
                    <SortableTh field="profit" sort={salesTable.sort} onSort={salesTable.toggleSort}>{t('consignment.profit')}</SortableTh>
                    <SortableTh field="payment" sort={salesTable.sort} onSort={salesTable.toggleSort}>{t('consignment.paymentMethod')}</SortableTh>
                    <SortableTh field="soldBy" sort={salesTable.sort} onSort={salesTable.toggleSort}>Sold By</SortableTh>
                    <SortableTh field="soldAt" sort={salesTable.sort} onSort={salesTable.toggleSort}>{t('common.date')}</SortableTh>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {salesTable.view.map(s => {
                    const outstanding = saleOutstanding(s);
                    return (
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
                      <td>
                        <span className="badge badge-stone text-xs">{paymentLabel(s.paymentMethod)}</span>
                        {outstanding > 0 && (
                          <span className="block mt-0.5 text-[10px] font-semibold text-amber-700">
                            Owes {fmt(outstanding)}{s.customer ? ` · ${s.customer.fullName}` : ''}
                          </span>
                        )}
                      </td>
                      <td className="text-stone-500">{s.soldBy.fullName}</td>
                      <td className="text-stone-400">{date(s.soldAt)}</td>
                      <td>
                        <div className="flex items-center justify-end gap-1">
                          {outstanding > 0 && (
                            <button className="text-xs font-semibold text-primary-600 hover:text-primary-800 px-2 py-1 rounded hover:bg-primary-50"
                              onClick={() => { setError(''); setSettlingSale(s); setSettleAmount(String(outstanding)); }}>
                              Settle
                            </button>
                          )}
                          {isOwner && (
                            <button className="btn-sm btn-ghost text-red-500" onClick={() => removeSale(s.id)} title="Delete">
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                  {salesTable.total === 0 && (
                    <tr><td colSpan={9} className="text-center text-stone-400 py-8">{t('common.noData')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <TablePagination page={salesTable.page} pageCount={salesTable.pageCount} total={salesTable.total} pageSize={salesTable.pageSize} onPage={salesTable.setPage} onPageSize={salesTable.setPageSize} />
            </>
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
            <>
            <div className="px-4 py-3 border-b border-stone-100">
              <TableSearch value={partnersTable.search} onChange={partnersTable.setSearch} placeholder="Search partners…" />
            </div>
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <SortableTh field="name" sort={partnersTable.sort} onSort={partnersTable.toggleSort}>Name</SortableTh>
                    <SortableTh field="phone" sort={partnersTable.sort} onSort={partnersTable.toggleSort}>{t('common.phone')}</SortableTh>
                    <SortableTh field="email" sort={partnersTable.sort} onSort={partnersTable.toggleSort}>{t('common.email')}</SortableTh>
                  </tr>
                </thead>
                <tbody>
                  {partnersTable.view.map(p => (
                    <tr key={p.id}>
                      <td className="font-medium">{p.name}</td>
                      <td className="text-stone-500">{p.phone || '—'}</td>
                      <td className="text-stone-500">{p.email || '—'}</td>
                    </tr>
                  ))}
                  {partnersTable.total === 0 && (
                    <tr><td colSpan={3} className="text-center text-stone-400 py-8">{t('common.noData')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <TablePagination page={partnersTable.page} pageCount={partnersTable.pageCount} total={partnersTable.total} pageSize={partnersTable.pageSize} onPage={partnersTable.setPage} onPageSize={partnersTable.setPageSize} />
            </>
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
          ) : reportSellers.length === 0 ? (
            <div className="p-10 text-center text-stone-400">
              <Trophy size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">{t('consignment.noReport')}</p>
            </div>
          ) : (
            <>
            <div className="px-4 py-3 border-b border-stone-100">
              <TableSearch value={sellerTable.search} onChange={sellerTable.setSearch} placeholder="Search seller…" />
            </div>
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <SortableTh field="sellerName" sort={sellerTable.sort} onSort={sellerTable.toggleSort}>{t('consignment.seller')}</SortableTh>
                    <SortableTh field="salesCount" sort={sellerTable.sort} onSort={sellerTable.toggleSort}>{t('consignment.salesCount')}</SortableTh>
                    <SortableTh field="totalQty" sort={sellerTable.sort} onSort={sellerTable.toggleSort}>{t('consignment.totalQty')}</SortableTh>
                    <SortableTh field="totalRevenue" sort={sellerTable.sort} onSort={sellerTable.toggleSort}>{t('consignment.totalRevenue')}</SortableTh>
                    <SortableTh field="totalProfit" sort={sellerTable.sort} onSort={sellerTable.toggleSort}>{t('consignment.totalProfit')}</SortableTh>
                  </tr>
                </thead>
                <tbody>
                  {sellerTable.view.map(r => (
                    <tr key={r.sellerId}>
                      <td className="font-medium">{r.sellerName}</td>
                      <td className="text-xs">{r.salesCount}</td>
                      <td className="text-xs">{r.totalQty}</td>
                      <td className="text-stone-500">{fmt(r.totalRevenue)}</td>
                      <td className="font-semibold text-green-600">{fmt(r.totalProfit)}</td>
                    </tr>
                  ))}
                  {sellerTable.total === 0 && (
                    <tr><td colSpan={5} className="text-center text-stone-400 py-8">{t('common.noData')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <TablePagination page={sellerTable.page} pageCount={sellerTable.pageCount} total={sellerTable.total} pageSize={sellerTable.pageSize} onPage={sellerTable.setPage} onPageSize={sellerTable.setPageSize} />
            </>
          )}
        </div>

        {/* Breakdown by payment method */}
        {!reportLoading && reportPayments.length > 0 && (
          <div className="card">
            <div className="px-4 py-3 border-b border-stone-100 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-stone-700">{t('consignment.byPaymentMethod')}</h3>
              <TableSearch value={paymentTable.search} onChange={paymentTable.setSearch} placeholder="Search method…" className="max-w-[12rem]" />
            </div>
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <SortableTh field="label" sort={paymentTable.sort} onSort={paymentTable.toggleSort}>{t('consignment.paymentMethod')}</SortableTh>
                    <SortableTh field="salesCount" sort={paymentTable.sort} onSort={paymentTable.toggleSort}>{t('consignment.salesCount')}</SortableTh>
                    <SortableTh field="totalQty" sort={paymentTable.sort} onSort={paymentTable.toggleSort}>{t('consignment.totalQty')}</SortableTh>
                    <SortableTh field="totalRevenue" sort={paymentTable.sort} onSort={paymentTable.toggleSort}>{t('consignment.totalRevenue')}</SortableTh>
                    <SortableTh field="totalProfit" sort={paymentTable.sort} onSort={paymentTable.toggleSort}>{t('consignment.totalProfit')}</SortableTh>
                  </tr>
                </thead>
                <tbody>
                  {paymentTable.view.map(p => (
                    <tr key={p.method}>
                      <td><span className="badge badge-stone text-xs">{p.label}</span></td>
                      <td className="text-xs">{p.salesCount}</td>
                      <td className="text-xs">{p.totalQty}</td>
                      <td className="text-stone-500">{fmt(p.totalRevenue)}</td>
                      <td className="font-semibold text-green-600">{fmt(p.totalProfit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TablePagination page={paymentTable.page} pageCount={paymentTable.pageCount} total={paymentTable.total} pageSize={paymentTable.pageSize} onPage={paymentTable.setPage} onPageSize={paymentTable.setPageSize} />
          </div>
        )}
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
              <div>
                <label className="label">{t('consignment.paymentMethod')}</label>
                <select className="select w-full" defaultValue="CASH" {...saleForm.register('paymentMethod')}>
                  {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              {/* Customer — captured only for credit (debit) sales */}
              {watchMethod === 'DEBIT' && (
                <div>
                  <div className="flex items-center justify-between">
                    <label className="label">Customer (owes) *</label>
                    <button type="button" onClick={() => { setNewCustError(''); setShowNewCustomer(v => !v); }}
                      className="text-xs font-medium text-primary-600 hover:text-primary-700">
                      {showNewCustomer ? 'Cancel' : '+ New customer'}
                    </button>
                  </div>
                  {showNewCustomer ? (
                    <div className="border border-stone-200 rounded-lg p-3 space-y-2 bg-stone-50">
                      <input className="input text-xs" placeholder="Full name" autoFocus
                        value={newCustName} onChange={e => setNewCustName(e.target.value)} />
                      <input className="input text-xs" placeholder="Phone (optional)" type="tel"
                        value={newCustPhone} onChange={e => setNewCustPhone(e.target.value)} />
                      {newCustError && <p className="text-[10px] text-red-600">{newCustError}</p>}
                      <button type="button" className="btn-primary w-full text-xs py-1.5" disabled={savingCust}
                        onClick={saveNewCustomer}>
                        {savingCust ? t('common.saving') : 'Add & select'}
                      </button>
                    </div>
                  ) : (
                    <>
                      <select className="select w-full" {...saleForm.register('customerId', { required: watchMethod === 'DEBIT' })}>
                        <option value="">Select customer…</option>
                        {customers.map(c => <option key={c.id} value={c.id}>{c.fullName}{c.phone ? ` · ${c.phone}` : ''}</option>)}
                      </select>
                      {customers.length === 0 && (
                        <p className="text-[10px] text-amber-600 mt-1">No customers yet — tap “+ New customer” to add one.</p>
                      )}
                    </>
                  )}
                </div>
              )}
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

      {/* ── Modal: Settle credit sale ────────────────────────────────────────── */}
      {settlingSale && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="card w-full sm:max-w-sm rounded-t-2xl sm:rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-stone-900">Record Payment</h2>
              <button onClick={() => setSettlingSale(null)} className="text-stone-400 hover:text-stone-700"><X size={18} /></button>
            </div>
            <div className="bg-stone-50 rounded-lg p-3 mb-4 flex justify-between items-center text-sm">
              <div>
                <p className="font-medium text-stone-900">{settlingSale.customer?.fullName ?? settlingSale.productName}</p>
                <p className="text-xs text-stone-400">{settlingSale.productName} · {settlingSale.partner.name}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-stone-400">Owes</p>
                <p className="font-bold text-amber-700">{fmt(saleOutstanding(settlingSale))}</p>
              </div>
            </div>
            <label className="label">Amount received</label>
            <input type="number" min="0" max={saleOutstanding(settlingSale)} className="input" autoFocus
              value={settleAmount} onChange={e => setSettleAmount(e.target.value)} />
            <div className="flex gap-3 pt-4">
              <button className="btn-secondary flex-1" onClick={() => setSettlingSale(null)}>{t('common.cancel')}</button>
              <button className="btn-primary flex-1" disabled={settling || !settleAmount || Number(settleAmount) <= 0}
                onClick={() => settleSale({ id: settlingSale.id, amount: Number(settleAmount) })}>
                {settling ? t('common.saving') : `Record ${settleAmount ? fmt(Number(settleAmount)) : 'Payment'}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
