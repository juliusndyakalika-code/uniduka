import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import api from '../../api/client';
import { useAuthStore } from '../../store/authStore';

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
  const { shopId } = useAuthStore();
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate()-30); return d.toISOString().split('T')[0]; });
  const [to, setTo]     = useState(() => new Date().toISOString().split('T')[0]);
  const [search, setSearch] = useState('');

  const { data: voids = [], isLoading } = useQuery<VoidedTx[]>({
    queryKey: ['voided-txns', shopId, from, to],
    queryFn: () => api.get('/pos/transactions', { params: { status: 'VOIDED', from, to, limit: 200 } })
                       .then(r => r.data.data),
    enabled: !!shopId,
  });

  const filtered = search
    ? voids.filter(v => v.receiptNo.toLowerCase().includes(search.toLowerCase())
        || (v.customer?.fullName ?? v.customerName ?? '').toLowerCase().includes(search.toLowerCase()))
    : voids;

  const totalVoided = filtered.reduce((s, v) => s + v.total, 0);

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Voided Transactions</h1>
          <p className="page-subtitle">Reversed / amended sales</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={13} className="absolute left-3 top-2.5 text-stone-400" />
          <input className="input pl-8 text-xs" placeholder="Search receipt or customer…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="input w-auto text-xs" />
        <span className="text-stone-400 text-xs">to</span>
        <input type="date" value={to} onChange={e => setTo(e.target.value)} className="input w-auto text-xs" />
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4">
        <div className="card p-5">
          <p className="stat-value">{filtered.length}</p>
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
          <div className="p-8 text-center text-stone-400">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-stone-400">No voided transactions in this period</div>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Receipt</th>
                  <th>Date & Time</th>
                  <th>Customer</th>
                  <th>Cashier</th>
                  <th>Items</th>
                  <th>Sale Total</th>
                  <th>Void Reason</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(tx => (
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
                  <td colSpan={5} className="font-semibold text-stone-700 py-2 px-3">{filtered.length} voided</td>
                  <td className="font-bold text-red-600 line-through">{fmt(totalVoided)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
