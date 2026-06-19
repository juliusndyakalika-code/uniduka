import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router-dom';
import { TrendingUp, Users, Package, ChevronDown, ChevronRight, Printer, Download } from 'lucide-react';
import { downloadCsv } from '../../utils/exportCsv';
import api from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { printReceipt } from '../../utils/printReceipt';

interface StaffStat {
  userId: string; fullName: string; role: string;
  transactionCount: number; revenue: number; avgTicket: number;
}
interface TxItem { name: string; quantity: number; unitPrice: number; unitLabel: string; discountPct: number; lineTotal: number; }
interface Tx {
  id: string; receiptNo: string; total: number; subtotal: number; discountAmount: number;
  createdAt: string; status: string;
  payments: { method: string; amount: number }[];
  items: TxItem[];
  customer?: { fullName: string } | null;
  customerName?: string;
}

function fmt(n: number) {
  return new Intl.NumberFormat('sw-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 0 }).format(n);
}

const REPORT_TABS = [
  { to: '/reports/sales',     label: 'Sales',     icon: TrendingUp },
  { to: '/reports/staff',     label: 'By Seller',  icon: Users },
  { to: '/reports/inventory', label: 'Stock',      icon: Package },
];

interface SellerRowProps {
  stat: StaffStat;
  rank: number;
  share: number;
  from: string;
  to: string;
  shopId: string | null;
}

function SellerRow({ stat, rank, share, from, to, shopId }: SellerRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [loadingPrint, setLoadingPrint] = useState<string | null>(null);

  const { data: txns = [], isLoading: loadingTx } = useQuery<Tx[]>({
    queryKey: ['seller-txns', shopId, stat.userId, from, to],
    queryFn: () =>
      api.get('/pos/transactions', { params: { cashierId: stat.userId, from, to, limit: 100 } })
         .then(r => r.data.data as Tx[]),
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
      const payMethod = tx.payments?.[0]?.method ?? 'CASH';
      printReceipt({
        receiptNo:    tx.receiptNo,
        total:        tx.total,
        subtotal:     tx.subtotal,
        discount:     tx.discountAmount,
        paymentMethod: payMethod,
        cashReceived: tx.payments?.find((p: { method: string }) => p.method === 'CASH')?.amount ?? 0,
        change:       0,
        items: tx.items.map((i: TxItem) => ({
          name: i.name, qty: i.quantity, unitPrice: i.unitPrice,
          discountPct: i.discountPct, lineTotal: i.lineTotal, unit: i.unitLabel,
        })),
        shop: {
          tradingName:  shop?.tradingName ?? 'MauzoSmart',
          addressLine1: shop?.addressLine1,
          city:         shop?.city,
          phone:        shop?.phone,
          tin:          shop?.tin,
          vrn:          shop?.vrn,
          taxMode:      shop?.taxMode,
        },
        customerName: tx.customer?.fullName ?? tx.customerName,
        customerTin:  tx.customerTin,
        printedAt:    tx.createdAt,
        isReprint:    true,
      });
    } catch { /* ignore */ }
    setLoadingPrint(null);
  };

  return (
    <>
      {/* Summary row */}
      <tr
        className="cursor-pointer hover:bg-stone-50 transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <td className="text-stone-400 text-xs">{rank}</td>
        <td>
          <div className="flex items-center gap-2">
            {expanded
              ? <ChevronDown size={14} className="text-primary-500 shrink-0" />
              : <ChevronRight size={14} className="text-stone-400 shrink-0" />}
            <div className="w-7 h-7 rounded-full bg-primary-100 text-primary-700 text-xs font-bold flex items-center justify-center shrink-0">
              {stat.fullName.charAt(0).toUpperCase()}
            </div>
            <span className="font-medium text-stone-900">{stat.fullName}</span>
          </div>
        </td>
        <td><span className="badge badge-stone text-xs">{stat.role.replace(/_/g, ' ')}</span></td>
        <td className="font-medium">{stat.transactionCount}</td>
        <td className="font-medium">{fmt(stat.revenue)}</td>
        <td>{fmt(stat.avgTicket)}</td>
        <td>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-stone-100 rounded-full h-1.5 w-16">
              <div className="bg-primary-500 h-1.5 rounded-full" style={{ width: `${share}%` }} />
            </div>
            <span className="text-xs text-stone-500 w-8 text-right">{Math.round(share)}%</span>
          </div>
        </td>
      </tr>

      {/* Expanded transactions */}
      {expanded && (
        <tr>
          <td colSpan={7} className="p-0">
            <div className="bg-stone-50 border-t border-b border-stone-200 px-6 py-3">
              {loadingTx ? (
                <p className="text-xs text-stone-400 py-2">Loading transactions…</p>
              ) : txns.length === 0 ? (
                <p className="text-xs text-stone-400 py-2">No transactions in this period</p>
              ) : (
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="text-stone-500 border-b border-stone-200">
                      <th className="text-left py-1.5 pr-3 font-semibold">Receipt</th>
                      <th className="text-left py-1.5 pr-3 font-semibold">Date & Time</th>
                      <th className="text-left py-1.5 pr-3 font-semibold">Customer</th>
                      <th className="text-left py-1.5 pr-3 font-semibold">Items sold</th>
                      <th className="text-right py-1.5 pr-3 font-semibold">Total</th>
                      <th className="text-right py-1.5 font-semibold">Payment</th>
                      <th className="w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {txns.map(tx => (
                      <tr key={tx.id} className={`border-b border-stone-100 last:border-0 ${tx.status === 'VOIDED' ? 'opacity-50' : ''}`}>
                        <td className="py-2 pr-3 font-mono text-stone-700">
                          {tx.receiptNo}
                          {tx.status === 'VOIDED' && (
                            <span className="ml-1 text-[10px] bg-red-100 text-red-600 rounded px-1">VOID</span>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-stone-500 whitespace-nowrap">
                          {new Date(tx.createdAt).toLocaleString('en-TZ', {
                            day: '2-digit', month: 'short',
                            hour: '2-digit', minute: '2-digit',
                          })}
                        </td>
                        <td className="py-2 pr-3 text-stone-600">
                          {tx.customer?.fullName ?? tx.customerName ?? <span className="text-stone-300">Walk-in</span>}
                        </td>
                        <td className="py-2 pr-3">
                          <div className="space-y-0.5">
                            {tx.items.slice(0, 3).map((it, i) => (
                              <div key={i} className="text-stone-600">
                                {it.name}
                                <span className="text-stone-400 ml-1">×{it.quantity} {it.unitLabel}</span>
                                {it.discountPct > 0 && (
                                  <span className="text-amber-600 ml-1">(-{it.discountPct}%)</span>
                                )}
                              </div>
                            ))}
                            {tx.items.length > 3 && (
                              <span className="text-stone-400">+{tx.items.length - 3} more</span>
                            )}
                          </div>
                        </td>
                        <td className="py-2 pr-3 text-right font-semibold text-stone-900">
                          {fmt(tx.total)}
                        </td>
                        <td className="py-2 pr-3 text-right">
                          <span className="badge badge-stone">
                            {(tx.payments?.[0]?.method ?? 'CASH').replace('_', ' ')}
                          </span>
                        </td>
                        <td className="py-2 text-right">
                          <button
                            onClick={e => { e.stopPropagation(); handlePrint(tx.id); }}
                            disabled={loadingPrint === tx.id}
                            className="p-1 rounded text-stone-400 hover:text-primary-600 hover:bg-primary-50"
                            title="Reprint receipt"
                          >
                            {loadingPrint === tx.id ? '…' : <Printer size={12} />}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-stone-200 bg-white">
                      <td colSpan={4} className="py-1.5 text-stone-500 font-semibold">
                        {txns.length} transaction{txns.length !== 1 ? 's' : ''}
                      </td>
                      <td className="py-1.5 text-right font-bold text-stone-900">
                        {fmt(txns.reduce((s, t) => s + (t.status !== 'VOIDED' ? t.total : 0), 0))}
                      </td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function StaffReportPage() {
  const { shopId } = useAuthStore();
  const location = useLocation();
  const [from, setFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split('T')[0];
  });
  const [to, setTo] = useState(() => new Date().toISOString().split('T')[0]);

  const { data = [], isLoading, isError } = useQuery<StaffStat[]>({
    queryKey: ['staff-report', shopId, from, to],
    queryFn: () => api.get('/reporting/staff', { params: { from, to } }).then(r => r.data.data),
    enabled: !!shopId,
  });

  const sorted = [...data].sort((a, b) => b.revenue - a.revenue);
  const total  = data.reduce((s, r) => ({ tx: s.tx + r.transactionCount, rev: s.rev + r.revenue }), { tx: 0, rev: 0 });

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Reports</h1>
          <p className="page-subtitle">Sales performance by seller</p>
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

      {/* Date filters + export */}
      <div className="flex flex-wrap items-center gap-3">
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="input w-auto text-xs" />
        <span className="text-stone-400 text-xs">to</span>
        <input type="date" value={to} onChange={e => setTo(e.target.value)} className="input w-auto text-xs" />
        <div className="flex gap-2 ml-auto">
          <button
            className="btn-secondary text-xs"
            disabled={data.length === 0}
            onClick={() => downloadCsv(
              `seller-summary-${from}-to-${to}.csv`,
              sorted.map(s => [s.fullName, s.role.replace(/_/g, ' '), s.transactionCount, s.revenue, s.avgTicket.toFixed(0)]),
              ['Seller', 'Role', 'Transactions', 'Revenue (TZS)', 'Avg Sale (TZS)']
            )}
          >
            <Download size={13} className="mr-1" /> Summary CSV
          </button>
          <button
            className="btn-secondary text-xs"
            disabled={data.length === 0}
            onClick={async () => {
              if (!shopId) return;
              const rows: (string | number | null)[][] = [];
              for (const s of sorted) {
                const res = await api.get('/pos/transactions', { params: { cashierId: s.userId, from, to, limit: 500 } });
                const txns: Tx[] = res.data.data ?? [];
                for (const tx of txns) {
                  for (const it of tx.items) {
                    rows.push([
                      s.fullName, s.role.replace(/_/g, ' '),
                      tx.receiptNo,
                      new Date(tx.createdAt).toLocaleString('en-TZ'),
                      tx.customer?.fullName ?? tx.customerName ?? 'Walk-in',
                      it.name, it.quantity, it.unitLabel, it.unitPrice, it.discountPct, it.lineTotal,
                      tx.total, tx.payments?.[0]?.method ?? '', tx.status,
                    ]);
                  }
                }
              }
              downloadCsv(`seller-transactions-${from}-to-${to}.csv`, rows,
                ['Seller', 'Role', 'Receipt No', 'Date & Time', 'Customer', 'Product', 'Qty', 'Unit', 'Unit Price', 'Discount %', 'Line Total', 'Tx Total', 'Payment', 'Status']
              );
            }}
          >
            <Download size={13} className="mr-1" /> Transactions CSV
          </button>
        </div>
      </div>

      {/* Summary cards */}
      {!isLoading && data.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="card p-4"><p className="stat-value">{data.length}</p><p className="stat-label">Active sellers</p></div>
          <div className="card p-4"><p className="stat-value">{total.tx}</p><p className="stat-label">Total transactions</p></div>
          <div className="card p-4"><p className="stat-value">{fmt(total.rev)}</p><p className="stat-label">Total revenue</p></div>
        </div>
      )}

      {/* Table */}
      <div className="card">
        <div className="px-5 py-3 border-b border-stone-100">
          <p className="text-xs text-stone-400">Click a row to expand and see individual sales</p>
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-stone-400">Loading…</div>
        ) : isError ? (
          <div className="p-8 text-center text-red-500 text-sm">Failed to load report</div>
        ) : (
          <div className="table-wrapper overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Seller</th>
                  <th>Role</th>
                  <th>Transactions</th>
                  <th>Revenue</th>
                  <th>Avg. Sale</th>
                  <th>Share %</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((s, i) => (
                  <SellerRow
                    key={s.userId}
                    stat={s}
                    rank={i + 1}
                    share={total.rev > 0 ? (s.revenue / total.rev) * 100 : 0}
                    from={from}
                    to={to}
                    shopId={shopId}
                  />
                ))}
                {data.length === 0 && (
                  <tr><td colSpan={7} className="text-center text-stone-400 py-10">No sales data for this period</td></tr>
                )}
              </tbody>
              {sorted.length > 1 && (
                <tfoot>
                  <tr className="border-t-2 border-stone-200 bg-stone-50">
                    <td colSpan={3} className="font-semibold text-stone-700 py-2 px-3">Total</td>
                    <td className="font-bold">{total.tx}</td>
                    <td className="font-bold">{fmt(total.rev)}</td>
                    <td className="font-bold">{total.tx > 0 ? fmt(total.rev / total.tx) : '—'}</td>
                    <td className="font-bold">100%</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
