import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Download, TrendingUp, Users, Package, ChevronDown, ChevronRight, Printer, Trash2, Search, X } from 'lucide-react';
import { downloadCsv } from '../../utils/exportCsv';
import { printReceipt } from '../../utils/printReceipt';
import api from '../../api/client';
import { useAuthStore } from '../../store/authStore';

const REPORT_TABS = [
  { to: '/reports/sales',     label: 'Sales',      icon: TrendingUp },
  { to: '/reports/staff',     label: 'By Seller',   icon: Users },
  { to: '/reports/inventory', label: 'Stock',       icon: Package },
];

interface SalesReport {
  summary: { revenue: number; transactions: number; avgTicket: number; grossProfit: number };
  byDay: { date: string; revenue: number; txCount: number }[];
  byPaymentMethod: { method: string; label: string; total: number; count: number }[];
  topProducts: { name: string; revenue: number; qty: number }[];
}
interface TxItem { name: string; quantity: number; unitPrice: number; unitLabel: string; discountPct: number; lineTotal: number; }
interface Tx {
  id: string; receiptNo: string; total: number; subtotal: number; discountAmount: number;
  createdAt: string; status: string;
  payments: { method: string; amount: number }[];
  items: TxItem[];
  customer?: { fullName: string } | null;
  customerName?: string;
  cashierName?: string;
}

const PIE_COLORS = ['#a66624', '#14b8a6', '#3b82f6', '#f59e0b', '#6b7280'];
function fmt(n: number) {
  return new Intl.NumberFormat('sw-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 0 }).format(n);
}

// ── Expandable day row ─────────────────────────────────────────────────────
interface DayRowProps {
  day: { date: string; revenue: number; txCount: number };
  shopId: string | null;
  pmFilter?: string;
  period: 'day' | 'week' | 'month';
}

function dateRangeForPeriod(date: string, period: 'day' | 'week' | 'month'): { from: string; to: string } {
  if (period === 'day') return { from: date, to: date };
  if (period === 'week') {
    // date is the Sunday of the week; add 6 days for Saturday
    const end = new Date(date + 'T00:00:00Z');
    end.setUTCDate(end.getUTCDate() + 6);
    return { from: date, to: end.toISOString().split('T')[0] };
  }
  // month: date is 'YYYY-MM' — get first and last day
  const [y, m] = date.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate(); // day 0 of next month = last of this month
  return {
    from: `${date}-01`,
    to:   `${date}-${String(lastDay).padStart(2, '0')}`,
  };
}

function DayRow({ day, shopId, pmFilter, period }: DayRowProps) {
  const [expanded, setExpanded]         = useState(false);
  const [loadingPrint, setLoadingPrint] = useState<string | null>(null);
  const [txSearch, setTxSearch]         = useState('');
  const [voidingId, setVoidingId]       = useState<string | null>(null);
  const [voidReason, setVoidReason]     = useState('');
  const [voidErr, setVoidErr]           = useState('');
  const qc = useQueryClient();

  const { mutate: doVoid, isPending: voiding } = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post(`/pos/transactions/${id}/void`, { reason: reason || 'Voided from sales report' }),
    onSuccess: () => {
      setVoidingId(null); setVoidReason(''); setVoidErr('');
      qc.invalidateQueries({ queryKey: ['day-txns'] });
      qc.invalidateQueries({ queryKey: ['sales-report'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (e: unknown) =>
      setVoidErr((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to void'),
  });

  const { from: rangeFrom, to: rangeTo } = dateRangeForPeriod(day.date, period);

  const { data: txns = [], isLoading } = useQuery<Tx[]>({
    queryKey: ['day-txns', shopId, day.date, period, pmFilter],
    queryFn: () =>
      api.get('/pos/transactions', {
        params: { from: rangeFrom, to: rangeTo, limit: 200, ...(pmFilter && { paymentMethod: pmFilter }) },
      }).then(r => (r.data.data ?? []) as Tx[]),
    enabled: expanded && !!shopId,
    staleTime: 60_000,
  });

  const handlePrint = async (txId: string) => {
    setLoadingPrint(txId);
    try {
      const [txRes, shopRes] = await Promise.all([
        api.get(`/pos/transactions/${txId}`),
        shopId ? api.get(`/shops/${shopId}`) : Promise.resolve(null),
      ]);
      const tx = txRes.data.data;
      const shop = shopRes?.data?.data;
      printReceipt({
        receiptNo:    tx.receiptNo,
        total:        tx.total,
        subtotal:     tx.subtotal,
        discount:     tx.discountAmount,
        paymentMethod: tx.payments?.[0]?.method ?? 'CASH',
        cashReceived: tx.payments?.find((p: {method:string}) => p.method === 'CASH')?.amount ?? 0,
        change: 0,
        items: tx.items.map((i: TxItem) => ({
          name: i.name, qty: i.quantity, unitPrice: i.unitPrice,
          discountPct: i.discountPct, lineTotal: i.lineTotal, unit: i.unitLabel,
        })),
        shop: {
          tradingName:  shop?.tradingName ?? 'MauzoSmart',
          addressLine1: shop?.addressLine1, city: shop?.city, phone: shop?.phone,
          tin: shop?.tin, vrn: shop?.vrn, taxMode: shop?.taxMode,
        },
        customerName: tx.customer?.fullName ?? tx.customerName,
        customerTin:  tx.customerTin,
        printedAt:    tx.createdAt,
        isReprint:    true,
      });
    } catch { /* ignore */ }
    setLoadingPrint(null);
  };

  const label = period === 'month'
    ? new Date(rangeFrom + 'T00:00:00Z').toLocaleDateString('en-TZ', { month: 'long', year: 'numeric' })
    : period === 'week'
    ? `${new Date(rangeFrom+'T00:00:00Z').toLocaleDateString('en-TZ',{day:'2-digit',month:'short'})} – ${new Date(rangeTo+'T00:00:00Z').toLocaleDateString('en-TZ',{day:'2-digit',month:'short',year:'numeric'})}`
    : new Date(day.date + 'T00:00:00Z').toLocaleDateString('en-TZ', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <>
      <tr
        className="cursor-pointer hover:bg-stone-50 transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <td>
          <div className="flex items-center gap-2">
            {expanded
              ? <ChevronDown size={14} className="text-primary-500 shrink-0" />
              : <ChevronRight size={14} className="text-stone-400 shrink-0" />}
            <span className="font-medium text-stone-800">{label}</span>
          </div>
        </td>
        <td className="font-medium">{day.txCount}</td>
        <td className="font-bold text-primary-700">{fmt(day.revenue)}</td>
        <td className="text-stone-400 text-xs">{day.txCount > 0 ? fmt(day.revenue / day.txCount) : '—'}</td>
      </tr>

      {expanded && (
        <tr>
          <td colSpan={4} className="p-0">
            <div className="bg-stone-50 border-t border-b border-stone-200 px-6 py-3">
              {isLoading ? (
                <p className="text-xs text-stone-400 py-2">Loading…</p>
              ) : txns.length === 0 ? (
                <p className="text-xs text-stone-400 py-2">No transactions on this date</p>
              ) : (
                <>
                {/* Search bar */}
                <div className="relative mb-3 max-w-xs">
                  <Search size={12} className="absolute left-2.5 top-2 text-stone-400" />
                  <input
                    className="input pl-7 text-xs py-1.5 pr-7"
                    placeholder="Search receipt, customer, product…"
                    value={txSearch}
                    onChange={e => setTxSearch(e.target.value)}
                    onClick={e => e.stopPropagation()}
                  />
                  {txSearch && (
                    <button onClick={e => { e.stopPropagation(); setTxSearch(''); }}
                      className="absolute right-2 top-1.5 text-stone-400 hover:text-stone-600">
                      <X size={12} />
                    </button>
                  )}
                </div>
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="text-stone-500 border-b border-stone-200">
                      <th className="text-left py-1.5 pr-3 font-semibold">Receipt</th>
                      <th className="text-left py-1.5 pr-3 font-semibold">Time</th>
                      <th className="text-left py-1.5 pr-3 font-semibold">Customer</th>
                      <th className="text-left py-1.5 pr-3 font-semibold">Cashier</th>
                      <th className="text-left py-1.5 pr-3 font-semibold">Items</th>
                      <th className="text-right py-1.5 pr-3 font-semibold">Total</th>
                      <th className="text-right py-1.5 font-semibold">Payment</th>
                      <th className="w-16 text-right py-1.5 font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {txns
                      .filter(tx => {
                        if (!txSearch.trim()) return true;
                        const q = txSearch.toLowerCase();
                        return (
                          tx.receiptNo.toLowerCase().includes(q) ||
                          (tx.customer?.fullName ?? tx.customerName ?? '').toLowerCase().includes(q) ||
                          tx.items.some(i => i.name.toLowerCase().includes(q))
                        );
                      })
                      .map(tx => (
                        <tr key={tx.id} className={`border-b border-stone-100 last:border-0 ${tx.status === 'VOIDED' ? 'opacity-50' : ''}`}>
                          <td className="py-2 pr-3 font-mono text-stone-700">
                            {tx.receiptNo}
                            {tx.status === 'VOIDED' && (
                              <span className="ml-1 text-[10px] bg-red-100 text-red-600 rounded px-1">VOID</span>
                            )}
                          </td>
                          <td className="py-2 pr-3 text-stone-500 whitespace-nowrap">
                            {new Date(tx.createdAt).toLocaleTimeString('en-TZ', { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="py-2 pr-3 text-stone-600">
                            {tx.customer?.fullName ?? tx.customerName ?? <span className="text-stone-300">Walk-in</span>}
                          </td>
                          <td className="py-2 pr-3 text-stone-500">{tx.cashierName ?? '—'}</td>
                          <td className="py-2 pr-3">
                            <div className="space-y-0.5">
                              {tx.items.slice(0, 3).map((it, i) => (
                                <div key={i} className="text-stone-600">
                                  {it.name}
                                  <span className="text-stone-400 ml-1">×{it.quantity} {it.unitLabel}</span>
                                </div>
                              ))}
                              {tx.items.length > 3 && <span className="text-stone-400">+{tx.items.length - 3} more</span>}
                            </div>
                          </td>
                          <td className="py-2 pr-3 text-right font-semibold text-stone-900">{fmt(tx.total)}</td>
                          <td className="py-2 pr-3 text-right">
                            <span className="badge badge-stone">
                              {(tx.payments?.[0]?.method ?? 'CASH').replace('_', ' ')}
                            </span>
                          </td>
                          <td className="py-2 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={e => { e.stopPropagation(); handlePrint(tx.id); }}
                                disabled={loadingPrint === tx.id}
                                className="p-1 rounded text-stone-400 hover:text-primary-600 hover:bg-primary-50"
                                title="Reprint"
                              >
                                {loadingPrint === tx.id ? '…' : <Printer size={12} />}
                              </button>
                              {tx.status !== 'VOIDED' && (
                                <button
                                  onClick={e => { e.stopPropagation(); setVoidingId(tx.id); setVoidReason(''); setVoidErr(''); }}
                                  className="p-1 rounded text-stone-400 hover:text-red-600 hover:bg-red-50"
                                  title="Void & restore stock"
                                >
                                  <Trash2 size={12} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-stone-200 bg-white">
                      <td colSpan={5} className="py-1.5 text-stone-500 font-semibold">
                        {txns.length} transaction{txns.length !== 1 ? 's' : ''}
                        {txSearch && ` (${txns.filter(tx => {
                          const q = txSearch.toLowerCase();
                          return tx.receiptNo.toLowerCase().includes(q) ||
                            (tx.customer?.fullName ?? tx.customerName ?? '').toLowerCase().includes(q) ||
                            tx.items.some(i => i.name.toLowerCase().includes(q));
                        }).length} shown)`}
                      </td>
                      <td className="py-1.5 text-right font-bold text-stone-900">
                        {fmt(txns.filter(t => t.status !== 'VOIDED').reduce((s, t) => s + t.total, 0))}
                      </td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                </table>

                {/* Void confirmation modal */}
                {voidingId && (
                  <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
                    onClick={e => e.stopPropagation()}>
                    <div className="card p-5 w-full max-w-xs">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-bold text-stone-900">Void Transaction</h3>
                        <button onClick={() => setVoidingId(null)} className="text-stone-400 hover:text-stone-700"><X size={16} /></button>
                      </div>
                      <p className="text-xs text-stone-500 mb-4">
                        Stock will be restored and the sale excluded from revenue. Cannot be undone.
                      </p>
                      <div className="mb-3">
                        <label className="label">Reason</label>
                        <input className="input text-xs" placeholder="e.g. Wrong item, entry error"
                          value={voidReason} onChange={e => setVoidReason(e.target.value)} autoFocus />
                      </div>
                      {voidErr && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5 mb-3">{voidErr}</p>}
                      <div className="flex gap-2">
                        <button className="btn-secondary flex-1 text-xs" onClick={() => setVoidingId(null)}>Cancel</button>
                        <button
                          className="flex-1 text-xs py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold disabled:opacity-50"
                          disabled={voiding}
                          onClick={() => doVoid({ id: voidingId, reason: voidReason })}>
                          {voiding ? 'Voiding…' : 'Void & Restore Stock'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                </>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function SalesReportPage() {
  const { shopId } = useAuthStore();
  const location = useLocation();
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('week');
  const [from, setFrom] = useState(() => {
    const d = new Date(Date.now() - 7 * 86_400_000); return d.toISOString().split('T')[0];
  });
  const [to, setTo] = useState(() => new Date().toISOString().split('T')[0]);

  const [pmFilter, setPmFilter] = useState('');  // '' = all, 'CASH', 'MOBILE_MONEY', 'CARD', 'DEBIT'

  const { data, isLoading, isError, error } = useQuery<SalesReport>({
    queryKey: ['sales-report', shopId, period, from, to, pmFilter],
    queryFn: () =>
      api.get('/reporting/sales', {
        params: { period, from, to, ...(pmFilter && { paymentMethod: pmFilter }) },
      }).then(r => r.data.data),
    enabled: !!shopId,
    retry: false,
  });

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Reports</h1>
          <p className="page-subtitle">Revenue & transaction analytics</p>
        </div>
        <div className="flex gap-2">
          <button
            className="btn-secondary text-xs"
            disabled={!data}
            onClick={() => {
              if (!data) return;
              downloadCsv(`sales-summary-${from}-to-${to}.csv`,
                (data.byDay ?? []).map(d => [d.date, d.txCount, d.revenue, d.txCount > 0 ? (d.revenue / d.txCount).toFixed(0) : 0]),
                ['Date', 'Transactions', 'Revenue (TZS)', 'Avg Ticket (TZS)']
              );
            }}
          >
            <Download size={13} className="mr-1" /> Summary CSV
          </button>
          <button
            className="btn-secondary text-xs"
            disabled={!data}
            onClick={async () => {
              if (!shopId) return;
              const res = await api.get('/pos/transactions', { params: { from, to, limit: 1000 } });
              const txns: Tx[] = res.data.data ?? [];
              const rows: (string | number | null)[][] = [];
              for (const tx of txns) {
                for (const it of tx.items) {
                  rows.push([
                    tx.receiptNo,
                    new Date(tx.createdAt).toLocaleString('en-TZ'),
                    tx.customer?.fullName ?? tx.customerName ?? 'Walk-in',
                    tx.cashierName ?? '',
                    it.name,
                    it.quantity,
                    it.unitLabel,
                    it.unitPrice,
                    it.discountPct,
                    it.lineTotal,
                    tx.total,
                    tx.payments?.[0]?.method ?? '',
                    tx.status,
                  ]);
                }
              }
              downloadCsv(`sales-transactions-${from}-to-${to}.csv`, rows,
                ['Receipt No', 'Date & Time', 'Customer', 'Cashier', 'Product', 'Qty', 'Unit', 'Unit Price', 'Discount %', 'Line Total', 'Tx Total', 'Payment', 'Status']
              );
            }}
          >
            <Download size={13} className="mr-1" /> Transactions CSV
          </button>
        </div>
      </div>

      {/* Report tabs */}
      <div className="flex items-center gap-1 bg-stone-100 rounded-lg p-1 w-fit">
        {REPORT_TABS.map(({ to: tabTo, label, icon: Icon }) => (
          <Link key={tabTo} to={tabTo}
            className={`flex items-center gap-1.5 px-4 py-1.5 text-xs rounded-md transition-colors font-medium ${
              location.pathname === tabTo ? 'bg-white shadow-sm text-stone-900' : 'text-stone-500 hover:text-stone-700'
            }`}
          >
            <Icon size={13} />{label}
          </Link>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 bg-stone-100 rounded-lg p-1">
          {(['day', 'week', 'month'] as const).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors capitalize ${
                period === p ? 'bg-white shadow-sm text-stone-900 font-medium' : 'text-stone-500 hover:text-stone-700'
              }`}
            >{p}</button>
          ))}
        </div>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="input w-auto text-xs" />
        <span className="text-stone-400 text-xs">to</span>
        <input type="date" value={to} onChange={e => setTo(e.target.value)} className="input w-auto text-xs" />
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-stone-400 shrink-0">Payment:</span>
          {[
            { value: '',            label: 'All' },
            { value: 'CASH',        label: 'Cash' },
            { value: 'MOBILE_MONEY',label: 'Mobile' },
            { value: 'CARD',        label: 'Card' },
            { value: 'DEBIT',       label: 'Debit' },
          ].map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setPmFilter(value)}
              className={`px-3 py-1 text-xs rounded-full border font-medium transition-colors ${
                pmFilter === value
                  ? 'border-primary-500 bg-primary-500 text-white shadow-sm'
                  : 'border-stone-200 text-stone-600 hover:border-primary-300 hover:text-primary-600 bg-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {isError && (
        <div className="card p-4 border-red-200 bg-red-50 text-red-700 text-sm">
          {(error as {response?:{data?:{message?:string}}})?.response?.data?.message || 'Failed to load report data.'}
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="card p-5 animate-pulse h-24 bg-stone-100" />)}
        </div>
      ) : !isError && (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Revenue',       value: fmt(data?.summary.revenue ?? 0) },
              { label: 'Transactions',  value: String(data?.summary.transactions ?? 0) },
              { label: 'Avg. Ticket',   value: fmt(data?.summary.avgTicket ?? 0) },
              { label: 'Gross Profit',  value: fmt(data?.summary.grossProfit ?? 0) },
            ].map(s => (
              <div key={s.label} className="card p-5">
                <p className="stat-value">{s.value}</p>
                <p className="stat-label">{s.label}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Revenue chart */}
            <div className="card p-5 lg:col-span-2">
              <h3 className="text-sm font-semibold text-stone-700 mb-4">Revenue by {period}</h3>
              {(data?.byDay ?? []).length === 0 ? (
                <div className="flex items-center justify-center h-[200px] text-stone-400 text-sm">No transactions in this period</div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={data?.byDay ?? []} barSize={16}>
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false}
                      tickFormatter={v => new Date(v + 'T00:00:00Z').toLocaleDateString('en-TZ', { month: 'short', day: 'numeric' })} />
                    <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false}
                      tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: number) => fmt(v)} />
                    <Bar dataKey="revenue" fill="#a66624" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Payment methods */}
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-stone-700 mb-4">Payment methods</h3>
              {(() => {
                // Filter out zero-amount entries (e.g. unsettled DEBIT)
                const pmData = (data?.byPaymentMethod ?? []).filter(p => p.total > 0);
                if (pmData.length === 0) return (
                  <div className="flex items-center justify-center h-[200px] text-stone-400 text-sm">No payment data</div>
                );
                return (
                  <>
                    <ResponsiveContainer width="100%" height={180}>
                      <PieChart>
                        <Pie
                          data={pmData}
                          dataKey="total"
                          nameKey="label"
                          cx="50%" cy="50%"
                          outerRadius={70}
                          label={false}
                          labelLine={false}
                        >
                          {pmData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(v: number) => fmt(v)} />
                      </PieChart>
                    </ResponsiveContainer>
                    {/* Legend below chart */}
                    <div className="mt-2 space-y-1">
                      {pmData.map((p, i) => {
                        const total = pmData.reduce((s, x) => s + x.total, 0);
                        const pct   = total > 0 ? Math.round((p.total / total) * 100) : 0;
                        return (
                          <div key={p.label} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                              <span className="text-stone-600">{p.label}</span>
                            </div>
                            <div className="flex items-center gap-2 text-right">
                              <span className="text-stone-400">{pct}%</span>
                              <span className="font-medium text-stone-900 w-24">{fmt(p.total)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                );
              })()}
            </div>
          </div>

          {/* Expandable transactions by day */}
          {(data?.byDay ?? []).length > 0 && (
            <div className="card">
              <div className="px-5 py-3 border-b border-stone-100 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-stone-700">Transactions by day</h3>
                <p className="text-xs text-stone-400">Click a row to expand individual transactions</p>
              </div>
              <div className="table-wrapper overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Transactions</th>
                      <th>Revenue</th>
                      <th>Avg. Ticket</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.byDay ?? []).map(day => (
                      <DayRow key={day.date} day={day} shopId={shopId} pmFilter={pmFilter} period={period} />
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-stone-200 bg-stone-50">
                      <td className="font-semibold text-stone-700 py-2 px-3">Total</td>
                      <td className="font-bold">{data?.summary.transactions ?? 0}</td>
                      <td className="font-bold">{fmt(data?.summary.revenue ?? 0)}</td>
                      <td className="font-bold">{fmt(data?.summary.avgTicket ?? 0)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Top products */}
          <div className="card">
            <div className="px-5 py-4 border-b border-stone-100">
              <h3 className="text-sm font-semibold text-stone-700">Top products</h3>
            </div>
            <div className="table-wrapper">
              <table className="table">
                <thead><tr><th>#</th><th>Product</th><th>Revenue</th><th>Units sold</th></tr></thead>
                <tbody>
                  {(data?.topProducts ?? []).map((p, i) => (
                    <tr key={i}>
                      <td className="text-stone-400">{i + 1}</td>
                      <td className="font-medium">{p.name}</td>
                      <td>{fmt(p.revenue)}</td>
                      <td>{p.qty}</td>
                    </tr>
                  ))}
                  {!data?.topProducts?.length && <tr><td colSpan={4} className="text-center text-stone-400 py-6">No data</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
