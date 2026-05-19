import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import {
  Package, AlertTriangle, TrendingUp, DollarSign,
  ArrowRight, Clock, ShoppingCart, Boxes,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import api from '../../api/client';
import { useAuthStore } from '../../store/authStore';

// ── Types ────────────────────────────────────────────────────────────────────
interface Kpis {
  totalProducts: number; outOfStock: number; lowStock: number;
  totalStockValue: number; totalRetailValue: number;
}
interface CategoryRow { name: string; stockValue: number; retailValue: number; items: number; }
interface TypeRow     { name: string; count: number; }
interface AlertProduct { id: string; name: string; sku: string; stock?: number; reorderPoint?: number; unit?: string; category?: string; type?: string; }
interface TopProduct  { name: string; sku: string; stock: number; unit: string; value: number; sellPrice: number; }
interface Movement    { id: string; type: string; quantity: number; unitCost: number; note?: string; createdAt: string; product: { name: string; sku: string }; }
interface ExpiryAlert { id: string; quantity: number; expiryDate: string; product: { name: string; sku: string; unit: string }; }
interface DashData {
  kpis: Kpis; byCategory: CategoryRow[]; byType: TypeRow[];
  lowStockList: AlertProduct[]; outOfStockList: AlertProduct[];
  topByValue: TopProduct[]; recentMovements: Movement[]; expiryAlerts: ExpiryAlert[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const CURRENCY = new Intl.NumberFormat('sw-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 0 });
const fmt = (n: number) => CURRENCY.format(n);
const fmtK = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(0)}K` : String(Math.round(n));

const TYPE_COLORS: Record<string, string> = {
  PRODUCT: '#a66624', SERVICE: '#0ea5e9', MENU_ITEM: '#10b981',
  INGREDIENT: '#f59e0b', COMPOSITE: '#8b5cf6',
};
const PIE_FALLBACK = ['#a66624', '#0ea5e9', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444'];

const MOV_BADGE: Record<string, string> = {
  PURCHASE: 'badge-green', ADJUSTMENT: 'badge-blue',
  SALE: 'badge-stone', WASTE: 'badge-amber', RETURN: 'badge-amber',
};

// ── Sub-components ────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, icon, color }: { label: string; value: string | number; sub?: string; icon: React.ReactNode; color: string }) {
  return (
    <div className="card p-5 flex items-start gap-4">
      <div className={`p-2.5 rounded-lg shrink-0 ${color}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-stone-400 font-medium">{label}</p>
        <p className="text-xl font-bold text-stone-900 mt-0.5 truncate">{value}</p>
        {sub && <p className="text-xs text-stone-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function SectionHeader({ title, to, label }: { title: string; to?: string; label?: string }) {
  const navigate = useNavigate();
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-sm font-semibold text-stone-700">{title}</h2>
      {to && <button onClick={() => navigate(to)} className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-800"><span>{label ?? 'View all'}</span><ArrowRight size={12} /></button>}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function InventoryDashboard() {
  const { shopId } = useAuthStore();

  const { data, isLoading } = useQuery<DashData>({
    queryKey: ['inventory-dashboard', shopId],
    queryFn: () => api.get('/inventory/dashboard').then(r => r.data.data),
    enabled: !!shopId,
    staleTime: 60_000,
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <div className="page-header"><h1 className="page-title">Inventory Dashboard</h1></div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="card p-5 h-24 animate-pulse bg-stone-100" />)}
        </div>
      </div>
    );
  }

  const { kpis, byCategory, byType, lowStockList, outOfStockList, topByValue, recentMovements, expiryAlerts } = data;
  const margin = kpis.totalStockValue > 0
    ? ((kpis.totalRetailValue - kpis.totalStockValue) / kpis.totalStockValue * 100).toFixed(1)
    : '0';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Inventory Dashboard</h1>
          <p className="page-subtitle">Live snapshot of your stock</p>
        </div>
      </div>

      {/* ── KPI row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Total Products"
          value={kpis.totalProducts}
          sub={`${kpis.outOfStock} out of stock`}
          icon={<Package size={18} className="text-primary-600" />}
          color="bg-primary-50"
        />
        <KpiCard
          label="Low Stock Alerts"
          value={kpis.lowStock}
          sub="below reorder point"
          icon={<AlertTriangle size={18} className="text-amber-600" />}
          color="bg-amber-50"
        />
        <KpiCard
          label="Stock Cost Value"
          value={`TZS ${fmtK(kpis.totalStockValue)}`}
          sub={`Retail: TZS ${fmtK(kpis.totalRetailValue)}`}
          icon={<DollarSign size={18} className="text-emerald-600" />}
          color="bg-emerald-50"
        />
        <KpiCard
          label="Potential Margin"
          value={`${margin}%`}
          sub="cost → retail spread"
          icon={<TrendingUp size={18} className="text-blue-600" />}
          color="bg-blue-50"
        />
      </div>

      {/* ── Charts row ── */}
      <div className="grid lg:grid-cols-3 gap-4">

        {/* Stock value by category — bar */}
        <div className="card p-5 lg:col-span-2">
          <SectionHeader title="Stock Value by Category" />
          {byCategory.length === 0 ? (
            <p className="text-sm text-stone-400 text-center py-8">No categorised products yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={byCategory} margin={{ top: 4, right: 8, left: 0, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-35} textAnchor="end" interval={0} />
                <YAxis tickFormatter={fmtK} tick={{ fontSize: 11 }} width={52} />
                <Tooltip
                  formatter={(v: number, name: string) => [fmt(v), name === 'stockValue' ? 'Cost value' : 'Retail value']}
                  labelStyle={{ fontWeight: 600, fontSize: 12 }}
                  contentStyle={{ fontSize: 12 }}
                />
                <Bar dataKey="stockValue" name="stockValue" fill="#a66624" radius={[3,3,0,0]} />
                <Bar dataKey="retailValue" name="retailValue" fill="#d4a574" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Product type distribution — donut */}
        <div className="card p-5">
          <SectionHeader title="By Product Type" />
          {byType.length === 0 ? (
            <p className="text-sm text-stone-400 text-center py-8">No products</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={byType} dataKey="count" nameKey="name" cx="50%" cy="45%" innerRadius={50} outerRadius={80} paddingAngle={2}>
                  {byType.map((entry, i) => (
                    <Cell key={entry.name} fill={TYPE_COLORS[entry.name] ?? PIE_FALLBACK[i % PIE_FALLBACK.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => [v, 'products']} contentStyle={{ fontSize: 12 }} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} formatter={v => v.replace(/_/g,' ')} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Alert tables row ── */}
      <div className="grid lg:grid-cols-2 gap-4">

        {/* Low stock */}
        <div className="card">
          <div className="p-4 border-b border-stone-100">
            <SectionHeader title={`Low Stock (${kpis.lowStock})`} to="/inventory/products?active=true" label="Manage" />
          </div>
          {lowStockList.length === 0 ? (
            <p className="text-sm text-stone-400 text-center py-8">All products are well-stocked</p>
          ) : (
            <div className="divide-y divide-stone-50">
              {lowStockList.map(p => (
                <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                  <AlertTriangle size={14} className="text-amber-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-stone-900 truncate">{p.name}</p>
                    <p className="text-xs text-stone-400">{p.category ?? '—'} · {p.sku}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-amber-600">{p.stock} {p.unit}</p>
                    <p className="text-xs text-stone-400">min {p.reorderPoint}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Out of stock */}
        <div className="card">
          <div className="p-4 border-b border-stone-100">
            <SectionHeader title={`Out of Stock (${kpis.outOfStock})`} to="/inventory/products?active=false" label="Manage" />
          </div>
          {outOfStockList.length === 0 ? (
            <p className="text-sm text-stone-400 text-center py-8">No products out of stock</p>
          ) : (
            <div className="divide-y divide-stone-50">
              {outOfStockList.map(p => (
                <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                    <Package size={11} className="text-red-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-stone-900 truncate">{p.name}</p>
                    <p className="text-xs text-stone-400">{p.category ?? '—'} · {p.sku}</p>
                  </div>
                  <span className="text-xs font-semibold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full shrink-0">
                    0 units
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Top products by value + movements row ── */}
      <div className="grid lg:grid-cols-2 gap-4">

        {/* Top by stock value */}
        <div className="card">
          <div className="p-4 border-b border-stone-100">
            <SectionHeader title="Top Products by Stock Value" />
          </div>
          {topByValue.length === 0 ? (
            <p className="text-sm text-stone-400 text-center py-8">No stock recorded</p>
          ) : (
            <div className="divide-y divide-stone-50">
              {topByValue.map((p, i) => (
                <div key={p.sku} className="flex items-center gap-3 px-4 py-3">
                  <span className="text-xs font-bold text-stone-300 w-4 shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-stone-900 truncate">{p.name}</p>
                    <p className="text-xs text-stone-400">{p.stock} {p.unit} @ {fmt(p.sellPrice)}</p>
                  </div>
                  <p className="text-sm font-bold text-stone-900 shrink-0">{fmt(p.value)}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent movements */}
        <div className="card">
          <div className="p-4 border-b border-stone-100">
            <SectionHeader title="Recent Stock Movements" to="/inventory/stock" label="Stock page" />
          </div>
          {recentMovements.length === 0 ? (
            <p className="text-sm text-stone-400 text-center py-8">No movements recorded</p>
          ) : (
            <div className="divide-y divide-stone-50">
              {recentMovements.map(m => (
                <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-6 h-6 rounded-full bg-stone-100 flex items-center justify-center shrink-0">
                    {m.type === 'PURCHASE' ? <Boxes size={11} className="text-emerald-600" /> :
                     m.type === 'SALE'     ? <ShoppingCart size={11} className="text-primary-600" /> :
                                             <Clock size={11} className="text-stone-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-stone-900 truncate">{m.product.name}</p>
                    <p className="text-[10px] text-stone-400">{formatDistanceToNow(new Date(m.createdAt), { addSuffix: true })}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`badge ${MOV_BADGE[m.type] ?? 'badge-stone'} text-[10px]`}>{m.type}</span>
                    <p className="text-xs font-semibold text-stone-700 mt-0.5">
                      {m.type === 'SALE' ? '−' : '+'}{m.quantity}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Expiry alerts ── */}
      {expiryAlerts.length > 0 && (
        <div className="card">
          <div className="p-4 border-b border-stone-100">
            <SectionHeader title={`Expiring Within 30 Days (${expiryAlerts.length})`} />
          </div>
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>Qty</th>
                  <th>Expires</th>
                  <th>Days left</th>
                </tr>
              </thead>
              <tbody>
                {expiryAlerts.map(a => {
                  const daysLeft = Math.ceil((new Date(a.expiryDate).getTime() - Date.now()) / 864e5);
                  return (
                    <tr key={a.id}>
                      <td className="font-medium text-stone-900">{a.product.name}</td>
                      <td className="font-mono text-xs">{a.product.sku}</td>
                      <td>{a.quantity} {a.product.unit}</td>
                      <td className="text-xs">{new Date(a.expiryDate).toLocaleDateString()}</td>
                      <td>
                        <span className={`badge ${daysLeft <= 7 ? 'badge-red' : 'badge-amber'}`}>
                          {daysLeft}d
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
