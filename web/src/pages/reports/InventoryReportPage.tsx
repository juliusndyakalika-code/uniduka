import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Package, TrendingDown } from 'lucide-react';
import api from '../../api/client';
import { useAuthStore } from '../../store/authStore';

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
  const { shopId } = useAuthStore();

  const { data, isLoading } = useQuery<InventoryReport>({
    queryKey: ['inventory-report', shopId],
    queryFn: () => api.get('/reporting/inventory').then(r => r.data.data),
    enabled: !!shopId,
  });

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title">Inventory Report</h1>
      </div>

      {isLoading ? (
        <div className="card p-8 text-center text-stone-400">Loading…</div>
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
              <div className="px-5 py-4 border-b border-stone-100">
                <h3 className="text-sm font-semibold text-stone-700">Low Stock Alerts</h3>
              </div>
              <div className="table-wrapper">
                <table className="table">
                  <thead><tr><th>Product</th><th>Stock</th><th>Reorder at</th></tr></thead>
                  <tbody>
                    {(data?.lowStock ?? []).map(p => (
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
                    {!data?.lowStock?.length && <tr><td colSpan={3} className="text-center text-stone-400 py-6">All stocked up!</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Stock valuation */}
            <div className="card">
              <div className="px-5 py-4 border-b border-stone-100">
                <h3 className="text-sm font-semibold text-stone-700">Stock Valuation (top 10)</h3>
              </div>
              <div className="table-wrapper">
                <table className="table">
                  <thead><tr><th>Product</th><th>Stock</th><th>Value</th></tr></thead>
                  <tbody>
                    {(data?.valuation ?? []).slice(0, 10).map((p, i) => (
                      <tr key={i}>
                        <td className="font-medium">{p.name}</td>
                        <td>{p.stock}</td>
                        <td className="font-medium">{fmt(p.value)}</td>
                      </tr>
                    ))}
                    {!data?.valuation?.length && <tr><td colSpan={3} className="text-center text-stone-400 py-6">No data</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Expiring */}
          {data?.expiring && data.expiring.length > 0 && (
            <div className="card">
              <div className="px-5 py-4 border-b border-stone-100 flex items-center gap-2">
                <AlertTriangle size={14} className="text-amber-500" />
                <h3 className="text-sm font-semibold text-stone-700">Expiring Soon</h3>
              </div>
              <div className="table-wrapper">
                <table className="table">
                  <thead><tr><th>Product</th><th>Batch</th><th>Qty</th><th>Expires</th></tr></thead>
                  <tbody>
                    {data.expiring.map((e, i) => (
                      <tr key={i}>
                        <td className="font-medium">{e.name}</td>
                        <td className="font-mono text-xs">{e.batchNo || '—'}</td>
                        <td>{e.qty}</td>
                        <td className="text-amber-600 font-medium text-xs">{new Date(e.expiresAt).toLocaleDateString('sw-TZ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
