import { Fragment, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router-dom';
import { TrendingUp, Users, Package, BarChart2, ChevronDown, ChevronRight, Printer, Download } from 'lucide-react';
import { downloadCsv } from '../../utils/exportCsv';
import api from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { printReceipt } from '../../utils/printReceipt';
import { useTranslation } from 'react-i18next';
import { useDataTable, TableSearch, SortableTh, TablePagination } from '../../components/ui/DataTable';
import { PageLoader, Spinner } from '../../components/ui/Loader';

interface StaffStat {
  userId: string; fullName: string; role: string;
  transactionCount: number; revenue: number; avgTicket: number; grossProfit: number;
}
interface TxItem { name: string; quantity: number; unitPrice: number; unitLabel: string; discountPct: number; lineTotal: number; costPrice: number; }
interface Tx {
  id: string; receiptNo: string; total: number; subtotal: number; discountAmount: number;
  createdAt: string; status: string;
  payments: { method: string; amount: number }[];
  items: TxItem[];
  customer?: { fullName: string } | null;
  customerName?: string;
}
interface HotelFolio {
  id: string; guestName: string; guestPhone?: string;
  checkIn: string; checkOut?: string; nights: number;
  grandTotal: number; isPaid: boolean; paymentMethod?: string;
  room?: { roomNo: string; roomType: string };
}

function fmt(n: number) {
  return new Intl.NumberFormat('sw-TZ', { style: 'currency', currency: 'TZS', currencyDisplay: 'code', maximumFractionDigits: 0 }).format(n);
}
function txProfit(tx: Tx): number {
  return tx.items.reduce((s, i) => {
    const rev = i.unitPrice * (1 - i.discountPct / 100) * i.quantity;
    return s + (rev - (i.costPrice ?? 0) * i.quantity);
  }, 0);
}

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function presetRange(period: 'day' | 'week' | 'month') {
  const now = new Date();
  const to = ymd(now);
  if (period === 'day') return { from: to, to };
  if (period === 'week') {
    const s = new Date(now); s.setDate(now.getDate() - now.getDay());
    return { from: ymd(s), to };
  }
  return { from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to };
}

const REPORT_TABS = [
  { to: '/reports/sales',     label: 'Sales',      icon: TrendingUp },
  { to: '/reports/staff',     label: 'By Seller',  icon: Users },
  { to: '/reports/products',  label: 'By Product', icon: BarChart2 },
  { to: '/reports/inventory', label: 'Stock',      icon: Package },
];

// ── What one seller sold, product by product ────────────────────────────────
interface SellerProduct {
  productId: string; name: string; unit: string;
  quantity: number; revenue: number; grossProfit: number; receipts: number;
}
interface SellerProducts {
  products: SellerProduct[];
  totals: { products: number; quantity: number; revenue: number; grossProfit: number };
}
interface ProductSale {
  transactionId: string; receiptNo: string; at: string; isReturn: boolean;
  customer: string | null; quantity: number; unitPrice: number; unitLabel: string; lineTotal: number;
}
interface ProductSales {
  product: { id: string; name: string; unit: string };
  totals: { quantity: number; revenue: number; lines: number };
  sales: ProductSale[];
}

const qtyFmt = (n: number) => (Number.isInteger(n) ? n : Math.round(n * 100) / 100).toLocaleString('en-US');

/** The receipts one product was sold on, by one seller, in the period. */
function ProductSalesDetail({ userId, productId, from, to }: { userId: string; productId: string; from: string; to: string }) {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery<ProductSales>({
    queryKey: ['seller-product-sales', userId, productId, from, to],
    queryFn: () => api.get(`/reporting/staff/${userId}/products/${productId}`, { params: { from, to } }).then(r => r.data.data),
    staleTime: 60_000,
  });
  if (isLoading || !data) return <div className="flex justify-center py-3"><Spinner size={14} /></div>;
  const unit = data.product.unit || data.sales[0]?.unitLabel || '';
  return (
    <div className="rounded-lg bg-white border border-stone-200 p-3 space-y-2">
      <p className="text-sm text-stone-800">
        <span className="font-bold text-primary-700 text-base tabular-nums">{qtyFmt(data.totals.quantity)} {unit}</span>{' '}
        {t('reports.soldOn', { count: new Set(data.sales.map(s => s.transactionId)).size })}
        <span className="text-stone-400"> · {fmt(data.totals.revenue)}</span>
      </p>
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="text-stone-500 border-b border-stone-200">
            <th className="text-left py-1 pr-3 font-semibold">{t('reports.receipt')}</th>
            <th className="text-left py-1 pr-3 font-semibold">{t('reports.date')}</th>
            <th className="text-left py-1 pr-3 font-semibold">{t('reports.customer')}</th>
            <th className="text-right py-1 pr-3 font-semibold">{t('reports.qty')}</th>
            <th className="text-right py-1 font-semibold">{t('common.total')}</th>
          </tr>
        </thead>
        <tbody>
          {data.sales.map((s, i) => (
            <tr key={i} className="border-b border-stone-100 last:border-0">
              <td className="py-1 pr-3 font-mono text-stone-700">
                {s.receiptNo}
                {s.isReturn && <span className="ml-1 text-[10px] bg-amber-100 text-amber-700 rounded px-1">{t('reports.return')}</span>}
              </td>
              <td className="py-1 pr-3 text-stone-500 whitespace-nowrap">
                {new Date(s.at).toLocaleString('en-TZ', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </td>
              <td className="py-1 pr-3 text-stone-600">{s.customer ?? <span className="text-stone-300">Walk-in</span>}</td>
              <td className={`py-1 pr-3 text-right tabular-nums font-semibold ${s.quantity < 0 ? 'text-amber-700' : 'text-stone-900'}`}>{qtyFmt(s.quantity)} {s.unitLabel}</td>
              <td className="py-1 text-right tabular-nums text-stone-700">{fmt(s.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {data.totals.lines > data.sales.length && (
        <p className="text-[11px] text-stone-400">{t('reports.showingLatest', { shown: data.sales.length, total: data.totals.lines })}</p>
      )}
    </div>
  );
}

function SellerProductList({ userId, from, to }: { userId: string; from: string; to: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<string | null>(null);
  const { data, isLoading } = useQuery<SellerProducts>({
    queryKey: ['seller-products', userId, from, to],
    queryFn: () => api.get(`/reporting/staff/${userId}/products`, { params: { from, to } }).then(r => r.data.data),
    staleTime: 60_000,
  });
  if (isLoading) return <div className="flex items-center justify-center py-4"><Spinner size={16} /></div>;
  if (!data?.products.length) return <p className="text-xs text-stone-400 py-2">{t('reports.noSales')}</p>;
  return (
    <table className="w-full text-xs border-collapse">
      <thead>
        <tr className="text-stone-500 border-b border-stone-200">
          <th className="text-left py-1.5 pr-3 font-semibold">{t('reports.product')}</th>
          <th className="text-right py-1.5 pr-3 font-semibold">{t('reports.qtySold')}</th>
          <th className="text-right py-1.5 pr-3 font-semibold">{t('reports.receipts')}</th>
          <th className="text-right py-1.5 pr-3 font-semibold">{t('reports.revenue')}</th>
          <th className="text-right py-1.5 font-semibold text-emerald-700">{t('reports.grossProfit')}</th>
        </tr>
      </thead>
      <tbody>
        {data.products.map(p => (
          <Fragment key={p.productId}>
            <tr
              className={`border-b border-stone-100 cursor-pointer hover:bg-white ${open === p.productId ? 'bg-white' : ''}`}
              onClick={() => setOpen(open === p.productId ? null : p.productId)}
              aria-expanded={open === p.productId}
            >
              <td className="py-1.5 pr-3 text-stone-800 font-medium">
                <span className="inline-flex items-center gap-1">
                  {open === p.productId ? <ChevronDown size={12} className="text-primary-600" /> : <ChevronRight size={12} className="text-stone-400" />}
                  {p.name}
                </span>
              </td>
              <td className="py-1.5 pr-3 text-right tabular-nums font-bold text-stone-900">{qtyFmt(p.quantity)} <span className="font-normal text-stone-400">{p.unit}</span></td>
              <td className="py-1.5 pr-3 text-right tabular-nums text-stone-600">{p.receipts}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums text-stone-900">{fmt(p.revenue)}</td>
              <td className="py-1.5 text-right tabular-nums text-emerald-600">{fmt(p.grossProfit)}</td>
            </tr>
            {open === p.productId && (
              <tr><td colSpan={5} className="py-2"><ProductSalesDetail userId={userId} productId={p.productId} from={from} to={to} /></td></tr>
            )}
          </Fragment>
        ))}
      </tbody>
      <tfoot>
        <tr className="border-t border-stone-300">
          <td className="py-1.5 font-semibold text-stone-600">{t('reports.productCount', { count: data.totals.products })}</td>
          <td className="py-1.5 pr-3 text-right font-bold tabular-nums text-stone-900">{qtyFmt(data.totals.quantity)}</td>
          <td></td>
          <td className="py-1.5 pr-3 text-right font-bold tabular-nums text-stone-900">{fmt(data.totals.revenue)}</td>
          <td className="py-1.5 text-right font-bold tabular-nums text-emerald-600">{fmt(data.totals.grossProfit)}</td>
        </tr>
      </tfoot>
    </table>
  );
}

interface SellerRowProps {
  stat: StaffStat;
  rank: number;
  share: number;
  from: string;
  to: string;
  shopId: string | null;
  isHotel: boolean;
}

function SellerRow({ stat, rank, share, from, to, shopId, isHotel }: SellerRowProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [view, setView] = useState<'products' | 'receipts'>('products');
  const [loadingPrint, setLoadingPrint] = useState<string | null>(null);

  // POS: transactions per cashier
  const { data: txns = [], isLoading: loadingTx } = useQuery<Tx[]>({
    queryKey: ['seller-txns', shopId, stat.userId, from, to],
    queryFn: () =>
      api.get('/pos/transactions', { params: { cashierId: stat.userId, from, to, limit: 100 } })
         .then(r => r.data.data as Tx[]),
    enabled: expanded && !!shopId && !isHotel && view === 'receipts',
    staleTime: 60_000,
  });

  // Hotel: folios per receptionist
  const { data: folios = [], isLoading: loadingFolios } = useQuery<HotelFolio[]>({
    queryKey: ['receptionist-folios', shopId, stat.userId, from, to],
    queryFn: () =>
      api.get('/hotel/folios', { params: { checkedInBy: stat.userId, from, to } })
         .then(r => r.data.data as HotelFolio[]),
    enabled: expanded && !!shopId && isHotel,
    staleTime: 60_000,
  });

  const isLoading = isHotel ? loadingFolios : view === 'receipts' && loadingTx;

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
          tradingName:  shop?.tradingName ?? 'MauzoHalisi',
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
      <tr className="cursor-pointer hover:bg-stone-50 transition-colors" onClick={() => setExpanded(v => !v)}>
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
        {!isHotel && <td><span className="badge badge-stone text-xs">{stat.role.replace(/_/g, ' ')}</span></td>}
        <td className="font-medium">{stat.transactionCount}</td>
        <td className="font-medium">{fmt(stat.revenue)}</td>
        {!isHotel && <td className="font-semibold text-emerald-600">{fmt(stat.grossProfit)}</td>}
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

      {expanded && (
        <tr>
          <td colSpan={isHotel ? 6 : 8} className="p-0">
            <div className="bg-stone-50 border-t border-b border-stone-200 px-6 py-3">
              {!isHotel && (
                <div className="mb-2 inline-flex rounded-lg bg-stone-200/60 p-0.5 text-[11px] font-semibold" role="tablist">
                  {(['products', 'receipts'] as const).map(v => (
                    <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)}
                      className={`px-3 py-1 rounded-md transition-colors ${view === v ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-800'}`}>
                      {t(v === 'products' ? 'reports.byProduct' : 'reports.byReceipt')}
                    </button>
                  ))}
                </div>
              )}
              {!isHotel && view === 'products' ? (
                <SellerProductList userId={stat.userId} from={from} to={to} />
              ) : isLoading ? (
                <div className="flex items-center justify-center py-4"><Spinner size={16} /></div>
              ) : isHotel ? (
                /* ── Hotel: folio list ── */
                folios.length === 0 ? (
                  <p className="text-xs text-stone-400 py-2">No check-ins found for this period</p>
                ) : (
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="text-stone-500 border-b border-stone-200">
                        <th className="text-left py-1.5 pr-3 font-semibold">Guest</th>
                        <th className="text-left py-1.5 pr-3 font-semibold">Room</th>
                        <th className="text-left py-1.5 pr-3 font-semibold">Check-in</th>
                        <th className="text-left py-1.5 pr-3 font-semibold">Nights</th>
                        <th className="text-right py-1.5 pr-3 font-semibold">Total</th>
                        <th className="text-left py-1.5 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {folios.map(f => (
                        <tr key={f.id} className="border-b border-stone-100 last:border-0">
                          <td className="py-1.5 pr-3 font-medium text-stone-800">{f.guestName}</td>
                          <td className="py-1.5 pr-3 text-stone-600">#{f.room?.roomNo} {f.room?.roomType}</td>
                          <td className="py-1.5 pr-3 text-stone-500 whitespace-nowrap">
                            {new Date(f.checkIn).toLocaleDateString('en-TZ', { day: '2-digit', month: 'short' })}
                          </td>
                          <td className="py-1.5 pr-3 text-stone-600">{f.nights}</td>
                          <td className="py-1.5 pr-3 text-right font-semibold text-stone-900">{fmt(f.grandTotal)}</td>
                          <td className="py-1.5">
                            {f.checkOut
                              ? <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${f.isPaid ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{f.isPaid ? 'Paid' : 'Debt'}</span>
                              : <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">Active</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-stone-300">
                        <td colSpan={4} className="py-1.5 font-semibold text-stone-600">
                          {folios.length} check-in{folios.length !== 1 ? 's' : ''}
                        </td>
                        <td className="py-1.5 text-right font-bold text-stone-900">{fmt(folios.reduce((s, f) => s + f.grandTotal, 0))}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                )
              ) : (
                /* ── POS: transaction list ── */
                txns.length === 0 ? (
                  <p className="text-xs text-stone-400 py-2">{t('reports.noSales')}</p>
                ) : (
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="text-stone-500 border-b border-stone-200">
                        <th className="text-left py-1.5 pr-3 font-semibold">{t('reports.receipt')}</th>
                        <th className="text-left py-1.5 pr-3 font-semibold">{t('reports.date')}</th>
                        <th className="text-left py-1.5 pr-3 font-semibold">{t('reports.customer')}</th>
                        <th className="text-left py-1.5 pr-3 font-semibold">Items sold</th>
                        <th className="text-right py-1.5 pr-3 font-semibold">{t('common.total')}</th>
                        <th className="text-right py-1.5 pr-3 font-semibold text-emerald-700">{t('reports.grossProfit')}</th>
                        <th className="text-right py-1.5 font-semibold">{t('reports.payment')}</th>
                        <th className="w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {txns.map(tx => (
                        <tr key={tx.id} className={`border-b border-stone-100 last:border-0 ${tx.status === 'VOIDED' ? 'opacity-50' : ''}`}>
                          <td className="py-2 pr-3 font-mono text-stone-700">
                            {tx.receiptNo}
                            {tx.status === 'VOIDED' && <span className="ml-1 text-[10px] bg-red-100 text-red-600 rounded px-1">VOID</span>}
                          </td>
                          <td className="py-2 pr-3 text-stone-500 whitespace-nowrap">
                            {new Date(tx.createdAt).toLocaleString('en-TZ', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="py-2 pr-3 text-stone-600">
                            {tx.customer?.fullName ?? tx.customerName ?? <span className="text-stone-300">Walk-in</span>}
                          </td>
                          <td className="py-2 pr-3">
                            <div className="space-y-0.5">
                              {tx.items.map((it, i) => (
                                <div key={i} className="text-stone-600">
                                  {it.name}<span className="text-stone-400 ml-1">×{it.quantity} {it.unitLabel}</span>
                                  {it.discountPct > 0 && <span className="text-amber-600 ml-1">(-{it.discountPct}%)</span>}
                                </div>
                              ))}
                            </div>
                          </td>
                          <td className="py-2 pr-3 text-right font-semibold text-stone-900">{fmt(tx.total)}</td>
                          <td className="py-2 pr-3 text-right font-semibold text-emerald-600">
                            {tx.status === 'VOIDED' ? <span className="text-stone-300">—</span> : fmt(txProfit(tx))}
                          </td>
                          <td className="py-2 pr-3 text-right">
                            <span className="badge badge-stone">{(tx.payments?.[0]?.method ?? 'CASH').replace('_', ' ')}</span>
                          </td>
                          <td className="py-2 text-right">
                            <button onClick={e => { e.stopPropagation(); handlePrint(tx.id); }} disabled={loadingPrint === tx.id}
                              className="p-1 rounded text-stone-400 hover:text-primary-600 hover:bg-primary-50" title="Reprint receipt">
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
                          {fmt(txns.filter(t => t.status !== 'VOIDED').reduce((s, t) => s + t.total, 0))}
                        </td>
                        <td className="py-1.5 text-right font-bold text-emerald-600">
                          {fmt(txns.filter(t => t.status !== 'VOIDED').reduce((s, t) => s + txProfit(t), 0))}
                        </td>
                        <td colSpan={2}></td>
                      </tr>
                    </tfoot>
                  </table>
                )
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function StaffReportPage() {
  const { t } = useTranslation();
  const { shopId, shops } = useAuthStore();
  const isHotel = shops.find(s => s.id === shopId)?.businessType === 'HOTEL_GUESTHOUSE';
  const visibleTabs = REPORT_TABS.filter(tab => !(isHotel && (tab.to === '/reports/inventory' || tab.to === '/reports/products')));
  const location = useLocation();
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('day');
  const [from, setFrom] = useState(() => presetRange('day').from);
  const [to, setTo]     = useState(() => presetRange('day').to);

  const selectPeriod = (p: 'day' | 'week' | 'month') => {
    setPeriod(p);
    const r = presetRange(p);
    setFrom(r.from);
    setTo(r.to);
  };

  const { data = [], isLoading, isError } = useQuery<StaffStat[]>({
    queryKey: ['staff-report', shopId, period, from, to],
    queryFn: () => api.get('/reporting/staff', { params: { from, to } }).then(r => r.data.data),
    enabled: !!shopId,
  });

  const total  = data.reduce((s, r) => ({ tx: s.tx + r.transactionCount, rev: s.rev + r.revenue, profit: s.profit + r.grossProfit }), { tx: 0, rev: 0, profit: 0 });

  const sortedForExport = [...data].sort((a, b) => b.revenue - a.revenue);
  const staffTable = useDataTable(data, {
    searchable: s => [s.fullName, s.role.replace(/_/g, ' ')],
    sortValues: {
      fullName: s => s.fullName, role: s => s.role, transactionCount: s => s.transactionCount,
      revenue: s => s.revenue, grossProfit: s => s.grossProfit, avgTicket: s => s.avgTicket,
    },
    initialSort: { field: 'revenue', dir: 'desc' },
    pageSize: 15,
  });

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">{isHotel ? 'By Receptionist' : t('reports.staffTitle')}</h1>
          <p className="page-subtitle">{isHotel ? 'Check-in performance by receptionist' : 'Sales performance by seller'}</p>
        </div>
      </div>

      {/* Report tabs */}
      <div className="flex items-center gap-1 bg-stone-100 rounded-lg p-1 w-fit">
        {visibleTabs.map(({ to: tabTo, label, icon: Icon }) => (
          <Link key={tabTo} to={tabTo}
            className={`flex items-center gap-1.5 px-4 py-1.5 text-xs rounded-md transition-colors font-medium ${
              location.pathname === tabTo ? 'bg-white shadow-sm text-stone-900' : 'text-stone-500 hover:text-stone-700'
            }`}
          >
            <Icon size={13} />
            {isHotel && label === 'By Seller' ? 'By Receptionist' : label}
          </Link>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 bg-stone-100 rounded-lg p-1">
          {(['day', 'week', 'month'] as const).map(p => (
            <button key={p} onClick={() => selectPeriod(p)}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors capitalize ${
                period === p ? 'bg-white shadow-sm text-stone-900 font-medium' : 'text-stone-500 hover:text-stone-700'
              }`}>
              {p === 'day' ? 'Day' : p === 'week' ? 'Week' : 'Month'}
            </button>
          ))}
        </div>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="input w-auto text-xs" />
        <span className="text-stone-400 text-xs">to</span>
        <input type="date" value={to} onChange={e => setTo(e.target.value)} className="input w-auto text-xs" />
        <div className="flex gap-2 ml-auto">
          <button
            className="btn-secondary text-xs"
            disabled={data.length === 0}
            onClick={() => downloadCsv(
              `seller-summary-${from}-to-${to}.csv`,
              sortedForExport.map(s => [s.fullName, s.role.replace(/_/g, ' '), s.transactionCount, s.revenue, s.grossProfit.toFixed(0), s.avgTicket.toFixed(0)]),
              ['Seller', 'Role', 'Transactions', 'Revenue (TZS)', 'Gross Profit (TZS)', 'Avg Sale (TZS)']
            )}
          >
            <Download size={13} className="mr-1" /> {t('reports.exportCsv')}
          </button>
          <button
            className="btn-secondary text-xs"
            disabled={data.length === 0}
            onClick={async () => {
              if (!shopId) return;
              const rows: (string | number | null)[][] = [];
              for (const s of sortedForExport) {
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
            <Download size={13} className="mr-1" /> {t('reports.exportCsv')}
          </button>
        </div>
      </div>

      {/* Summary cards */}
      {!isLoading && data.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="card p-4"><p className="stat-value">{data.length}</p><p className="stat-label">{isHotel ? 'Receptionists' : 'Active sellers'}</p></div>
          <div className="card p-4"><p className="stat-value">{total.tx}</p><p className="stat-label">{isHotel ? 'Total check-ins' : 'Total transactions'}</p></div>
          <div className="card p-4"><p className="stat-value">{fmt(total.rev)}</p><p className="stat-label">Total revenue</p></div>
          <div className="card p-4"><p className="stat-value text-emerald-600">{fmt(total.profit)}</p><p className="stat-label">Total profit</p></div>
        </div>
      )}

      {/* Table */}
      <div className="card">
        <div className="px-5 py-3 border-b border-stone-100 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-stone-400">Click a row to expand and see {isHotel ? 'individual check-ins' : 'individual sales'}</p>
          <TableSearch value={staffTable.search} onChange={staffTable.setSearch} placeholder={isHotel ? 'Search receptionist…' : 'Search seller…'} className="max-w-[13rem]" />
        </div>
        {isLoading ? (
          <PageLoader />
        ) : isError ? (
          <div className="p-8 text-center text-red-500 text-sm">{t('common.error')}</div>
        ) : (
          <>
          <div className="table-wrapper overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <SortableTh field="fullName" sort={staffTable.sort} onSort={staffTable.toggleSort}>{isHotel ? 'Receptionist' : t('reports.staffName')}</SortableTh>
                  {!isHotel && <SortableTh field="role" sort={staffTable.sort} onSort={staffTable.toggleSort}>Role</SortableTh>}
                  <SortableTh field="transactionCount" sort={staffTable.sort} onSort={staffTable.toggleSort}>{isHotel ? 'Check-ins' : t('reports.transactions')}</SortableTh>
                  <SortableTh field="revenue" sort={staffTable.sort} onSort={staffTable.toggleSort}>{t('reports.revenue')}</SortableTh>
                  {!isHotel && <SortableTh field="grossProfit" sort={staffTable.sort} onSort={staffTable.toggleSort} className="text-emerald-700">{t('reports.grossProfit')}</SortableTh>}
                  <SortableTh field="avgTicket" sort={staffTable.sort} onSort={staffTable.toggleSort}>{isHotel ? 'Avg Stay' : t('reports.avgTicket')}</SortableTh>
                  <SortableTh field="revenue" sort={staffTable.sort} onSort={staffTable.toggleSort}>Share %</SortableTh>
                </tr>
              </thead>
              <tbody>
                {staffTable.view.map((s, i) => (
                  <SellerRow
                    key={s.userId}
                    stat={s}
                    rank={(staffTable.page - 1) * staffTable.pageSize + i + 1}
                    share={total.rev > 0 ? (s.revenue / total.rev) * 100 : 0}
                    from={from}
                    to={to}
                    shopId={shopId}
                    isHotel={isHotel}
                  />
                ))}
                {staffTable.total === 0 && (
                  <tr><td colSpan={isHotel ? 6 : 8} className="text-center text-stone-400 py-10">{t('reports.noSales')}</td></tr>
                )}
              </tbody>
              {data.length > 1 && (
                <tfoot>
                  <tr className="border-t-2 border-stone-200 bg-stone-50">
                    <td colSpan={isHotel ? 2 : 3} className="font-semibold text-stone-700 py-2 px-3">{t('common.total')}</td>
                    <td className="font-bold">{total.tx}</td>
                    <td className="font-bold">{fmt(total.rev)}</td>
                    {!isHotel && <td className="font-bold text-emerald-600">{fmt(total.profit)}</td>}
                    <td className="font-bold">{total.tx > 0 ? fmt(total.rev / total.tx) : '—'}</td>
                    <td className="font-bold">100%</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <TablePagination page={staffTable.page} pageCount={staffTable.pageCount} total={staffTable.total} pageSize={staffTable.pageSize} onPage={staffTable.setPage} onPageSize={staffTable.setPageSize} />
          </>
        )}
      </div>
    </div>
  );
}
