import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { useDataTable, SortableTh, TablePagination } from '../../components/ui/DataTable';

interface VoidedTx {
  id: string; receiptNo: string; total: number; createdAt: string; note?: string;
  cashierName?: string;
  customer?: { fullName: string } | null;
  customerName?: string;
  items: { name: string; quantity: number; unitLabel: string; lineTotal: number }[];
  payments: { method: string; amount: number }[];
}

function fmt(n: number) {
  return new Intl.NumberFormat('sw-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 0 }).format(n);
}

export default function VoidsPage() {
  const { t } = useTranslation();
  const { shopId } = useAuthStore();
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate()-30); return d.toISOString().split('T')[0]; });
  const [to, setTo]     = useState(() => new Date().toISOString().split('T')[0]);

  const { data: voids = [], isLoading } = useQuery<VoidedTx[]>({
    queryKey: ['voided-txns', shopId, from, to],
    queryFn: () => api.get('/pos/transactions', { params: { status: 'VOIDED', from, to, limit: 200 } })
                       .then(r => r.data.data),
    enabled: !!shopId,
  });

  const voidsTable = useDataTable(voids, {
    searchable: v => [v.receiptNo, v.customer?.fullName ?? v.customerName, v.cashierName, v.note],
    sortValues: {
      receiptNo: v => v.receiptNo,
      createdAt: v => new Date(v.createdAt),
      customer: v => v.customer?.fullName ?? v.customerName,
      cashier: v => v.cashierName,
      total: v => v.total,
      note: v => v.note,
    },
    initialSort: { field: 'createdAt', dir: 'desc' },
    pageSize: 20,
  });

  const totalVoided = voidsTable.sorted.reduce((s, v) => s + v.total, 0);

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('voids.title')}</h1>
          <p className="page-subtitle">Reversed / amended sales</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={13} className="absolute left-3 top-2.5 text-stone-400" />
          <input className="input pl-8 text-xs" placeholder="Search receipt, customer, cashier…"
            value={voidsTable.search} onChange={e => voidsTable.setSearch(e.target.value)} />
        </div>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="input w-auto text-xs" />
        <span className="text-stone-400 text-xs">to</span>
        <input type="date" value={to} onChange={e => setTo(e.target.value)} className="input w-auto text-xs" />
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4">
        <div className="card p-5">
          <p className="stat-value">{voidsTable.total}</p>
          <p className="stat-label">Voided transactions</p>
        </div>
        <div className="card p-5">
          <p className="stat-value text-red-600">{fmt(totalVoided)}</p>
          <p className="stat-label">Total value reversed</p>
        </div>
      </div>

      {/* Table */}
      <div className="card">
        {isLoading ? (
          <div className="p-8 text-center text-stone-400">{t('common.loading')}</div>
        ) : voidsTable.total === 0 ? (
          <div className="p-8 text-center text-stone-400">{t('voids.noVoids')}</div>
        ) : (
          <>
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <SortableTh field="receiptNo" sort={voidsTable.sort} onSort={voidsTable.toggleSort}>{t('voids.receipt')}</SortableTh>
                  <SortableTh field="createdAt" sort={voidsTable.sort} onSort={voidsTable.toggleSort}>{t('voids.date')}</SortableTh>
                  <SortableTh field="customer" sort={voidsTable.sort} onSort={voidsTable.toggleSort}>Customer</SortableTh>
                  <SortableTh field="cashier" sort={voidsTable.sort} onSort={voidsTable.toggleSort}>{t('voids.cashier')}</SortableTh>
                  <th>Items</th>
                  <SortableTh field="total" sort={voidsTable.sort} onSort={voidsTable.toggleSort}>{t('voids.amount')}</SortableTh>
                  <SortableTh field="note" sort={voidsTable.sort} onSort={voidsTable.toggleSort}>{t('voids.reason')}</SortableTh>
                </tr>
              </thead>
              <tbody>
                {voidsTable.view.map(tx => (
                  <tr key={tx.id} className="opacity-70">
                    <td className="font-mono text-xs text-red-600">{tx.receiptNo}</td>
                    <td className="text-xs text-stone-400 whitespace-nowrap">
                      {new Date(tx.createdAt).toLocaleString('en-TZ', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}
                    </td>
                    <td className="text-stone-600 text-xs">{tx.customer?.fullName ?? tx.customerName ?? <span className="text-stone-300">Walk-in</span>}</td>
                    <td className="text-stone-500 text-xs">{tx.cashierName ?? '—'}</td>
                    <td className="text-xs text-stone-600">
                      {tx.items.slice(0, 2).map((it, i) => (
                        <div key={i}>{it.name} ×{it.quantity}</div>
                      ))}
                      {tx.items.length > 2 && <span className="text-stone-400">+{tx.items.length - 2} more</span>}
                    </td>
                    <td className="font-medium line-through text-stone-400">{fmt(tx.total)}</td>
                    <td className="text-xs text-stone-400 italic">{tx.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-stone-200 bg-stone-50">
                  <td colSpan={5} className="font-semibold text-stone-700 py-2 px-3">{voidsTable.total} voided</td>
                  <td className="font-bold text-red-600 line-through">{fmt(totalVoided)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
          <TablePagination page={voidsTable.page} pageCount={voidsTable.pageCount} total={voidsTable.total} pageSize={voidsTable.pageSize} onPage={voidsTable.setPage} onPageSize={voidsTable.setPageSize} />
          </>
        )}
      </div>
    </div>
  );
}
