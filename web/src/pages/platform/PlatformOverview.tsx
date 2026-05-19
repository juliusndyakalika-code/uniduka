import { useQuery } from '@tanstack/react-query';
import { Building2, Store, Users, TrendingUp, Clock } from 'lucide-react';
import api from '../../api/client';

interface Metrics {
  accounts: { total: number; active: number };
  shops:    { total: number; active: number };
  users:    { total: number; active: number };
  planBreakdown: { plan: string; count: number }[];
  recentAccounts: { id: string; legalName: string; email: string; subscriptionPlan: string; isActive: boolean; createdAt: string }[];
}

const PLAN_COLORS: Record<string, string> = {
  STARTER: 'bg-stone-100 text-stone-700',
  GROWTH: 'bg-blue-100 text-blue-700',
  BUSINESS: 'bg-violet-100 text-violet-700',
  ENTERPRISE: 'bg-amber-100 text-amber-700',
};

function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: React.ElementType; label: string; value: number; sub: string; color: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${color}`}>
        <Icon size={18} />
      </div>
      <p className="text-2xl font-bold text-slate-900">{value.toLocaleString()}</p>
      <p className="text-sm font-medium text-slate-600 mt-0.5">{label}</p>
      <p className="text-xs text-slate-400 mt-1">{sub}</p>
    </div>
  );
}

export default function PlatformOverview() {
  const { data, isLoading } = useQuery<Metrics>({
    queryKey: ['platform-metrics'],
    queryFn: () => api.get('/platform/metrics').then(r => r.data.data),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-bold text-slate-900">Platform Overview</h1>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <div key={i} className="bg-white rounded-xl border border-slate-200 p-5 h-32 animate-pulse bg-slate-100" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Platform Overview</h1>
        <p className="text-sm text-slate-500 mt-0.5">Live snapshot of all tenants and usage</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard icon={Building2} label="Tenant Accounts" value={data?.accounts.total ?? 0}
          sub={`${data?.accounts.active ?? 0} active`} color="bg-violet-100 text-violet-600" />
        <StatCard icon={Store} label="Shops" value={data?.shops.total ?? 0}
          sub={`${data?.shops.active ?? 0} active`} color="bg-blue-100 text-blue-600" />
        <StatCard icon={Users} label="Users" value={data?.users.total ?? 0}
          sub={`${data?.users.active ?? 0} active`} color="bg-emerald-100 text-emerald-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Plan breakdown */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={16} className="text-violet-500" />
            <h3 className="text-sm font-bold text-slate-900">Plan Breakdown</h3>
          </div>
          <div className="space-y-3">
            {(data?.planBreakdown ?? []).map(p => (
              <div key={p.plan} className="flex items-center justify-between">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${PLAN_COLORS[p.plan] ?? 'bg-slate-100 text-slate-600'}`}>
                  {p.plan}
                </span>
                <div className="flex items-center gap-3 flex-1 mx-4">
                  <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                    <div
                      className="bg-violet-500 h-1.5 rounded-full"
                      style={{ width: `${Math.min(100, (p.count / (data?.accounts.total || 1)) * 100)}%` }}
                    />
                  </div>
                </div>
                <span className="text-sm font-bold text-slate-900 w-6 text-right">{p.count}</span>
              </div>
            ))}
            {!data?.planBreakdown?.length && <p className="text-xs text-slate-400">No accounts yet</p>}
          </div>
        </div>

        {/* Recent accounts */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Clock size={16} className="text-violet-500" />
            <h3 className="text-sm font-bold text-slate-900">Recently Joined</h3>
          </div>
          <div className="space-y-3">
            {(data?.recentAccounts ?? []).map(a => (
              <div key={a.id} className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{a.legalName}</p>
                  <p className="text-xs text-slate-400 truncate">{a.email}</p>
                </div>
                <div className="flex items-center gap-2 ml-3 shrink-0">
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${PLAN_COLORS[a.subscriptionPlan] ?? ''}`}>
                    {a.subscriptionPlan}
                  </span>
                  <span className={`w-1.5 h-1.5 rounded-full ${a.isActive ? 'bg-emerald-400' : 'bg-slate-300'}`} />
                </div>
              </div>
            ))}
            {!data?.recentAccounts?.length && <p className="text-xs text-slate-400">No accounts yet</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
