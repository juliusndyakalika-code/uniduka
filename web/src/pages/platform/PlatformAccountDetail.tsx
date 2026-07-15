import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Store, Users, CheckCircle, XCircle, Calendar, CreditCard, AlertTriangle } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import api from '../../api/client';
import { useDataTable, SortableTh } from '../../components/ui/DataTable';

interface AccountDetail {
  id: string; legalName: string; email: string; phone?: string;
  subscriptionPlan: string; isActive: boolean; subscriptionActive: boolean;
  subscriptionExpiresAt?: string | null; createdAt: string;
  shops: { id: string; tradingName: string; businessType: string; isActive: boolean; city?: string; country?: string; wizardCompleted: boolean; createdAt: string }[];
  users: { id: string; fullName: string; email: string; role: string; isActive: boolean; lastLoginAt?: string; createdAt: string }[];
}

const PLANS = ['STARTER', 'GROWTH', 'BUSINESS', 'ENTERPRISE'] as const;
const PLAN_COLORS: Record<string, string> = {
  STARTER: 'badge-stone', GROWTH: 'badge-blue', BUSINESS: 'badge-purple', ENTERPRISE: 'badge-amber',
};
const DURATIONS = [
  { label: '14 days',       value: 14 },
  { label: '30 days',       value: 30 },
  { label: '90 days',       value: 90 },
  { label: '180 days',      value: 180 },
  { label: '1 year',        value: 365 },
  { label: 'Never expires', value: 0 },
];
const ROLE_COLORS: Record<string, string> = {
  ACCOUNT_OWNER:   'bg-amber-100 text-amber-700',
  CASHIER:         'bg-green-100 text-green-700',
  INVENTORY_STAFF: 'bg-blue-100 text-blue-700',
};

function daysLeft(expiresAt?: string | null): number | null {
  if (!expiresAt) return null;
  return Math.max(0, differenceInDays(new Date(expiresAt), new Date()));
}

export default function PlatformAccountDetail() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [showActivate, setShowActivate] = useState(false);
  const [activatePlan, setActivatePlan] = useState<string>('STARTER');
  const [activateDays, setActivateDays] = useState<number>(30);

  const { data: account, isLoading } = useQuery<AccountDetail>({
    queryKey: ['platform-account', id],
    queryFn: () => api.get(`/platform/accounts/${id}`).then(r => r.data.data),
    enabled: !!id,
  });

  const { mutate: activateAccount, isPending: activating } = useMutation({
    mutationFn: () => api.post(`/platform/accounts/${id}/activate`, { plan: activatePlan, durationDays: activateDays }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['platform-account', id] }); setShowActivate(false); },
  });

  const { mutate: suspendAccount, isPending: suspending } = useMutation({
    mutationFn: () => api.post(`/platform/accounts/${id}/suspend`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platform-account', id] }),
  });

  const { mutate: toggleShop } = useMutation({
    mutationFn: ({ shopId, isActive }: { shopId: string; isActive: boolean }) =>
      api.patch(`/platform/shops/${shopId}`, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platform-account', id] }),
  });

  const { mutate: toggleUser } = useMutation({
    mutationFn: ({ userId, isActive }: { userId: string; isActive: boolean }) =>
      api.patch(`/platform/users/${userId}`, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platform-account', id] }),
  });

  const shopsTable = useDataTable(account?.shops ?? [], {
    sortValues: {
      shop: s => s.tradingName, type: s => s.businessType,
      setup: s => (s.wizardCompleted ? 0 : 1), status: s => (s.isActive ? 0 : 1),
    },
    initialSort: { field: 'shop', dir: 'asc' },
    pageSize: 1000,
  });
  const usersTable = useDataTable(account?.users ?? [], {
    sortValues: {
      user: u => u.fullName, role: u => u.role,
      lastLogin: u => (u.lastLoginAt ? new Date(u.lastLoginAt) : null), status: u => (u.isActive ? 0 : 1),
    },
    initialSort: { field: 'user', dir: 'asc' },
    pageSize: 1000,
  });

  if (isLoading) return <div className="text-stone-400 text-sm p-8">Loading…</div>;
  if (!account)  return <div className="text-red-500 text-sm p-8">Account not found</div>;

  const days = daysLeft(account.subscriptionExpiresAt);
  const isExpired = account.subscriptionActive && account.subscriptionExpiresAt && days === 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link to="/platform/accounts" className="inline-flex items-center gap-1.5 text-sm text-stone-400 hover:text-stone-700 mb-3">
          <ArrowLeft size={14} /> Back to Accounts
        </Link>
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-violet-100 text-violet-700 font-bold text-lg flex items-center justify-center">
              {account.legalName.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="page-title">{account.legalName}</h1>
              <p className="page-subtitle">{account.email}{account.phone && ` · ${account.phone}`}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {!account.subscriptionActive ? (
              <span className="badge badge-amber">
                {account.isActive ? 'Trial Ended / Inactive' : 'Suspended'}
              </span>
            ) : isExpired ? (
              <span className="badge badge-red">
                <AlertTriangle size={11} /> Expired
              </span>
            ) : (
              <span className="badge badge-green">Active</span>
            )}
            <button
              onClick={() => { setActivatePlan(account.subscriptionPlan); setActivateDays(30); setShowActivate(true); }}
              className="btn-primary"
            >
              {account.subscriptionActive ? 'Change Plan / Renew' : 'Activate'}
            </button>
            {account.subscriptionActive && (
              <button
                onClick={() => { if (confirm(`Suspend ${account.legalName}?`)) suspendAccount(); }}
                disabled={suspending}
                className="btn-danger"
              >
                {suspending ? 'Suspending…' : 'Suspend'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Subscription info strip */}
      <div className="card p-5 grid grid-cols-2 sm:grid-cols-4 gap-5">
        <div>
          <p className="text-xs text-stone-400 mb-1 flex items-center gap-1"><CreditCard size={11} /> Plan</p>
          <span className={`badge ${PLAN_COLORS[account.subscriptionPlan] ?? 'badge-stone'}`}>
            {account.subscriptionPlan}
          </span>
        </div>
        <div>
          <p className="text-xs text-stone-400 mb-1 flex items-center gap-1"><Calendar size={11} /> Expires</p>
          {account.subscriptionExpiresAt ? (
            <p className={`text-sm font-semibold ${days !== null && days <= 7 ? 'text-red-600' : 'text-stone-900'}`}>
              {format(new Date(account.subscriptionExpiresAt), 'MMM d, yyyy')}
              <span className="text-xs text-stone-400 ml-1.5">
                {days === 0 ? '(expired)' : `(${days}d left)`}
              </span>
            </p>
          ) : account.subscriptionActive ? (
            <p className="text-sm font-semibold text-emerald-600">Never expires</p>
          ) : (
            <p className="text-stone-400">—</p>
          )}
        </div>
        <div>
          <p className="text-xs text-stone-400 mb-1">Shops</p>
          <p className="stat-value">{account.shops.length}</p>
        </div>
        <div>
          <p className="text-xs text-stone-400 mb-1">Member since</p>
          <p className="text-sm font-bold text-stone-900">{format(new Date(account.createdAt), 'MMM d, yyyy')}</p>
        </div>
      </div>

      {/* Shops */}
      <div className="table-wrapper">
        <div className="px-5 py-3 flex items-center gap-2" style={{ borderBottom: '1px solid rgba(163,177,198,0.15)' }}>
          <Store size={15} className="text-violet-500" />
          <h3 className="text-sm font-bold text-stone-900">Shops ({account.shops.length})</h3>
        </div>
        {account.shops.length === 0 ? (
          <p className="text-sm text-stone-400 text-center py-8">No shops yet</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <SortableTh field="shop"   sort={shopsTable.sort} onSort={shopsTable.toggleSort}>Shop</SortableTh>
                <SortableTh field="type"   sort={shopsTable.sort} onSort={shopsTable.toggleSort}>Type</SortableTh>
                <SortableTh field="setup"  sort={shopsTable.sort} onSort={shopsTable.toggleSort}>Setup</SortableTh>
                <SortableTh field="status" sort={shopsTable.sort} onSort={shopsTable.toggleSort}>Status</SortableTh>
              </tr>
            </thead>
            <tbody>
              {shopsTable.sorted.map(s => (
                <tr key={s.id}>
                  <td>
                    <p className="font-medium text-stone-900">{s.tradingName}</p>
                    {s.city && <p className="text-xs text-stone-400">{s.city}, {s.country}</p>}
                  </td>
                  <td className="text-xs text-stone-500">{s.businessType.replace(/_/g, ' ')}</td>
                  <td>
                    {s.wizardCompleted
                      ? <span className="flex items-center gap-1 text-xs text-emerald-600"><CheckCircle size={12} /> Complete</span>
                      : <span className="flex items-center gap-1 text-xs text-amber-600"><XCircle size={12} /> Incomplete</span>}
                  </td>
                  <td>
                    <button
                      onClick={() => toggleShop({ shopId: s.id, isActive: !s.isActive })}
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full transition-colors ${
                        s.isActive ? 'bg-emerald-100 text-emerald-700 hover:bg-red-100 hover:text-red-700'
                                   : 'bg-stone-100 text-stone-500 hover:bg-emerald-100 hover:text-emerald-700'}`}
                    >
                      {s.isActive ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Users */}
      <div className="table-wrapper">
        <div className="px-5 py-3 flex items-center gap-2" style={{ borderBottom: '1px solid rgba(163,177,198,0.15)' }}>
          <Users size={15} className="text-violet-500" />
          <h3 className="text-sm font-bold text-stone-900">Users ({account.users.length})</h3>
        </div>
        {account.users.length === 0 ? (
          <p className="text-sm text-stone-400 text-center py-8">No users yet</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <SortableTh field="user"      sort={usersTable.sort} onSort={usersTable.toggleSort}>User</SortableTh>
                <SortableTh field="role"      sort={usersTable.sort} onSort={usersTable.toggleSort}>Role</SortableTh>
                <SortableTh field="lastLogin" sort={usersTable.sort} onSort={usersTable.toggleSort}>Last Login</SortableTh>
                <SortableTh field="status"    sort={usersTable.sort} onSort={usersTable.toggleSort}>Status</SortableTh>
              </tr>
            </thead>
            <tbody>
              {usersTable.sorted.map(u => (
                <tr key={u.id}>
                  <td>
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-stone-100 text-stone-600 text-xs font-bold flex items-center justify-center shrink-0">
                        {u.fullName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-stone-900">{u.fullName}</p>
                        <p className="text-xs text-stone-400">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ROLE_COLORS[u.role] ?? 'bg-stone-100 text-stone-600'}`}>
                      {u.role.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="text-xs text-stone-400">
                    {u.lastLoginAt ? format(new Date(u.lastLoginAt), 'MMM d, yyyy') : 'Never'}
                  </td>
                  <td>
                    <button
                      onClick={() => toggleUser({ userId: u.id, isActive: !u.isActive })}
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full transition-colors ${
                        u.isActive ? 'bg-emerald-100 text-emerald-700 hover:bg-red-100 hover:text-red-700'
                                   : 'bg-stone-100 text-stone-500 hover:bg-emerald-100 hover:text-emerald-700'}`}
                    >
                      {u.isActive ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Activate / Change Plan modal */}
      {showActivate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-sm p-6">
            <h3 className="text-base font-bold text-stone-900 mb-1">
              {account.subscriptionActive ? 'Change Plan / Renew' : 'Activate Account'}
            </h3>
            <p className="text-xs text-stone-400 mb-5">
              {account.subscriptionActive
                ? 'Changing the plan or extending takes effect immediately.'
                : `Activating ${account.legalName} will allow them to log in and use the system.`}
            </p>

            <div className="mb-4">
              <label className="label">Plan</label>
              <div className="grid grid-cols-2 gap-2">
                {PLANS.map(p => (
                  <button
                    key={p}
                    onClick={() => setActivatePlan(p)}
                    className={`px-3 py-2.5 rounded-lg border-2 text-xs font-semibold transition-all text-left ${
                      activatePlan === p
                        ? 'border-violet-600 bg-violet-50 text-violet-700'
                        : 'border-stone-200 text-stone-600 hover:border-stone-300'
                    }`}
                  >
                    <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${activatePlan === p ? 'bg-violet-600' : 'bg-stone-300'}`} />
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-6">
              <label className="label">Duration</label>
              <div className="grid grid-cols-2 gap-2">
                {DURATIONS.map(d => (
                  <button
                    key={d.value}
                    onClick={() => setActivateDays(d.value)}
                    className={`px-3 py-2 rounded-lg border-2 text-xs font-medium transition-all ${
                      activateDays === d.value
                        ? 'border-violet-600 bg-violet-50 text-violet-700'
                        : 'border-stone-200 text-stone-600 hover:border-stone-300'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
              {activateDays > 0 && (
                <p className="text-[10px] text-stone-400 mt-2">
                  Expires: {format(new Date(Date.now() + activateDays * 86_400_000), 'MMM d, yyyy')}
                </p>
              )}
            </div>

            <div className="flex gap-3">
              <button className="btn-secondary flex-1" onClick={() => setShowActivate(false)}>
                Cancel
              </button>
              <button
                onClick={() => activateAccount()}
                disabled={activating}
                className="btn-primary flex-1"
              >
                {activating ? 'Saving…' : account.subscriptionActive ? 'Update' : 'Activate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
