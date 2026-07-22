import { useQuery } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router-dom';
import { AlertTriangle, Package, TrendingDown, TrendingUp, Users, BarChart2, Download } from 'lucide-react';
import { downloadCsv } from '../../utils/exportCsv';
import api from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { useTranslation } from 'react-i18next';
import { useDataTable, TableSearch, SortableTh, TablePagination } from '../../components/ui/DataTable';
import { PageLoader } from '../../components/ui/Loader';

const REPORT_TABS = [
  { to: '/reports/sales',     label: 'Sales',      icon: TrendingUp },
  { to: '/reports/staff',     label: 'By Seller',  icon: Users },
  { to: '/reports/products',  label: 'By Product', icon: BarChart2 },
  { to: '/reports/inventory', label: 'Stock',      icon: Package },
];

interface InventoryReport {
  summary: { totalProducts: number; totalValue: number; lowStockCount: number; outOfStockCount: number };
  lowStock: { id: string; name: string; sku: string; stock: number; reorderPoint: number; unit: string }[];
  expiring: { id: string; name: string; batchNo?: string; qty: number; expiresAt: string }[];
  valuation: { name: string; stock: number; costPrice: number; value: number }[];
}

function fmt(n: number) {
  return new Intl.NumberFormat('sw-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 0 }).format(n);
}

export default function InventoryReportPage() {
  const { t } = useTranslation();
  const { shopId } = useAuthStore();
  const location = useLocation();

  const { data, isLoading, isError } = useQuery<InventoryReport>({
    queryKey: ['inventory-report', shopId],
    queryFn: () => api.get('/reporting/inventory').then(r => r.data.data),
    enabled: !!shopId,
  });

  const lowStockTable = useDataTable(data?.lowStock ?? [], {
    searchable: p => [p.name, p.sku],
    sortValues: { name: p => p.name, stock: p => p.stock, reorderPoint: p => p.reorderPoint },
    initialSort: { field: 'stock', dir: 'asc' },
    pageSize: 10,
  });
  const valuationTable = useDataTable(data?.valuation ?? [], {
    searchable: p => [p.name],
    sortValues: { name: p => p.name, stock: p => p.stock, value: p => p.value },
    initialSort: { field: 'value', dir: 'desc' },
    pageSize: 10,
  });
  const expiringTable = useDataTable(data?.expiring ?? [], {
    searchable: e => [e.name, e.batchNo],
    sortValues: { name: e => e.name, batchNo: e => e.batchNo, qty: e => e.qty, expiresAt: e => new Date(e.expiresAt) },
    initialSort: { field: 'expiresAt', dir: 'asc' },
    pageSize: 10,
  });

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title">{t('reports.inventoryTitle')}</h1>
        <div className="flex gap-2">
          <button
            className="btn-secondary text-xs"
            disabled={!data}
            onClick={() => {
              if (!data) return;
              const today = new Date().toISOString().split('T')[0];
              downloadCsv(
                `stock-valuation-${today}.csv`,
                (data.valuation ?? []).map(p => [p.name, p.stock, p.costPrice, p.value]),
                ['Product', 'Stock Qty', 'Cost Price (TZS)', 'Stock Value (TZS)']
              );
            }}
          >
            <Download size={13} className="mr-1" /> {t('reports.exportValuation')}
          </button>
          <button
            className="btn-secondary text-xs"
            disabled={!data || !(data.lowStock?.length)}
            onClick={() => {
              if (!data) return;
              const today = new Date().toISOString().split('T')[0];
              downloadCsv(
                `low-stock-${today}.csv`,
                (data.lowStock ?? []).map(p => [p.name, p.sku, p.stock, p.reorderPoint, p.unit]),
                ['Product', 'SKU', 'Current Stock', 'Reorder Point', 'Unit']
              );
            }}
          >
            <Download size={13} className="mr-1" /> {t('reports.exportLowStock')}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1 bg-stone-100 rounded-lg p-1 w-fit">
        {REPORT_TABS.map(({ to, label, icon: Icon }) => (
          <Link key={to} to={to}
            className={`flex items-center gap-1.5 px-4 py-1.5 text-xs rounded-md transition-colors font-medium ${
              location.pathname === to ? 'bg-white shadow-sm text-stone-900' : 'text-stone-500 hover:text-stone-700'
            }`}
          >
            <Icon size={13} />{label}
          </Link>
        ))}
      </div>

      {isLoading ? (
        <div className="card"><PageLoader /></div>
      ) : isError ? (
        <div className="card p-8 text-center text-red-500 text-sm">{t('common.error')}</div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Total Products', value: String(data?.summary.totalProducts ?? 0), icon: Package, color: 'bg-stone-50 text-stone-500' },
              { label: 'Stock Value', value: fmt(data?.summary.totalValue ?? 0), icon: TrendingDown, color: 'bg-blue-50 text-blue-600' },
              { label: 'Low Stock', value: String(data?.summary.lowStockCount ?? 0), icon: AlertTriangle, color: 'bg-amber-50 text-amber-600' },
              { label: 'Out of Stock', value: String(data?.summary.outOfStockCount ?? 0), icon: AlertTriangle, color: 'bg-red-50 text-red-600' },
            ].map(s => (
              <div key={s.label} className="card p-5">
                <div className={`p-2 rounded-lg w-fit mb-3 ${s.color}`}>
                  <s.icon size={16} />
                </div>
                <p className="stat-value">{s.value}</p>
                <p className="stat-label">{s.label}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Low stock */}
            <div className="card">
              <div className="px-5 py-4 border-b border-stone-100 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-stone-700">Low Stock Alerts</h3>
                <TableSearch value={lowStockTable.search} onChange={lowStockTable.setSearch} placeholder="Search product…" className="max-w-[12rem]" />
              </div>
              <div className="table-wrapper">
                <table className="table">
                  <thead><tr>
                    <SortableTh field="name" sort={lowStockTable.sort} onSort={lowStockTable.toggleSort}>{t('reports.product')}</SortableTh>
                    <SortableTh field="stock" sort={lowStockTable.sort} onSort={lowStockTable.toggleSort}>{t('stock.quantity')}</SortableTh>
                    <SortableTh field="reorderPoint" sort={lowStockTable.sort} onSort={lowStockTable.toggleSort}>Reorder at</SortableTh>
                  </tr></thead>
                  <tbody>
                    {lowStockTable.view.map(p => (
                      <tr key={p.id}>
                        <td>
                          <p className="font-medium">{p.name}</p>
                          <p className="text-xs text-stone-400 font-mono">{p.sku}</p>
                        </td>
                        <td className={`font-medium ${p.stock === 0 ? 'text-red-600' : 'text-amber-600'}`}>
                          {p.stock} {p.unit}
                        </td>
                        <td className="text-stone-400">{p.reorderPoint} {p.unit}</td>
                      </tr>
                    ))}
                    {lowStockTable.total === 0 && <tr><td colSpan={3} className="text-center text-stone-400 py-6">All stocked up!</td></tr>}
                  </tbody>
                </table>
              </div>
              <TablePagination page={lowStockTable.page} pageCount={lowStockTable.pageCount} total={lowStockTable.total} pageSize={lowStockTable.pageSize} onPage={lowStockTable.setPage} onPageSize={lowStockTable.setPageSize} />
            </div>

            {/* Stock valuation */}
            <div className="card">
              <div className="px-5 py-4 border-b border-stone-100 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-stone-700">Stock Valuation</h3>
                <TableSearch value={valuationTable.search} onChange={valuationTable.setSearch} placeholder="Search product…" className="max-w-[12rem]" />
              </div>
              <div className="table-wrapper">
                <table className="table">
                  <thead><tr>
                    <SortableTh field="name" sort={valuationTable.sort} onSort={valuationTable.toggleSort}>{t('reports.product')}</SortableTh>
                    <SortableTh field="stock" sort={valuationTable.sort} onSort={valuationTable.toggleSort}>{t('stock.quantity')}</SortableTh>
                    <SortableTh field="value" sort={valuationTable.sort} onSort={valuationTable.toggleSort}>{t('common.amount')}</SortableTh>
                  </tr></thead>
                  <tbody>
                    {valuationTable.view.map((p, i) => (
                      <tr key={(valuationTable.page - 1) * valuationTable.pageSize + i}>
                        <td className="font-medium">{p.name}</td>
                        <td>{p.stock}</td>
                        <td className="font-medium">{fmt(p.value)}</td>
                      </tr>
                    ))}
                    {valuationTable.total === 0 && <tr><td colSpan={3} className="text-center text-stone-400 py-6">{t('common.noData')}</td></tr>}
                  </tbody>
                </table>
              </div>
              <TablePagination page={valuationTable.page} pageCount={valuationTable.pageCount} total={valuationTable.total} pageSize={valuationTable.pageSize} onPage={valuationTable.setPage} onPageSize={valuationTable.setPageSize} />
            </div>
          </div>

          {/* Expiring */}
          {data?.expiring && data.expiring.length > 0 && (
            <div className="card">
              <div className="px-5 py-4 border-b border-stone-100 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={14} className="text-amber-500" />
                  <h3 className="text-sm font-semibold text-stone-700">Expiring Soon</h3>
                </div>
                <TableSearch value={expiringTable.search} onChange={expiringTable.setSearch} placeholder="Search product, batch…" className="max-w-[13rem]" />
              </div>
              <div className="table-wrapper">
                <table className="table">
                  <thead><tr>
                    <SortableTh field="name" sort={expiringTable.sort} onSort={expiringTable.toggleSort}>Product</SortableTh>
                    <SortableTh field="batchNo" sort={expiringTable.sort} onSort={expiringTable.toggleSort}>Batch</SortableTh>
                    <SortableTh field="qty" sort={expiringTable.sort} onSort={expiringTable.toggleSort}>Qty</SortableTh>
                    <SortableTh field="expiresAt" sort={expiringTable.sort} onSort={expiringTable.toggleSort}>Expires</SortableTh>
                  </tr></thead>
                  <tbody>
                    {expiringTable.view.map((e, i) => (
                      <tr key={(expiringTable.page - 1) * expiringTable.pageSize + i}>
                        <td className="font-medium">{e.name}</td>
                        <td className="font-mono text-xs">{e.batchNo || '—'}</td>
                        <td>{e.qty}</td>
                        <td className="text-amber-600 font-medium text-xs">{new Date(e.expiresAt).toLocaleDateString('sw-TZ')}</td>
                      </tr>
                    ))}
                    {expiringTable.total === 0 && <tr><td colSpan={4} className="text-center text-stone-400 py-6">{t('common.noData')}</td></tr>}
                  </tbody>
                </table>
              </div>
              <TablePagination page={expiringTable.page} pageCount={expiringTable.pageCount} total={expiringTable.total} pageSize={expiringTable.pageSize} onPage={expiringTable.setPage} onPageSize={expiringTable.setPageSize} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
