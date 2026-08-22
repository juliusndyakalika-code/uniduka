import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { TrendingUp, ShoppingCart, Users, Package, ArrowUpRight, Store, CreditCard, Printer, X, Wallet, Boxes } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { printReceipt as doPrint } from '../../utils/printReceipt';
import { useDataTable, TableSearch, SortableTh, TablePagination } from '../../components/ui/DataTable';

interface DashboardData {
  revenue: { today: number; week: number; month: number };
  netProfit?: { month: number; grossProfit: number; consignmentProfit: number; expenses: number };
  transactions: { today: number; week: number };
  customers: { total: number; new: number };
  lowStock: number;
  stockValue?: number;
  topProducts: { name: string; qty: number; revenue: number }[];
  recentTransactions: { id: string; receiptNo: string; total: number; paymentMethod: string; createdAt: string; status: string; cashierName?: string }[];
  salesChart: { label: string; revenue: number }[];
}
interface TxDetail {
  id: string; receiptNo: string; total: number; subtotal: number; discountAmount: number;
  payments: { method: string; amount: number }[];
  items: { name: string; quantity: number; unitPrice: number; unitLabel: string; discountPct: number; lineTotal: number }[];
  customer?: { fullName: string } | null;
  customerName?: string;
  customerTin?: string;
  createdAt: string; status: string; cashierName?: string;
  _shop?: { tradingName?: string; addressLine1?: string; city?: string; phone?: string; tin?: string; vrn?: string; taxMode?: string };
}

function fmt(n: number) {
  return new Intl.NumberFormat('sw-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 0 }).format(n);
}

function StatCard({ icon: Icon, label, value, sub, color, to }: {
  icon: React.ElementType; label: string; value: string; sub?: string; color: string; to?: string;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between mb-3">
        <div className={`p-2 rounded-lg ${color}`}><Icon size={18} /></div>
        <ArrowUpRight size={14} className="text-stone-400 shrink-0" />
      </div>
      <p className="stat-value leading-tight">{value}</p>
      <p className="stat-label truncate">{label}</p>
      {sub && <p className="text-[10px] sm:text-xs text-stone-400 mt-1 truncate">{sub}</p>}
    </>
  );
  if (to) {
    return (
      <Link to={to} className="card p-4 sm:p-5 min-w-0 overflow-hidden block hover:shadow-md hover:border-primary-200 transition-shadow focus:outline-none focus:ring-2 focus:ring-primary-300">
        {body}
      </Link>
    );
  }
  return <div className="card p-4 sm:p-5 min-w-0 overflow-hidden">{body}</div>;
}

export default function Dashboard() {
  const { shopId, account, user, shops } = useAuthStore();
  const isHotel = shops.find(s => s.id === shopId)?.businessType === 'HOTEL_GUESTHOUSE';
  const qc = useQueryClient();
  const { t } = useTranslation();

  const [printTx, setPrintTx]     = useState<TxDetail | null>(null);
  const [loadingTxId, setLoadingTxId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ['dashboard', shopId],
    queryFn: () => api.get('/tenant/dashboard').then(r => r.data.data),
    enabled: !!shopId,
  });

  const txTable = useDataTable(data?.recentTransactions ?? [], {
    searchable: tx => [tx.receiptNo, tx.cashierName, tx.paymentMethod],
    sortValues: {
      receipt: tx => tx.receiptNo,
      cashier: tx => tx.cashierName,
      total: tx => tx.total,
      payment: tx => tx.paymentMethod,
      createdAt: tx => new Date(tx.createdAt),
    },
    initialSort: { field: 'createdAt', dir: 'desc' },
    pageSize: 10,
  });

  const fetchAndPrint = async (txId: string) => {
    setLoadingTxId(txId);
    try {
      const [txRes, shopRes] = await Promise.all([
        api.get(`/pos/transactions/${txId}`),
        shopId ? api.get(`/shops/${shopId}`) : Promise.resolve(null),
      ]);
      const tx: TxDetail = txRes.data.data;
      const shop = shopRes?.data?.data;
      setPrintTx({ ...tx, _shop: shop });
    } catch { /* ignore */ }
    setLoadingTxId(null);
  };

  const executePrint = (tx: TxDetail & { _shop?: { tradingName?: string; addressLine1?: string; city?: string; phone?: string; tin?: string; vrn?: string; taxMode?: string } }) => {
    const payMethod = tx.payments?.[0]?.method ?? 'CASH';
    const cashPay   = tx.payments?.find(p => p.method === 'CASH');
    doPrint({
      receiptNo:    tx.receiptNo,
      total:        tx.total,
      subtotal:     tx.subtotal,
      discount:     tx.discountAmount,
      paymentMethod: payMethod,
      cashReceived: cashPay?.amount ?? 0,
      change:       0,
      items: tx.items.map(i => ({
        name:       i.name,
        qty:        i.quantity,
        unitPrice:  i.unitPrice,
        discountPct: i.discountPct,
        lineTotal:  i.lineTotal,
        unit:       i.unitLabel,
      })),
      shop: {
        tradingName:  tx._shop?.tradingName ?? account?.legalName ?? 'MauzoHalisi',
        addressLine1: tx._shop?.addressLine1,
        city:         tx._shop?.city,
        phone:        tx._shop?.phone,
        tin:          tx._shop?.tin,
        vrn:          tx._shop?.vrn,
        taxMode:      tx._shop?.taxMode,
      },
      customerName: tx.customer?.fullName ?? tx.customerName,
      customerTin:  tx.customerTin,
      printedAt:    tx.createdAt,
      isReprint:    true,
    });
    setPrintTx(null);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="page-header"><h1 className="page-title">{t('dashboard.title')}</h1></div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="card p-5 animate-pulse h-28 bg-stone-100" />)}
        </div>
      </div>
    );
  }


  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('dashboard.title')}</h1>
          <p className="page-subtitle">{account?.legalName}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={TrendingUp} label={t('dashboard.revenueToday')} value={fmt(data?.revenue?.today ?? 0)}
          sub={`${fmt(data?.revenue?.month ?? 0)} ${t('dashboard.thisMonth')}`} color="bg-primary-50 text-primary-600"
          to="/reports/sales" />
        <StatCard icon={ShoppingCart} label={isHotel ? 'Check-ins Today' : t('dashboard.transactionsToday')} value={String(data?.transactions?.today ?? 0)}
          sub={`${data?.transactions?.week ?? 0} ${t('dashboard.thisWeek')}`} color="bg-duka-50 text-duka-600"
          to={isHotel ? '/hotel' : '/reports/sales'} />
        <StatCard icon={Users} label={isHotel ? 'Total Guests' : t('dashboard.totalCustomers')} value={String(data?.customers?.total ?? 0)}
          sub={t('dashboard.new', { count: data?.customers?.new ?? 0 })} color="bg-blue-50 text-blue-600"
          to={isHotel ? '/hotel' : '/customers'} />
        <StatCard icon={Package} label={isHotel ? 'Rooms Available' : t('dashboard.lowStockAlerts')} value={String(data?.lowStock ?? 0)}
          color={isHotel ? 'bg-emerald-50 text-emerald-600' : (data?.lowStock ? 'bg-red-50 text-red-600' : 'bg-stone-50 text-stone-500')}
          to={isHotel ? '/hotel' : '/inventory/stock'} />
        {data?.netProfit && (
          <StatCard icon={Wallet} label={t('dashboard.netProfitMonth')} value={fmt(data.netProfit.month)}
            sub={data.netProfit.consignmentProfit > 0 ? `incl. ${fmt(data.netProfit.consignmentProfit)} consignment` : `after ${fmt(data.netProfit.expenses)} expenses`}
            color={data.netProfit.month >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}
            to="/reports/sales" />
        )}
        {!isHotel && data?.stockValue != null && (
          <StatCard icon={Boxes} label={t('dashboard.stockInvestment')} value={fmt(data.stockValue)}
            sub="Value tied up in inventory (at cost)"
            color="bg-amber-50 text-amber-600"
            to="/inventory" />
        )}
      </div>

      {/* Charts + top products */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card p-5 lg:col-span-2 min-w-0">
          <h3 className="text-sm font-semibold text-stone-700 mb-4">{t('dashboard.salesChart')}</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data?.salesChart ?? []} barSize={14}>
              <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => fmt(v)} labelStyle={{ fontSize: 11 }} />
              <Bar dataKey="revenue" fill="#a66624" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-stone-700 mb-4">{t('dashboard.topProducts')}</h3>
          <div className="space-y-3">
            {(data?.topProducts ?? []).slice(0, 6).map((p, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-4 text-xs text-stone-400 shrink-0">{i+1}</span>
                  <span className="text-xs text-stone-700 truncate">{p.name}</span>
                </div>
                <span className="text-xs font-medium text-stone-900 ml-2 shrink-0">{fmt(p.revenue)}</span>
              </div>
            ))}
            {!data?.topProducts?.length && <p className="text-xs text-stone-400">{t('dashboard.noSalesYet')}</p>}
          </div>
        </div>
      </div>

      {/* Recent transactions */}
      <div className="card">
        <div className="px-5 py-4 border-b border-stone-100 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-stone-700">{isHotel ? 'Recent Check-ins' : t('dashboard.recentTransactions')}</h3>
          <div className="flex items-center gap-3">
            <TableSearch value={txTable.search} onChange={txTable.setSearch} placeholder="Search receipt, cashier…" className="max-w-[12rem]" />
            <Link to="/pos/transactions" className="text-xs text-primary-600 hover:underline shrink-0">{t('dashboard.viewAll')}</Link>
          </div>
        </div>
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <SortableTh field="receipt" sort={txTable.sort} onSort={txTable.toggleSort}>{t('dashboard.receipt')}</SortableTh>
                <SortableTh field="cashier" sort={txTable.sort} onSort={txTable.toggleSort} className="hidden sm:table-cell">{t('dashboard.customerCashier')}</SortableTh>
                <SortableTh field="total" sort={txTable.sort} onSort={txTable.toggleSort}>Amount</SortableTh>
                <SortableTh field="payment" sort={txTable.sort} onSort={txTable.toggleSort} className="hidden sm:table-cell">{t('dashboard.payment')}</SortableTh>
                <SortableTh field="createdAt" sort={txTable.sort} onSort={txTable.toggleSort} className="hidden sm:table-cell">{t('dashboard.dateTime')}</SortableTh>
                <th>{t('common.print')}</th>
              </tr>
            </thead>
            <tbody>
              {txTable.view.map(tx => (
                <tr key={tx.id} className={tx.status === 'VOIDED' ? 'opacity-50' : ''}>
                  <td className="font-mono text-xs">
                    {tx.receiptNo}
                    {tx.status === 'VOIDED' && <span className="ml-1.5 text-[10px] bg-red-100 text-red-600 rounded px-1 py-0.5 font-semibold">VOID</span>}
                    {/* Date & time — shown inline here on mobile where the dedicated column is hidden */}
                    <span className="sm:hidden block text-stone-400 font-sans mt-0.5">
                      {new Date(tx.createdAt).toLocaleString('en-TZ', {
                        day: '2-digit', month: 'short',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </span>
                  </td>
                  <td className="hidden sm:table-cell text-xs text-stone-500">{tx.cashierName ?? '—'}</td>
                  <td className="font-medium">{fmt(tx.total)}</td>
                  <td className="hidden sm:table-cell"><span className="badge badge-stone">{tx.paymentMethod?.replace('_', ' ')}</span></td>
                  <td className="hidden sm:table-cell text-stone-400 text-xs whitespace-nowrap">
                    {new Date(tx.createdAt).toLocaleString('en-TZ', {
                      day: '2-digit', month: 'short', year: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </td>
                  {!isHotel && (
                  <td>
                    <button
                      onClick={() => fetchAndPrint(tx.id)}
                      disabled={loadingTxId === tx.id}
                      className="p-1.5 rounded text-stone-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                      title={t('dashboard.printReceipt')}
                    >
                      {loadingTxId === tx.id ? <span className="text-[10px]">…</span> : <Printer size={13} />}
                    </button>
                  </td>
                  )}
                </tr>
              ))}
              {txTable.total === 0 && (
                <tr><td colSpan={6} className="text-center text-stone-400 py-6">{t('dashboard.noTransactionsYet')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <TablePagination page={txTable.page} pageCount={txTable.pageCount} total={txTable.total} pageSize={txTable.pageSize} onPage={txTable.setPage} onPageSize={txTable.setPageSize} />
      </div>

      {/* Subscription info */}
      {account && user?.role === 'ACCOUNT_OWNER' && (
        <div className="card p-5 flex items-center gap-4">
          <div className="p-2 rounded-lg bg-primary-50 text-primary-600"><Store size={18} /></div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-stone-900">{t('dashboard.plan', { plan: account.plan })}</p>
            <p className="text-xs text-stone-400">{account.legalName}</p>
          </div>
          <a href="/admin/business" className="btn-secondary text-xs px-3 py-1.5">
            <CreditCard size={12} className="mr-1.5" /> {t('dashboard.managePlan')}
          </a>
        </div>
      )}

      {/* Print preview modal */}
      {printTx && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card p-5 w-full max-w-xs">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-stone-900">{t('dashboard.reprintTitle')}</h3>
              <button onClick={() => setPrintTx(null)} className="text-stone-400 hover:text-stone-700"><X size={16} /></button>
            </div>
            <div className="bg-stone-50 rounded-lg p-3 mb-4 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="font-mono font-bold">{printTx.receiptNo}</span>
                <span className="font-bold">{fmt(printTx.total)}</span>
              </div>
              <p className="text-stone-400">{new Date(printTx.createdAt).toLocaleString('en-TZ')}</p>
              {printTx.customer && <p className="text-stone-600">{printTx.customer.fullName}</p>}
              <div className="pt-1 border-t border-stone-200 space-y-0.5">
                {printTx.items.slice(0, 4).map((it, i) => (
                  <div key={i} className="flex justify-between text-[11px] text-stone-600">
                    <span>{it.name} ×{it.quantity}</span>
                    <span>{fmt(it.lineTotal)}</span>
                  </div>
                ))}
                {printTx.items.length > 4 && <p className="text-[10px] text-stone-400">+{printTx.items.length - 4} more</p>}
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
