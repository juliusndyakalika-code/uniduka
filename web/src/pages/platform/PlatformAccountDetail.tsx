import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Store, Users, CheckCircle, XCircle, Calendar, CreditCard, AlertTriangle } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import api from '../../api/client';

interface AccountDetail {
  id: string; legalName: string; email: string; phone?: string;
  subscriptionPlan: string; isActive: boolean; subscriptionActive: boolean;
  subscriptionExpiresAt?: string | null; createdAt: string;
  shops: { id: string; tradingName: string; businessType: string; isActive: boolean; city?: string; country?: string; wizardCompleted: boolean; createdAt: string }[];
  users: { id: string; fullName: string; email: string; role: string; isActive: boolean; lastLoginAt?: string; createdAt: string }[];
}

const PLANS = ['STARTER', 'GROWTH', 'BUSINESS', 'ENTERPRISE'] as const;
const PLAN_COLORS: Record<string, string> = {
  STARTER: 'bg-stone-100 text-stone-700',
  GROWTH: 'bg-blue-100 text-blue-700',
  BUSINESS: 'bg-violet-100 text-violet-700',
  ENTERPRISE: 'bg-amber-100 text-amber-700',
};
const DURATIONS = [
  { label: '14 days',    value: 14 },
  { label: '30 days',    value: 30 },
  { label: '90 days',    value: 90 },
  { label: '180 days',   value: 180 },
  { label: '1 year',     value: 365 },
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

  if (isLoading) return <div className="text-slate-400 text-sm p-8">Loading…</div>;
  if (!account)  return <div className="text-red-500 text-sm p-8">Account not found</div>;

  const days = daysLeft(account.subscriptionExpiresAt);
  const isExpired = account.subscriptionActive && account.subscriptionExpiresAt && days === 0;
  const isNeverExpires = account.subscriptionActive && !account.subscriptionExpiresAt;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link to="/platform/accounts" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-700 mb-3">
          <ArrowLeft size={14} /> Back to Accounts
        </Link>
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-violet-100 text-violet-700 font-bold text-lg flex items-center justify-center">
              {account.legalName.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">{account.legalName}</h1>
              <p className="text-sm text-slate-400">{account.email}{account.phone && ` · ${account.phone}`}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {!account.subscriptionActive ? (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">
                {account.isActive ? 'Trial Ended / Inactive' : 'Suspended'}
              </span>
            ) : isExpired ? (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-red-100 text-red-700 flex items-center gap-1">
                <AlertTriangle size={11} /> Expired
              </span>
            ) : (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700">
                Active
              </span>
            )}
            <button
              onClick={() => { setActivatePlan(account.subscriptionPlan); setActivateDays(30); setShowActivate(true); }}
              className="text-sm px-4 py-2 rounded-lg font-semibold bg-violet-600 text-white hover:bg-violet-700 transition-colors"
            >
              {account.subscriptionActive ? 'Change Plan / Renew' : 'Activate'}
            </button>
            {account.subscriptionActive && (
              <button
                onClick={() => { if (confirm(`Suspend ${account.legalName}?`)) suspendAccount(); }}
                disabled={suspending}
                className="text-sm px-4 py-2 rounded-lg font-semibold bg-red-50 text-red-600 hover:bg-red-100 transition-colors disabled:opacity-60"
              >
                {suspending ? 'Suspending…' : 'Suspend'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Subscription info strip */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 grid grid-cols-2 sm:grid-cols-4 gap-5 text-sm">
        <div>
          <p className="text-xs text-slate-400 mb-1 flex items-center gap-1"><CreditCard size={11} /> Plan</p>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${PLAN_COLORS[account.subscriptionPlan] ?? 'bg-slate-100 text-slate-700'}`}>
            {account.subscriptionPlan}
          </span>
        </div>
        <div>
          <p className="text-xs text-slate-400 mb-1 flex items-center gap-1"><Calendar size={11} /> Expires</p>
          {account.subscriptionExpiresAt ? (
            <p className={`font-semibold text-slate-900 ${days !== null && days <= 7 ? 'text-red-600' : ''}`}>
              {format(new Date(account.subscriptionExpiresAt), 'MMM d, yyyy')}
              <span className="text-xs text-slate-400 ml-1.5">
                {days === 0 ? '(expired)' : `(${days}d left)`}
              </span>
            </p>
          ) : account.subscriptionActive ? (
            <p className="font-semibold text-emerald-600">Never expires</p>
          ) : (
            <p className="text-slate-400">—</p>
          )}
        </div>
        <div>
          <p className="text-xs text-slate-400 mb-1">Shops</p>
          <p className="font-bold text-slate-900">{account.shops.length}</p>
        </div>
        <div>
          <p className="text-xs text-slate-400 mb-1">Member since</p>
          <p className="font-bold text-slate-900">{format(new Date(account.createdAt), 'MMM d, yyyy')}</p>
        </div>
      </div>

      {/* Shops */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
          <Store size={15} className="text-violet-500" />
          <h3 className="text-sm font-bold text-slate-900">Shops ({account.shops.length})</h3>
        </div>
        {account.shops.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">No shops yet</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="text-left px-5 py-2.5 text-xs font-semibold text-slate-500">Shop</th>
                <th className="text-left px-5 py-2.5 text-xs font-semibold text-slate-500">Type</th>
                <th className="text-left px-5 py-2.5 text-xs font-semibold text-slate-500">Setup</th>
                <th className="text-left px-5 py-2.5 text-xs font-semibold text-slate-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {account.shops.map(s => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <p className="font-medium text-slate-900">{s.tradingName}</p>
                    {s.city && <p className="text-xs text-slate-400">{s.city}, {s.country}</p>}
                  </td>
                  <td className="px-5 py-3 text-xs text-slate-500">{s.businessType.replace(/_/g, ' ')}</td>
                  <td className="px-5 py-3">
                    {s.wizardCompleted
                      ? <span className="flex items-center gap-1 text-xs text-emerald-600"><CheckCircle size={12} /> Complete</span>
                      : <span className="flex items-center gap-1 text-xs text-amber-600"><XCircle size={12} /> Incomplete</span>}
                  </td>
                  <td className="px-5 py-3">
                    <button
                      onClick={() => toggleShop({ shopId: s.id, isActive: !s.isActive })}
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full transition-colors ${
                        s.isActive ? 'bg-emerald-100 text-emerald-700 hover:bg-red-100 hover:text-red-700'
                                   : 'bg-slate-100 text-slate-500 hover:bg-emerald-100 hover:text-emerald-700'}`}
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
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
          <Users size={15} className="text-violet-500" />
          <h3 className="text-sm font-bold text-slate-900">Users ({account.users.length})</h3>
        </div>
        {account.users.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">No users yet</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="text-left px-5 py-2.5 text-xs font-semibold text-slate-500">User</th>
                <th className="text-left px-5 py-2.5 text-xs font-semibold text-slate-500">Role</th>
                <th className="text-left px-5 py-2.5 text-xs font-semibold text-slate-500">Last Login</th>
                <th className="text-left px-5 py-2.5 text-xs font-semibold text-slate-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {account.users.map(u => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-slate-200 text-slate-600 text-xs font-bold flex items-center justify-center shrink-0">
                        {u.fullName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">{u.fullName}</p>
                        <p className="text-xs text-slate-400">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ROLE_COLORS[u.role] ?? 'bg-slate-100 text-slate-600'}`}>
                      {u.role.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-xs text-slate-400">
                    {u.lastLoginAt ? format(new Date(u.lastLoginAt), 'MMM d, yyyy') : 'Never'}
                  </td>
                  <td className="px-5 py-3">
                    <button
                      onClick={() => toggleUser({ userId: u.id, isActive: !u.isActive })}
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full transition-colors ${
                        u.isActive ? 'bg-emerald-100 text-emerald-700 hover:bg-red-100 hover:text-red-700'
                                   : 'bg-slate-100 text-slate-500 hover:bg-emerald-100 hover:text-emerald-700'}`}
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
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900 mb-1">
              {account.subscriptionActive ? 'Change Plan / Renew' : 'Activate Account'}
            </h3>
            <p className="text-xs text-slate-400 mb-5">
              {account.subscriptionActive
                ? 'Changing the plan or extending takes effect immediately.'
                : `Activating ${account.legalName} will allow them to log in and use the system.`}
            </p>

            {/* Plan selector */}
            <div className="mb-4">
              <label className="text-xs font-semibold text-slate-600 mb-2 block">Plan</label>
              <div className="grid grid-cols-2 gap-2">
                {PLANS.map(p => (
                  <button
                    key={p}
                    onClick={() => setActivatePlan(p)}
                    className={`px-3 py-2.5 rounded-lg border-2 text-xs font-semibold transition-all text-left ${
                      activatePlan === p
                        ? 'border-violet-600 bg-violet-50 text-violet-700'
                        : 'border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${activatePlan === p ? 'bg-violet-600' : 'bg-slate-300'}`} />
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Duration selector */}
            <div className="mb-6">
              <label className="text-xs font-semibold text-slate-600 mb-2 block">Duration</label>
              <div className="grid grid-cols-2 gap-2">
                {DURATIONS.map(d => (
                  <button
                    key={d.value}
                    onClick={() => setActivateDays(d.value)}
                    className={`px-3 py-2 rounded-lg border-2 text-xs font-medium transition-all ${
                      activateDays === d.value
                        ? 'border-violet-600 bg-violet-50 text-violet-700'
                        : 'border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
              {activateDays > 0 && (
                <p className="text-[10px] text-slate-400 mt-2">
                  Expires: {format(new Date(Date.now() + activateDays * 86_400_000), 'MMM d, yyyy')}
                </p>
              )}
            </div>

            <div className="flex gap-3">
              <button className="flex-1 px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50"
                onClick={() => setShowActivate(false)}>
                Cancel
              </button>
              <button
                onClick={() => activateAccount()}
                disabled={activating}
                className="flex-1 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 disabled:opacity-60"
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
