import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Search, X, Printer, Calendar, ChevronLeft, ChevronRight,
  Receipt, Download, Loader2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { printReceipt as doPrint } from '../../utils/printReceipt';
import { PageLoader } from '../../components/ui/Loader';

interface Tx {
  id: string; receiptNo: string; total: number; subtotal: number; discountAmount: number;
  status: string; createdAt: string; cashierName?: string | null;
  customerName?: string | null;
  customer?: { fullName: string } | null;
  payments: { method: string; amount: number }[];
  items: { name: string; quantity: number; unitPrice: number; unitLabel: string; discountPct: number; lineTotal: number }[];
}
interface TxDetail extends Tx {
  customerTin?: string;
  _shop?: { tradingName?: string; addressLine1?: string; city?: string; phone?: string; tin?: string; vrn?: string; taxMode?: string };
}
interface Meta {
  total: number; page: number; limit: number; pages: number;
  sumCompleted: number; countCompleted: number;
}

const STATUS_BADGE: Record<string, string> = {
  COMPLETED: 'bg-emerald-100 text-emerald-700',
  VOIDED:    'bg-red-100 text-red-700',
  REFUNDED:  'bg-amber-100 text-amber-700',
  PENDING:   'bg-stone-100 text-stone-600',
};

const PAYMENT_LABEL: Record<string, string> = {
  CASH: 'Cash', MOBILE_MONEY: 'Mobile Money', CARD: 'Card', DEBIT: 'Credit', BANK: 'Bank',
};

function fmt(n: number) {
  return new Intl.NumberFormat('sw-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 0 }).format(n);
}
function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function payLabel(tx: Tx) {
  if (!tx.payments?.length) return '—';
  if (tx.payments.length > 1) return `Split (${tx.payments.length})`;
  return PAYMENT_LABEL[tx.payments[0].method] ?? tx.payments[0].method;
}
function custName(tx: Tx) {
  return tx.customer?.fullName || tx.customerName || '—';
}

function downloadCsv(rows: Tx[]) {
  const headers = ['Date', 'Time', 'Receipt No', 'Customer', 'Cashier', 'Payment', 'Status', 'Items', 'Total'];
  const lines = rows.map(t => {
    const d = new Date(t.createdAt);
    return [
      d.toLocaleDateString('en-CA'),
      d.toLocaleTimeString('en-GB'),
      t.receiptNo,
      custName(t),
      t.cashierName || '—',
      payLabel(t),
      t.status,
      t.items?.length ?? 0,
      t.total,
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([[headers.join(','), ...lines].join('\n')], { type: 'text/csv' }));
  a.download = `transactions-${ymd(new Date())}.csv`;
  a.click();
}

export default function TransactionsPage() {
  const { t } = useTranslation();
  const { shopId, account } = useAuthStore();

  const [search, setSearch]   = useState('');
  const [from, setFrom]       = useState('');
  const [to, setTo]           = useState('');
  const [status, setStatus]   = useState('');
  const [method, setMethod]   = useState('');
  const [page, setPage]       = useState(1);

  const [printTx, setPrintTx]       = useState<TxDetail | null>(null);
  const [loadingTxId, setLoadingId] = useState<string | null>(null);

  const { data, isLoading, isFetching } = useQuery<{ data: Tx[]; meta: Meta }>({
    queryKey: ['transactions', shopId, search, from, to, status, method, page],
    queryFn: () => api.get('/pos/transactions', {
      params: {
        search: search || undefined,
        from:   from   || undefined,
        to:     to     || undefined,
        status: status || undefined,
        paymentMethod: method || undefined,
        page, limit: 25,
      },
    }).then(r => ({ data: r.data.data, meta: r.data.meta })),
    enabled: !!shopId,
    placeholderData: prev => prev,
  });

  const rows = data?.data ?? [];
  const meta = data?.meta;

  function resetPage<T>(setter: (v: T) => void) {
    return (v: T) => { setter(v); setPage(1); };
  }

  function applyPreset(days: number | 'today' | 'all') {
    const today = ymd(new Date());
    if (days === 'all')   { setFrom(''); setTo(''); }
    else if (days === 'today') { setFrom(today); setTo(today); }
    else { setFrom(ymd(new Date(Date.now() - (days - 1) * 864e5))); setTo(today); }
    setPage(1);
  }

  const hasFilters = !!(search || from || to || status || method);
  function clearAll() {
    setSearch(''); setFrom(''); setTo(''); setStatus(''); setMethod(''); setPage(1);
  }

  async function fetchAndPrint(txId: string) {
    setLoadingId(txId);
    try {
      const [txRes, shopRes] = await Promise.all([
        api.get(`/pos/transactions/${txId}`),
        shopId ? api.get(`/shops/${shopId}`) : Promise.resolve(null),
      ]);
      setPrintTx({ ...txRes.data.data, _shop: shopRes?.data?.data });
    } catch { /* ignore */ }
    setLoadingId(null);
  }

  function executePrint(tx: TxDetail) {
    const cashPay = tx.payments?.find(p => p.method === 'CASH');
    doPrint({
      receiptNo:     tx.receiptNo,
      total:         tx.total,
      subtotal:      tx.subtotal,
      discount:      tx.discountAmount,
      paymentMethod: tx.payments?.[0]?.method ?? 'CASH',
      cashReceived:  cashPay?.amount ?? 0,
      change:        0,
      payments:      tx.payments,
      items: tx.items.map(i => ({
        name: i.name, qty: i.quantity, unitPrice: i.unitPrice,
        discountPct: i.discountPct, lineTotal: i.lineTotal, unit: i.unitLabel,
      })),
      shop: {
        tradingName:  tx._shop?.tradingName ?? account?.legalName ?? 'MauzoSmart',
        addressLine1: tx._shop?.addressLine1,
        city:         tx._shop?.city,
        phone:        tx._shop?.phone,
        tin:          tx._shop?.tin,
        vrn:          tx._shop?.vrn,
        taxMode:      tx._shop?.taxMode,
      },
      customerName: tx.customer?.fullName ?? tx.customerName ?? undefined,
      customerTin:  tx.customerTin,
      printedAt:    tx.createdAt,
      isReprint:    true,
    });
    setPrintTx(null);
  }

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div>
          <h1 className="page-title">Transactions</h1>
          <p className="page-subtitle">
            {meta ? `${meta.total.toLocaleString()} transaction${meta.total === 1 ? '' : 's'}` : 'All sales'}
            {isFetching && !isLoading && ' · updating…'}
          </p>
        </div>
        <button className="btn-secondary" onClick={() => downloadCsv(rows)} disabled={rows.length === 0}>
          <Download size={14} className="mr-1.5" /> {t('common.export')}
        </button>
      </div>

      {/* Summary — reflects every row matching the filters, not just this page */}
      {meta && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="card p-4">
            <p className="text-xs text-stone-500 mb-1">Completed sales</p>
            <p className="text-xl font-bold text-emerald-600">{fmt(meta.sumCompleted)}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-stone-500 mb-1">Completed count</p>
            <p className="text-xl font-bold text-stone-800">{meta.countCompleted.toLocaleString()}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-stone-500 mb-1">All records</p>
            <p className="text-xl font-bold text-stone-800">{meta.total.toLocaleString()}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-3 text-stone-400" />
            <input
              className="input pl-8 w-full"
              placeholder="Receipt no, customer, or cashier…"
              value={search}
              onChange={e => resetPage(setSearch)(e.target.value)}
            />
          </div>
          <select className="select sm:w-40" value={status} onChange={e => resetPage(setStatus)(e.target.value)}>
            <option value="">All statuses</option>
            <option value="COMPLETED">Completed</option>
            <option value="VOIDED">Voided</option>
            <option value="REFUNDED">Refunded</option>
          </select>
          <select className="select sm:w-44" value={method} onChange={e => resetPage(setMethod)(e.target.value)}>
            <option value="">All payment methods</option>
            <option value="CASH">Cash</option>
            <option value="MOBILE_MONEY">Mobile Money</option>
            <option value="CARD">Card</option>
            <option value="DEBIT">Credit / Debt</option>
            <option value="BANK">Bank</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-stone-100">
          <Calendar size={14} className="text-stone-400 shrink-0" />
          <input type="date" className="input py-1.5 text-xs w-36"
            value={from} onChange={e => resetPage(setFrom)(e.target.value)} />
          <span className="text-xs text-stone-400">to</span>
          <input type="date" className="input py-1.5 text-xs w-36"
            value={to} onChange={e => resetPage(setTo)(e.target.value)} />

          <div className="flex gap-1 ml-1">
            {([['Today', 'today'], ['7 days', 7], ['30 days', 30], ['All', 'all']] as const).map(([label, v]) => (
              <button key={label} onClick={() => applyPreset(v)}
                className="px-2.5 py-1 text-[11px] rounded-md border border-stone-200 text-stone-500 hover:border-primary-400 hover:text-primary-600 transition-colors">
                {label}
              </button>
            ))}
          </div>

          {hasFilters && (
            <button onClick={clearAll} className="ml-auto text-xs text-stone-400 hover:text-red-500 flex items-center gap-1">
              <X size={12} /> Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="card">
        {isLoading ? (
          <PageLoader />
        ) : (
          <>
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Receipt</th>
                    <th>Customer</th>
                    <th>Cashier</th>
                    <th>Payment</th>
                    <th>Status</th>
                    <th className="text-right">Total</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(tx => (
                    <tr key={tx.id}>
                      <td className="text-stone-500 text-xs whitespace-nowrap">
                        {new Date(tx.createdAt).toLocaleDateString('en-TZ', { day: '2-digit', month: 'short', year: 'numeric' })}
                        <span className="text-stone-400 ml-1">
                          {new Date(tx.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </td>
                      <td className="font-mono text-xs font-medium text-stone-800">{tx.receiptNo}</td>
                      <td className="text-xs text-stone-600 max-w-[140px] truncate">{custName(tx)}</td>
                      <td className="text-xs text-stone-500">{tx.cashierName || '—'}</td>
                      <td className="text-xs text-stone-600">{payLabel(tx)}</td>
                      <td>
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_BADGE[tx.status] ?? 'bg-stone-100 text-stone-600'}`}>
                          {tx.status}
                        </span>
                      </td>
                      <td className={`text-right font-semibold ${tx.status === 'VOIDED' ? 'text-stone-400 line-through' : 'text-stone-900'}`}>
                        {fmt(tx.total)}
                      </td>
                      <td className="text-right">
                        <button
                          onClick={() => fetchAndPrint(tx.id)}
                          disabled={loadingTxId === tx.id}
                          title="Reprint receipt"
                          className="p-1.5 rounded text-stone-400 hover:text-primary-600 hover:bg-primary-50 transition-colors disabled:opacity-40"
                        >
                          {loadingTxId === tx.id
                            ? <Loader2 size={14} className="animate-spin" />
                            : <Printer size={14} />}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={8} className="text-center text-stone-400 py-12">
                        <Receipt size={30} className="mx-auto mb-2 opacity-30" />
                        <p className="text-sm">{hasFilters ? 'No transactions match these filters' : 'No transactions yet'}</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {meta && meta.pages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-stone-100">
                <p className="text-xs text-stone-500">
                  Showing {(page - 1) * meta.limit + 1}–{Math.min(page * meta.limit, meta.total)} of {meta.total.toLocaleString()}
                </p>
                <div className="flex items-center gap-1">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                    className="p-1.5 rounded hover:bg-stone-100 disabled:opacity-40 disabled:cursor-not-allowed">
                    <ChevronLeft size={15} />
                  </button>
                  {Array.from({ length: Math.min(meta.pages, 7) }, (_, i) => {
                    const p = meta.pages <= 7 ? i + 1
                      : page <= 4 ? i + 1
                      : page >= meta.pages - 3 ? meta.pages - 6 + i
                      : page - 3 + i;
                    return (
                      <button key={p} onClick={() => setPage(p)}
                        className={`w-7 h-7 text-xs rounded ${p === page ? 'bg-primary-600 text-white' : 'hover:bg-stone-100 text-stone-600'}`}>
                        {p}
                      </button>
                    );
                  })}
                  <button onClick={() => setPage(p => Math.min(meta.pages, p + 1))} disabled={page === meta.pages}
                    className="p-1.5 rounded hover:bg-stone-100 disabled:opacity-40 disabled:cursor-not-allowed">
                    <ChevronRight size={15} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Reprint confirmation */}
      {printTx && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card p-5 w-full max-w-xs">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-stone-900">Reprint receipt</h3>
              <button onClick={() => setPrintTx(null)} className="text-stone-400 hover:text-stone-700"><X size={16} /></button>
            </div>
            <div className="text-xs space-y-1 mb-4 bg-stone-50 rounded-lg p-3">
              <p className="font-mono font-semibold text-stone-800">{printTx.receiptNo}</p>
              <p className="text-stone-400">{new Date(printTx.createdAt).toLocaleString('en-TZ')}</p>
              {custName(printTx) !== '—' && <p className="text-stone-600">{custName(printTx)}</p>}
              <div className="pt-1 border-t border-stone-200 space-y-0.5">
                {printTx.items.slice(0, 4).map((it, i) => (
                  <div key={i} className="flex justify-between text-[11px] text-stone-600">
                    <span className="truncate pr-2">{it.name} ×{it.quantity}</span>
                    <span className="shrink-0">{fmt(it.lineTotal)}</span>
                  </div>
                ))}
                {printTx.items.length > 4 && (
                  <p className="text-[10px] text-stone-400">+{printTx.items.length - 4} more</p>
                )}
              </div>
              <div className="flex justify-between pt-1 border-t border-stone-200 font-bold text-stone-900">
                <span>Total</span><span>{fmt(printTx.total)}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <button className="btn-secondary flex-1 text-xs" onClick={() => setPrintTx(null)}>{t('common.cancel')}</button>
              <button className="btn-primary flex-1 text-xs" onClick={() => executePrint(printTx)}>
                <Printer size={12} className="mr-1.5" /> {t('common.print')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
