import { useMemo } from 'react';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router-dom';
import { TrendingUp, Users, Package, BarChart2, Download } from 'lucide-react';
import { useDataTable, TableSearch, SortableTh, TablePagination } from '../../components/ui/DataTable';
import { downloadCsv } from '../../utils/exportCsv';
import api from '../../api/client';

interface ProductRow {
  productId: string; name: string; sku: string; unit: string;
  qty: number; revenue: number; cost: number; grossProfit: number; margin: number;
}
interface ProductSalesData {
  rows: ProductRow[];
  totals: { qty: number; revenue: number; cost: number; grossProfit: number };
}

const fmt = (n: number) =>
  new Intl.NumberFormat('sw-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 0 }).format(n);

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function presetRange(p: 'today' | 'week' | 'month') {
  const now = new Date();
  const to = ymd(now);
  if (p === 'today') return { from: to, to };
  if (p === 'week') {
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

export default function ProductSalesPage() {
  const location = useLocation();
  const [from, setFrom] = useState(() => presetRange('month').from);
  const [to, setTo]     = useState(() => presetRange('month').to);

  const { data, isLoading } = useQuery<ProductSalesData>({
    queryKey: ['product-sales-report', from, to],
    queryFn: () => api.get('/reporting/products', { params: { from, to } }).then(r => r.data.data),
  });

  const { view, search, setSearch, sort, toggleSort, page, setPage, pageCount, pageSize, setPageSize, total } =
    useDataTable<ProductRow>(data?.rows ?? [], {
      searchable: r => [r.name, r.sku],
      sortValues: {
        name:        r => r.name.toLowerCase(),
        sku:         r => r.sku.toLowerCase(),
        qty:         r => r.qty,
        revenue:     r => r.revenue,
        cost:        r => r.cost,
        grossProfit: r => r.grossProfit,
        margin:      r => r.margin,
      },
      initialSort: { field: 'revenue', dir: 'desc' },
      pageSize: 25,
    });

  const totals = useMemo(() => data?.totals ?? { qty: 0, revenue: 0, cost: 0, grossProfit: 0 }, [data]);
  const overallMargin = totals.revenue > 0 ? (totals.grossProfit / totals.revenue) * 100 : 0;

  function exportCsv() {
    const headers = ['Product', 'SKU', 'Unit', 'Qty Sold', 'Revenue (TZS)', 'Cost (TZS)', 'Gross Profit (TZS)', 'Margin %'];
    const rows = (data?.rows ?? []).map(r => [r.name, r.sku, r.unit, r.qty, r.revenue, r.cost, r.grossProfit, r.margin.toFixed(1)]);
    downloadCsv(`product-sales-${from}-to-${to}.csv`, rows, headers);
  }

  function marginBadge(m: number) {
    return m >= 30 ? 'bg-emerald-100 text-emerald-700'
      : m >= 15 ? 'bg-amber-100 text-amber-700'
      : 'bg-red-100 text-red-700';
  }

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Sales by Product</h1>
          <p className="page-subtitle">All completed sales broken down per product</p>
        </div>
        <button onClick={exportCsv} disabled={!data?.rows.length} className="btn-secondary">
          <Download size={13} /> Export CSV
        </button>
      </div>

      {/* Report tabs */}
      <div className="flex gap-1 flex-wrap">
        {REPORT_TABS.map(tab => {
          const active = location.pathname === tab.to;
          return (
            <Link key={tab.to} to={tab.to}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all
                ${active ? 'btn-primary' : 'btn-secondary'}`}>
              <tab.icon size={13} /> {tab.label}
            </Link>
          );
        })}
      </div>

      {/* Date range */}
      <div className="card p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label">From</label>
          <input type="date" className="input-box" value={from}
            max={to} onChange={e => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="label">To</label>
          <input type="date" className="input-box" value={to}
            min={from} max={ymd(new Date())} onChange={e => setTo(e.target.value)} />
        </div>
        <div className="flex gap-2 pb-0.5">
          {(['today', 'week', 'month'] as const).map(p => (
            <button key={p} onClick={() => { const r = presetRange(p); setFrom(r.from); setTo(r.to); }}
              className="btn-secondary text-xs">
              {p === 'today' ? 'Today' : p === 'week' ? 'This Week' : 'This Month'}
            </button>
          ))}
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-5">
          <p className="stat-value text-violet-700">{isLoading ? '—' : (data?.rows.length ?? 0)}</p>
          <p className="stat-label">Products sold</p>
        </div>
        <div className="card p-5">
          <p className="stat-value text-stone-800">{isLoading ? '—' : fmt(totals.revenue)}</p>
          <p className="stat-label">Total revenue</p>
        </div>
        <div className="card p-5">
          <p className="stat-value text-emerald-700">{isLoading ? '—' : fmt(totals.grossProfit)}</p>
          <p className="stat-label">Gross profit</p>
        </div>
        <div className="card p-5">
          <p className={`stat-value ${overallMargin >= 30 ? 'text-emerald-700' : overallMargin >= 15 ? 'text-amber-600' : 'text-red-600'}`}>
            {isLoading ? '—' : `${overallMargin.toFixed(1)}%`}
          </p>
          <p className="stat-label">Overall margin</p>
        </div>
      </div>

      {/* Table */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h2 className="text-sm font-semibold text-stone-700">Product breakdown</h2>
          <TableSearch value={search} onChange={setSearch} placeholder="Search product or SKU…" />
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[...Array(8)].map((_, i) => <div key={i} className="h-10 bg-stone-100 rounded-lg animate-pulse" />)}
          </div>
        ) : view.length === 0 ? (
          <p className="text-sm text-stone-400 text-center py-8">No sales found for this period.</p>
        ) : (
          <>
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <SortableTh field="name"        sort={sort} onSort={toggleSort}>Product</SortableTh>
                    <SortableTh field="sku"         sort={sort} onSort={toggleSort}>SKU</SortableTh>
                    <SortableTh field="qty"         sort={sort} onSort={toggleSort} align="right">Qty Sold</SortableTh>
                    <SortableTh field="revenue"     sort={sort} onSort={toggleSort} align="right">Revenue</SortableTh>
                    <SortableTh field="cost"        sort={sort} onSort={toggleSort} align="right">Cost</SortableTh>
                    <SortableTh field="grossProfit" sort={sort} onSort={toggleSort} align="right">Gross Profit</SortableTh>
                    <SortableTh field="margin"      sort={sort} onSort={toggleSort} align="right">Margin</SortableTh>
                  </tr>
                </thead>
                <tbody>
                  {view.map(row => (
                    <tr key={row.productId}>
                      <td className="font-medium text-stone-800">{row.name}</td>
                      <td className="text-stone-400 text-xs">{row.sku || '—'}</td>
                      <td className="text-right tabular-nums">
                        {row.qty % 1 === 0 ? row.qty : row.qty.toFixed(2)} {row.unit}
                      </td>
                      <td className="text-right tabular-nums">{fmt(row.revenue)}</td>
                      <td className="text-right tabular-nums text-stone-500">{fmt(row.cost)}</td>
                      <td className="text-right tabular-nums font-medium text-emerald-700">{fmt(row.grossProfit)}</td>
                      <td className="text-right">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${marginBadge(row.margin)}`}>
                          {row.margin.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-semibold border-t-2 border-stone-200">
                    <td colSpan={2} className="text-stone-600">Total ({data?.rows.length} products)</td>
                    <td className="text-right tabular-nums">
                      {totals.qty % 1 === 0 ? totals.qty : totals.qty.toFixed(2)}
                    </td>
                    <td className="text-right tabular-nums">{fmt(totals.revenue)}</td>
                    <td className="text-right tabular-nums text-stone-500">{fmt(totals.cost)}</td>
                    <td className="text-right tabular-nums text-emerald-700">{fmt(totals.grossProfit)}</td>
                    <td className="text-right">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${marginBadge(overallMargin)}`}>
                        {overallMargin.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <TablePagination
              page={page} pageCount={pageCount} total={total}
              pageSize={pageSize} onPage={setPage} onPageSize={setPageSize}
            />
          </>
        )}
      </div>
    </div>
  );
}
