import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle, Wrench } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { PageLoader } from '../../components/ui/Loader';

interface AuditRow {
  productId: string;
  name: string;
  sku: string;
  unit: string;
  isActive: boolean;
  rowCount: number;
  currentStock: number;
  correctStock: number;
  discrepancy: number;
}

function fmt(n: number) {
  return n > 0 ? `+${n}` : String(n);
}

export default function InventoryAuditPage() {
  const { shopId } = useAuthStore();

  const { data, isLoading, isError } = useQuery<AuditRow[]>({
    queryKey: ['inventory-audit', shopId],
    queryFn: () => api.get('/inventory/audit').then(r => r.data.data),
    enabled: !!shopId,
  });

  const affected = data ?? [];

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Inventory Audit</h1>
          <p className="page-subtitle">Products affected by the multi-row stock deduction bug</p>
        </div>
      </div>

      {isLoading ? (
        <div className="card"><PageLoader /></div>
      ) : isError ? (
        <div className="card p-8 text-center text-red-500 text-sm">Failed to load audit data</div>
      ) : affected.length === 0 ? (
        <div className="card p-10 text-center">
          <CheckCircle size={36} className="text-emerald-500 mx-auto mb-3" />
          <p className="font-semibold text-stone-800">All products look clean</p>
          <p className="text-sm text-stone-400 mt-1">No products have multiple inventory rows</p>
        </div>
      ) : (
        <>
          <div className="card p-4 flex items-start gap-3 border-l-4 border-amber-400 bg-amber-50">
            <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-800">{affected.length} product{affected.length !== 1 ? 's' : ''} affected</p>
              <p className="text-xs text-amber-700 mt-0.5">
                Each product below has multiple inventory rows. The <strong>Shown Stock</strong> is wrong.
                The <strong>Correct Stock</strong> is calculated from the full movement history.
                Use the Adjust Stock button on each product to bring Shown Stock in line with Correct Stock.
              </p>
            </div>
          </div>

          <div className="card">
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Rows</th>
                    <th>Shown Stock</th>
                    <th>Correct Stock</th>
                    <th>Discrepancy</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {affected.map(row => (
                    <tr key={row.productId}>
                      <td>
                        <p className="font-medium text-stone-900">{row.name}</p>
                        <p className="text-xs text-stone-400 font-mono">{row.sku}</p>
                      </td>
                      <td>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">
                          {row.rowCount} rows
                        </span>
                      </td>
                      <td className={`font-mono font-semibold ${row.currentStock < 0 ? 'text-red-600' : 'text-stone-700'}`}>
                        {row.currentStock} {row.unit}
                      </td>
                      <td className="font-mono font-semibold text-emerald-700">
                        {row.correctStock} {row.unit}
                      </td>
                      <td className={`font-mono font-semibold ${row.discrepancy > 0 ? 'text-blue-600' : 'text-red-600'}`}>
                        {fmt(row.discrepancy)} {row.unit}
                      </td>
                      <td>
                        <Link
                          to={`/inventory/products`}
                          state={{ adjustProductId: row.productId, adjustBy: row.discrepancy }}
                          className="inline-flex items-center gap-1 text-xs btn-secondary px-3 py-1.5"
                        >
                          <Wrench size={11} /> Fix Stock
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card p-5 bg-stone-50">
            <p className="text-xs font-semibold text-stone-600 mb-2">How to fix each product:</p>
            <ol className="text-xs text-stone-500 space-y-1 list-decimal list-inside">
              <li>Note the <strong>Correct Stock</strong> value for the product</li>
              <li>Go to <strong>Inventory → Products</strong>, open that product</li>
              <li>Click <strong>Adjust Stock</strong></li>
              <li>If Discrepancy is positive → choose <strong>Add stock</strong>, enter the discrepancy amount</li>
              <li>If Discrepancy is negative → choose <strong>Remove stock</strong>, enter the absolute value</li>
              <li>Use reason: <em>"Stock correction — inventory row bug fix"</em></li>
            </ol>
          </div>
        </>
      )}
    </div>
  );
}
