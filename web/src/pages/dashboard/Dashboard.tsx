import { useQuery } from '@tanstack/react-query';
import { TrendingUp, ShoppingCart, Users, Package, AlertTriangle, ArrowUpRight, Store, CreditCard } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../../api/client';
import { useAuthStore } from '../../store/authStore';

interface DashboardData {
  revenue: { today: number; week: number; month: number };
  transactions: { today: number; week: number };
  customers: { total: number; new: number };
  lowStock: number;
  topProducts: { name: string; qty: number; revenue: number }[];
  recentTransactions: { id: string; receiptNo: string; total: number; paymentMethod: string; createdAt: string }[];
  salesChart: { label: string; revenue: number }[];
}

function StatCard({ icon: Icon, label, value, sub, color }: { icon: React.ElementType; label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between mb-3">
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon size={18} />
        </div>
        <ArrowUpRight size={14} className="text-stone-400" />
      </div>
      <p className="stat-value">{value}</p>
      <p className="stat-label">{label}</p>
      {sub && <p className="text-xs text-stone-400 mt-1">{sub}</p>}
    </div>
  );
}

function fmt(n: number, currency = 'TZS') {
  return new Intl.NumberFormat('sw-TZ', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);
}

export default function Dashboard() {
  const { shopId, account, user } = useAuthStore();

  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ['dashboard', shopId],
    queryFn: () => api.get('/tenant/dashboard').then(r => r.data.data),
    enabled: !!shopId,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="page-header"><h1 className="page-title">Dashboard</h1></div>
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
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">{account?.legalName}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={TrendingUp}
          label="Revenue today"
          value={fmt(data?.revenue?.today ?? 0)}
          sub={`${fmt(data?.revenue?.month ?? 0)} this month`}
          color="bg-primary-50 text-primary-600"
        />
        <StatCard
          icon={ShoppingCart}
          label="Transactions today"
          value={String(data?.transactions?.today ?? 0)}
          sub={`${data?.transactions?.week ?? 0} this week`}
          color="bg-duka-50 text-duka-600"
        />
        <StatCard
          icon={Users}
          label="Total customers"
          value={String(data?.customers?.total ?? 0)}
          sub={`+${data?.customers?.new ?? 0} new`}
          color="bg-blue-50 text-blue-600"
        />
        <StatCard
          icon={Package}
          label="Low stock alerts"
          value={String(data?.lowStock ?? 0)}
          color={data?.lowStock ? 'bg-red-50 text-red-600' : 'bg-stone-50 text-stone-500'}
        />
      </div>

      {/* Charts + recent */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sales chart */}
        <div className="card p-5 lg:col-span-2">
          <h3 className="text-sm font-semibold text-stone-700 mb-4">Sales — last 14 days</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data?.salesChart ?? []} barSize={14}>
              <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => fmt(v)} labelStyle={{ fontSize: 11 }} />
              <Bar dataKey="revenue" fill="#a66624" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Top products */}
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-stone-700 mb-4">Top products</h3>
          <div className="space-y-3">
            {(data?.topProducts ?? []).slice(0, 6).map((p, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-4 text-xs text-stone-400 shrink-0">{i + 1}</span>
                  <span className="text-xs text-stone-700 truncate">{p.name}</span>
                </div>
                <span className="text-xs font-medium text-stone-900 ml-2 shrink-0">{fmt(p.revenue)}</span>
              </div>
            ))}
            {!data?.topProducts?.length && <p className="text-xs text-stone-400">No sales yet</p>}
          </div>
        </div>
      </div>

      {/* Recent transactions */}
      <div className="card">
        <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-stone-700">Recent transactions</h3>
          <a href="/reports/sales" className="text-xs text-primary-600 hover:underline">View all</a>
        </div>
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Receipt</th>
                <th>Amount</th>
                <th>Payment</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {(data?.recentTransactions ?? []).map(tx => (
                <tr key={tx.id}>
                  <td className="font-mono">{tx.receiptNo}</td>
                  <td className="font-medium">{fmt(tx.total)}</td>
                  <td>
                    <span className="badge badge-stone">{tx.paymentMethod.replace('_', ' ')}</span>
                  </td>
                  <td className="text-stone-400">
                    {new Date(tx.createdAt).toLocaleTimeString('sw-TZ', { hour: '2-digit', minute: '2-digit' })}
                  </td>
                </tr>
              ))}
              {!data?.recentTransactions?.length && (
                <tr><td colSpan={4} className="text-center text-stone-400 py-6">No transactions today</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Subscription info — owners only */}
      {account && user?.role === 'ACCOUNT_OWNER' && (
        <div className="card p-5 flex items-center gap-4">
          <div className="p-2 rounded-lg bg-primary-50 text-primary-600">
            <Store size={18} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-stone-900">{account.plan} plan</p>
            <p className="text-xs text-stone-400">{account.legalName}</p>
          </div>
          <a href="/admin/business" className="btn-secondary text-xs px-3 py-1.5">
            <CreditCard size={12} className="mr-1.5" /> Manage
          </a>
        </div>
      )}
    </div>
  );
}
