import { useQuery } from '@tanstack/react-query';
import {
  Activity, Database, Server, Clock, Users, ShoppingCart,
  Package, Store, RefreshCw, CheckCircle2, AlertTriangle, Zap,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../../api/client';

interface OnlineUser {
  id: string; fullName: string; role: string; lastSeenAt: string;
  ownerAccount?: { legalName: string } | null;
  shopAccess?: { shop: { tradingName: string } }[];
}
interface MonitorData {
  health:      { api: string; db: string; dbLatency: number };
  system:      { uptime: number; memUsed: number; memTotal: number; rss: number };
  activity:    { txLast24h: number; txLastHour: number; loginsLast24h: number; activeUsers: number; totalTx: number; activeShops: number; activeProducts: number };
  onlineUsers: OnlineUser[];
  hourly:      { hour: string; count: number; revenue: number }[];
  checkedAt:   string;
}

function uptimeStr(seconds: number) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${seconds % 60}s`;
}

function StatusBadge({ status, latency }: { status: string; latency?: number }) {
  const ok = status === 'ok';
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${ok ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
      {ok ? <CheckCircle2 size={11} /> : <AlertTriangle size={11} />}
      {ok ? 'Healthy' : 'Slow'}
      {latency !== undefined && <span className="ml-1 font-normal opacity-70">{latency}ms</span>}
    </span>
  );
}

function MetricCard({ icon: Icon, label, value, sub, color = 'text-stone-900' }: {
  icon: React.ElementType; label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <div className="card p-5">
      <div className="mb-3">
        <Icon size={16} className="text-stone-400" />
      </div>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="stat-label mt-0.5">{label}</p>
      {sub && <p className="text-xs text-stone-400 mt-1">{sub}</p>}
    </div>
  );
}

const fmt = (n: number) =>
  new Intl.NumberFormat('sw-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 0 }).format(n);

export default function PlatformMonitor() {
  const { data, isLoading, isError, dataUpdatedAt, refetch, isFetching } = useQuery<MonitorData>({
    queryKey: ['platform-monitor'],
    queryFn: () => api.get('/platform/monitor').then(r => r.data.data),
    refetchInterval: 30_000,
  });

  const lastUpdated = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString('en-TZ', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null;

  const hourlyChart = (() => {
    if (!data?.hourly) return [];
    const map = Object.fromEntries(data.hourly.map(h => [h.hour, h]));
    const now = new Date();
    return Array.from({ length: 24 }, (_, i) => {
      const d = new Date(now.getTime() - (23 - i) * 3_600_000);
      const key = d.toISOString().slice(0, 13);
      const label = `${String(d.getHours()).padStart(2, '0')}:00`;
      return { label, count: map[key]?.count ?? 0, revenue: map[key]?.revenue ?? 0 };
    });
  })();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Activity size={18} className="text-violet-600" /> System Monitor
          </h1>
          <p className="page-subtitle">
            {lastUpdated ? `Last checked ${lastUpdated} · auto-refreshes every 30s` : 'Loading…'}
          </p>
        </div>
        <button onClick={() => refetch()} disabled={isFetching} className="btn-secondary">
          <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {isError && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm flex items-center gap-2">
          <AlertTriangle size={15} /> Failed to load monitoring data. Check backend connectivity.
        </div>
      )}

      {/* Health Status */}
      <div className="card p-5">
        <h2 className="text-sm font-bold text-stone-900 mb-4">Service Health</h2>
        {isLoading ? (
          <div className="flex gap-6">
            {[...Array(2)].map((_, i) => <div key={i} className="h-8 w-32 bg-stone-100 rounded-lg animate-pulse" />)}
          </div>
        ) : (
          <div className="flex flex-wrap gap-6">
            <div className="flex items-center gap-2">
              <Zap size={14} className="text-stone-500" />
              <span className="text-sm text-stone-700 font-medium">API Server</span>
              <StatusBadge status={data?.health.api ?? 'unknown'} />
            </div>
            <div className="flex items-center gap-2">
              <Database size={14} className="text-stone-500" />
              <span className="text-sm text-stone-700 font-medium">Database</span>
              <StatusBadge status={data?.health.db ?? 'unknown'} latency={data?.health.dbLatency} />
            </div>
          </div>
        )}
      </div>

      {/* System Metrics */}
      <div>
        <h2 className="text-xs font-semibold text-stone-500 uppercase tracking-widest mb-3">System</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {isLoading ? (
            [...Array(4)].map((_, i) => <div key={i} className="card p-5 h-28 animate-pulse bg-stone-100" />)
          ) : (
            <>
              <MetricCard icon={Clock}    label="Server Uptime"  value={uptimeStr(data?.system.uptime ?? 0)} sub="Since last restart" />
              <MetricCard icon={Server}   label="Heap Used"      value={`${data?.system.memUsed ?? 0} MB`} sub={`of ${data?.system.memTotal ?? 0} MB heap`}
                color={((data?.system.memUsed ?? 0) / (data?.system.memTotal ?? 1)) > 0.85 ? 'text-amber-600' : 'text-stone-900'} />
              <MetricCard icon={Server}   label="RSS Memory"     value={`${data?.system.rss ?? 0} MB`} sub="Total process memory" />
              <MetricCard icon={Database} label="DB Latency"     value={`${data?.health.dbLatency ?? 0}ms`} sub="Last ping"
                color={(data?.health.dbLatency ?? 0) > 200 ? 'text-amber-600' : 'text-emerald-700'} />
            </>
          )}
        </div>
      </div>

      {/* Activity Metrics */}
      <div>
        <h2 className="text-xs font-semibold text-stone-500 uppercase tracking-widest mb-3">Activity</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {isLoading ? (
            [...Array(4)].map((_, i) => <div key={i} className="card p-5 h-28 animate-pulse bg-stone-100" />)
          ) : (
            <>
              <MetricCard icon={ShoppingCart} label="Transactions (24h)" value={data?.activity.txLast24h ?? 0}
                sub={`${data?.activity.txLastHour ?? 0} in last hour`} color="text-violet-700" />
              <MetricCard icon={Users}        label="Logins (24h)"       value={data?.activity.loginsLast24h ?? 0}
                sub={`${data?.activity.activeUsers ?? 0} active users total`} />
              <MetricCard icon={Store}        label="Active Shops"        value={data?.activity.activeShops ?? 0} sub="Currently active" />
              <MetricCard icon={Package}      label="Active Products"     value={data?.activity.activeProducts ?? 0}
                sub={`${(data?.activity.totalTx ?? 0).toLocaleString()} total transactions`} />
            </>
          )}
        </div>
      </div>

      {/* Who's Online */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
          </span>
          <h2 className="text-sm font-bold text-stone-900">Who's Online</h2>
          <span className="ml-1 text-xs bg-emerald-100 text-emerald-700 font-semibold px-2 py-0.5 rounded-full">
            {data?.onlineUsers?.length ?? 0} active
          </span>
          <span className="ml-auto text-[10px] text-stone-400">Active in last 5 minutes</span>
        </div>
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => <div key={i} className="h-10 bg-stone-100 rounded-lg animate-pulse" />)}
          </div>
        ) : !data?.onlineUsers?.length ? (
          <p className="text-sm text-stone-400 py-4 text-center">No users active in the last 5 minutes</p>
        ) : (
          <div className="divide-y divide-stone-100">
            {data.onlineUsers.map(u => {
              const shop = u.shopAccess?.[0]?.shop?.tradingName;
              const seenAgo = Math.round((Date.now() - new Date(u.lastSeenAt).getTime()) / 1000);
              const seenLabel = seenAgo < 60 ? `${seenAgo}s ago` : `${Math.round(seenAgo / 60)}m ago`;
              const roleColor: Record<string, string> = {
                ACCOUNT_OWNER:   'bg-violet-100 text-violet-700',
                CASHIER:         'bg-blue-100 text-blue-700',
                INVENTORY_STAFF: 'bg-amber-100 text-amber-700',
                MANAGER:         'bg-indigo-100 text-indigo-700',
                RECEPTIONIST:    'bg-pink-100 text-pink-700',
              };
              return (
                <div key={u.id} className="flex items-center gap-3 py-2.5">
                  <div className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center shrink-0">
                    <span className="text-sm font-bold text-stone-500">
                      {u.fullName.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-stone-900 truncate">{u.fullName}</p>
                    <p className="text-xs text-stone-400 truncate">
                      {u.ownerAccount?.legalName ?? ''}
                      {shop ? ` · ${shop}` : ''}
                    </p>
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${roleColor[u.role] ?? 'bg-stone-100 text-stone-600'}`}>
                    {u.role.replace(/_/g, ' ')}
                  </span>
                  <span className="text-[10px] text-stone-400 whitespace-nowrap">{seenLabel}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Hourly Transaction Chart */}
      <div className="card p-5">
        <h2 className="text-sm font-bold text-stone-900 mb-1">Transactions — Last 24 Hours</h2>
        <p className="text-xs text-stone-400 mb-4">Completed sales across all shops</p>
        {isLoading ? (
          <div className="h-48 bg-stone-100 rounded-lg animate-pulse" />
        ) : hourlyChart.every(h => h.count === 0) ? (
          <div className="h-48 flex items-center justify-center text-stone-400 text-sm">
            No transactions in the last 24 hours
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={hourlyChart} barSize={10}>
              <XAxis dataKey="label" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} interval={3} />
              <YAxis tick={{ fontSize: 9 }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip
                formatter={(v: number, name: string) =>
                  name === 'revenue' ? [fmt(v), 'Revenue'] : [v, 'Transactions']
                }
                labelFormatter={(l) => `${l}`}
              />
              <Bar dataKey="count" fill="#7c3aed" radius={[3, 3, 0, 0]} name="count" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Revenue chart */}
      {!isLoading && hourlyChart.some(h => h.revenue > 0) && (
        <div className="card p-5">
          <h2 className="text-sm font-bold text-stone-900 mb-1">Revenue — Last 24 Hours (TZS)</h2>
          <p className="text-xs text-stone-400 mb-4">Across all shops</p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={hourlyChart} barSize={10}>
              <XAxis dataKey="label" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} interval={3} />
              <YAxis tick={{ fontSize: 9 }} tickLine={false} axisLine={false}
                tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => fmt(v)} />
              <Bar dataKey="revenue" fill="#059669" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
