import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Download } from 'lucide-react';
import api from '../../api/client';
import { useAuthStore } from '../../store/authStore';

interface SalesReport {
  summary: { revenue: number; transactions: number; avgTicket: number; grossProfit: number };
  byDay: { date: string; revenue: number; txCount: number }[];
  byPaymentMethod: { method: string; total: number; count: number }[];
  topProducts: { name: string; revenue: number; qty: number }[];
}

const PIE_COLORS = ['#a66624', '#14b8a6', '#3b82f6', '#f59e0b', '#6b7280'];

function fmt(n: number) {
  return new Intl.NumberFormat('sw-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 0 }).format(n);
}

export default function SalesReportPage() {
  const { shopId } = useAuthStore();
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('week');
  const [from, setFrom] = useState(() => {
    const d = new Date(Date.now() - 7 * 86_400_000); return d.toISOString().split('T')[0];
  });
  const [to, setTo] = useState(() => new Date().toISOString().split('T')[0]);

  const { data, isLoading, isError, error } = useQuery<SalesReport>({
    queryKey: ['sales-report', shopId, period, from, to],
    queryFn: () => api.get('/reporting/sales', { params: { period, from, to } }).then(r => r.data.data),
    enabled: !!shopId,
    retry: false,
  });

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Sales Report</h1>
          <p className="page-subtitle">Revenue & transaction analytics</p>
        </div>
        <button className="btn-secondary"><Download size={14} className="mr-1.5" /> Export</button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 bg-stone-100 rounded-lg p-1">
          {(['day', 'week', 'month'] as const).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors capitalize ${
                period === p ? 'bg-white shadow-sm text-stone-900 font-medium' : 'text-stone-500 hover:text-stone-700'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="input w-auto text-xs" />
        <span className="text-stone-400 text-xs">to</span>
        <input type="date" value={to} onChange={e => setTo(e.target.value)} className="input w-auto text-xs" />
      </div>

      {isError && (
        <div className="card p-4 border-red-200 bg-red-50 text-red-700 text-sm">
          {(error as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to load report data. Check that your subscription is active.'}
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="card p-5 animate-pulse h-24 bg-stone-100" />)}
        </div>
      ) : !isError && (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Revenue', value: fmt(data?.summary.revenue ?? 0) },
              { label: 'Transactions', value: String(data?.summary.transactions ?? 0) },
              { label: 'Avg. Ticket', value: fmt(data?.summary.avgTicket ?? 0) },
              { label: 'Gross Profit', value: fmt(data?.summary.grossProfit ?? 0) },
            ].map(s => (
              <div key={s.label} className="card p-5">
                <p className="stat-value">{s.value}</p>
                <p className="stat-label">{s.label}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Revenue chart */}
            <div className="card p-5 lg:col-span-2">
              <h3 className="text-sm font-semibold text-stone-700 mb-4">Revenue by {period}</h3>
              {(data?.byDay ?? []).length === 0 ? (
                <div className="flex items-center justify-center h-[200px] text-stone-400 text-sm">No transactions in this period</div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={data?.byDay ?? []} barSize={16}>
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => new Date(v + 'T00:00:00Z').toLocaleDateString('en-TZ', { month: 'short', day: 'numeric' })} />
                    <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: number) => fmt(v)} />
                    <Bar dataKey="revenue" fill="#a66624" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Payment methods pie */}
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-stone-700 mb-4">Payment methods</h3>
              {(data?.byPaymentMethod ?? []).length === 0 ? (
                <div className="flex items-center justify-center h-[160px] text-stone-400 text-sm">No payment data</div>
              ) : (
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={data?.byPaymentMethod ?? []} dataKey="total" nameKey="method" cx="50%" cy="50%" outerRadius={65} label={({ method, percent }) => `${method} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                      {(data?.byPaymentMethod ?? []).map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => fmt(v)} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Top products */}
          <div className="card">
            <div className="px-5 py-4 border-b border-stone-100">
              <h3 className="text-sm font-semibold text-stone-700">Top products</h3>
            </div>
            <div className="table-wrapper">
              <table className="table">
                <thead><tr><th>#</th><th>Product</th><th>Revenue</th><th>Units sold</th></tr></thead>
                <tbody>
                  {(data?.topProducts ?? []).map((p, i) => (
                    <tr key={i}>
                      <td className="text-stone-400">{i + 1}</td>
                      <td className="font-medium">{p.name}</td>
                      <td>{fmt(p.revenue)}</td>
                      <td>{p.qty}</td>
                    </tr>
                  ))}
                  {!data?.topProducts?.length && <tr><td colSpan={4} className="text-center text-stone-400 py-6">No data</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
