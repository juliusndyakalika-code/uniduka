import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Plus, Search, FileText, ChevronLeft, ChevronRight, AlertTriangle, Package,
} from 'lucide-react';
import api from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { PageLoader } from '../../components/ui/Loader';

interface Invoice {
  id: string; invoiceNo: string; status: string;
  billToName: string; billToPhone?: string | null;
  total: number; amountPaid: number; balance: number;
  isOverdue: boolean; isFulfilled: boolean;
  dueAt?: string | null; issuedAt?: string | null; createdAt: string;
}
interface Meta {
  total: number; page: number; limit: number; pages: number;
  counts: Record<string, number>;
  outstanding: number; overdueAmount: number;
}

const STATUS_STYLE: Record<string, string> = {
  DRAFT:          'bg-stone-100 text-stone-600',
  SENT:           'bg-blue-100 text-blue-700',
  PARTIALLY_PAID: 'bg-amber-100 text-amber-700',
  PAID:           'bg-emerald-100 text-emerald-700',
  CANCELLED:      'bg-red-100 text-red-700',
};

const TABS = [
  { key: '',               label: 'All' },
  { key: 'DRAFT',          label: 'Drafts' },
  { key: 'SENT',           label: 'Awaiting payment' },
  { key: 'PARTIALLY_PAID', label: 'Part paid' },
  { key: 'PAID',           label: 'Paid' },
];

function money(n: number, c = 'TZS') {
  return new Intl.NumberFormat('sw-TZ', { style: 'currency', currency: c, maximumFractionDigits: 0 }).format(n);
}
function dateOf(iso?: string | null) {
  return iso ? new Date(iso).toLocaleDateString('en-TZ', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
}

export default function InvoicesPage() {
  const { shopId } = useAuthStore();
  const navigate = useNavigate();

  const [tab, setTab]         = useState('');
  const [search, setSearch]   = useState('');
  const [overdue, setOverdue] = useState(false);
  const [page, setPage]       = useState(1);

  const { data, isLoading } = useQuery<{ data: Invoice[]; meta: Meta }>({
    queryKey: ['invoices', shopId, tab, search, overdue, page],
    queryFn: () => api.get('/invoices', {
      params: {
        status: overdue ? undefined : (tab || undefined),
        overdue: overdue ? 'true' : undefined,
        search: search || undefined,
        page, limit: 25,
      },
    }).then(r => ({ data: r.data.data, meta: r.data.meta })),
    enabled: !!shopId,
    placeholderData: prev => prev,
  });

  const invoices = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div>
          <h1 className="page-title">Invoices</h1>
          <p className="page-subtitle">Bill customers now, get paid later. Stock moves only on delivery.</p>
        </div>
        <Link to="/invoices/new" className="btn-primary">
          <Plus size={14} className="mr-1.5" /> New invoice
        </Link>
      </div>

      {/* Headline figures cover every open invoice, not just this page */}
      {meta && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="card p-4">
            <p className="text-xs text-stone-500 mb-1">Outstanding</p>
            <p className="text-xl font-bold text-stone-900">{money(meta.outstanding)}</p>
          </div>
          <button
            onClick={() => { setOverdue(o => !o); setPage(1); }}
            className={`card p-4 text-left transition-colors ${overdue ? 'ring-2 ring-red-400' : ''} ${meta.overdueAmount > 0 ? 'hover:bg-red-50' : ''}`}
          >
            <p className="text-xs text-stone-500 mb-1 flex items-center gap-1">
              {meta.overdueAmount > 0 && <AlertTriangle size={11} className="text-red-500" />}
              Overdue {overdue && <span className="text-red-500 font-semibold">· filtering</span>}
            </p>
            <p className={`text-xl font-bold ${meta.overdueAmount > 0 ? 'text-red-600' : 'text-stone-400'}`}>
              {money(meta.overdueAmount)}
            </p>
          </button>
          <div className="card p-4">
            <p className="text-xs text-stone-500 mb-1">Invoices</p>
            <p className="text-xl font-bold text-stone-800">{meta.total.toLocaleString()}</p>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="flex gap-1.5 overflow-x-auto flex-1">
          {TABS.map(t => (
            <button key={t.key}
              onClick={() => { setTab(t.key); setOverdue(false); setPage(1); }}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                !overdue && tab === t.key ? 'bg-stone-900 text-white' : 'bg-white border border-stone-200 text-stone-600'}`}>
              {t.label}
              {!!t.key && !!meta?.counts?.[t.key] && (
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                  !overdue && tab === t.key ? 'bg-white/20' : 'bg-stone-100 text-stone-600'}`}>
                  {meta.counts[t.key]}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="relative sm:w-56">
          <Search size={14} className="absolute left-3 top-3 text-stone-400" />
          <input className="input pl-8 w-full" placeholder="Number, name, phone…"
            value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
      </div>

      <div className="card">
        {isLoading ? (
          <PageLoader />
        ) : invoices.length === 0 ? (
          <div className="p-12 text-center">
            <FileText size={32} className="mx-auto mb-3 text-stone-300" />
            <p className="text-sm font-semibold text-stone-700">No invoices here</p>
            <p className="text-xs text-stone-400 mt-1">
              {search || tab || overdue ? 'Try a different filter' : 'Raise your first invoice to bill a customer'}
            </p>
          </div>
        ) : (
          <>
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Customer</th>
                    <th>Issued</th>
                    <th>Due</th>
                    <th>Status</th>
                    <th className="text-right">Total</th>
                    <th className="text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map(inv => (
                    <tr key={inv.id}
                      onClick={() => navigate(`/invoices/${inv.id}`)}
                      className="cursor-pointer hover:bg-stone-50">
                      <td>
                        <span className="font-mono text-xs font-semibold text-stone-900">{inv.invoiceNo}</span>
                        {inv.isFulfilled && (
                          <span title="Goods delivered" className="ml-1.5 inline-flex align-middle text-emerald-600">
                            <Package size={11} />
                          </span>
                        )}
                      </td>
                      <td className="text-xs">
                        <p className="font-medium text-stone-900 truncate max-w-[160px]">{inv.billToName}</p>
                        {inv.billToPhone && <p className="text-stone-400">{inv.billToPhone}</p>}
                      </td>
                      <td className="text-xs text-stone-500">{dateOf(inv.issuedAt)}</td>
                      <td className={`text-xs ${inv.isOverdue ? 'text-red-600 font-semibold' : 'text-stone-500'}`}>
                        {dateOf(inv.dueAt)}
                        {inv.isOverdue && <span className="block text-[10px]">overdue</span>}
                      </td>
                      <td>
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_STYLE[inv.status] ?? 'bg-stone-100'}`}>
                          {inv.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="text-right text-xs font-medium text-stone-700">{money(inv.total)}</td>
                      <td className={`text-right font-semibold ${inv.balance > 0 ? 'text-stone-900' : 'text-emerald-600'}`}>
                        {inv.balance > 0 ? money(inv.balance) : 'Paid'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {meta && meta.pages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-stone-100">
                <p className="text-xs text-stone-500">
                  Showing {(page - 1) * meta.limit + 1}–{Math.min(page * meta.limit, meta.total)} of {meta.total}
                </p>
                <div className="flex items-center gap-1">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                    className="p-1.5 rounded hover:bg-stone-100 disabled:opacity-40"><ChevronLeft size={15} /></button>
                  <span className="text-xs px-2">{page} / {meta.pages}</span>
                  <button onClick={() => setPage(p => Math.min(meta.pages, p + 1))} disabled={page === meta.pages}
                    className="p-1.5 rounded hover:bg-stone-100 disabled:opacity-40"><ChevronRight size={15} /></button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
