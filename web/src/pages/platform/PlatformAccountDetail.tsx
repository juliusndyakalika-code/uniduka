import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Store, Users, CheckCircle, XCircle } from 'lucide-react';
import api from '../../api/client';

interface AccountDetail {
  id: string; legalName: string; email: string; phone?: string;
  subscriptionPlan: string; isActive: boolean; subscriptionActive: boolean; createdAt: string;
  shops: { id: string; tradingName: string; businessType: string; isActive: boolean; city?: string; country?: string; wizardCompleted: boolean; createdAt: string }[];
  users: { id: string; fullName: string; email: string; role: string; isActive: boolean; lastLoginAt?: string; createdAt: string }[];
}

const ROLE_COLORS: Record<string, string> = {
  ACCOUNT_OWNER:   'bg-amber-100 text-amber-700',
  CASHIER:         'bg-green-100 text-green-700',
  INVENTORY_STAFF: 'bg-blue-100 text-blue-700',
};

export default function PlatformAccountDetail() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();

  const { data: account, isLoading } = useQuery<AccountDetail>({
    queryKey: ['platform-account', id],
    queryFn: () => api.get(`/platform/accounts/${id}`).then(r => r.data.data),
    enabled: !!id,
  });

  const { mutate: toggleAccount } = useMutation({
    mutationFn: (isActive: boolean) => api.patch(`/platform/accounts/${id}`, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platform-account', id] }),
  });

  const { mutate: approveAccount, isPending: approving } = useMutation({
    mutationFn: () => api.post(`/platform/accounts/${id}/approve`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platform-account', id] }),
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

  if (isLoading) return <div className="text-slate-400 text-sm">Loading…</div>;
  if (!account)  return <div className="text-red-500 text-sm">Account not found</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link to="/platform/accounts" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-700 mb-3">
          <ArrowLeft size={14} /> Back to Accounts
        </Link>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-violet-100 text-violet-700 font-bold text-lg flex items-center justify-center">
              {account.legalName.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">{account.legalName}</h1>
              <p className="text-sm text-slate-400">{account.email} {account.phone && `· ${account.phone}`}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${account.subscriptionActive ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
              {account.subscriptionActive ? 'Subscription Active' : 'Pending Approval'}
            </span>
            {!account.subscriptionActive ? (
              <button
                onClick={() => approveAccount()}
                disabled={approving}
                className="text-sm px-4 py-2 rounded-lg font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-60"
              >
                {approving ? 'Approving…' : 'Approve'}
              </button>
            ) : (
              <button
                onClick={() => suspendAccount()}
                disabled={suspending}
                className="text-sm px-4 py-2 rounded-lg font-semibold bg-red-50 text-red-600 hover:bg-red-100 transition-colors disabled:opacity-60"
              >
                {suspending ? 'Suspending…' : 'Suspend Subscription'}
              </button>
            )}
            <button
              onClick={() => toggleAccount(!account.isActive)}
              className={`text-sm px-4 py-2 rounded-lg font-semibold transition-colors ${
                account.isActive
                  ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
              }`}
            >
              {account.isActive ? 'Deactivate' : 'Reactivate'}
            </button>
          </div>
        </div>
      </div>

      {/* Info strip */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-8 text-sm">
        <div><p className="text-xs text-slate-400">Plan</p><p className="font-bold text-slate-900">{account.subscriptionPlan}</p></div>
        <div><p className="text-xs text-slate-400">Shops</p><p className="font-bold text-slate-900">{account.shops.length}</p></div>
        <div><p className="text-xs text-slate-400">Users</p><p className="font-bold text-slate-900">{account.users.length}</p></div>
        <div><p className="text-xs text-slate-400">Member since</p><p className="font-bold text-slate-900">{new Date(account.createdAt).toLocaleDateString()}</p></div>
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
                      : <span className="flex items-center gap-1 text-xs text-amber-600"><XCircle size={12} /> Incomplete</span>
                    }
                  </td>
                  <td className="px-5 py-3">
                    <button
                      onClick={() => toggleShop({ shopId: s.id, isActive: !s.isActive })}
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full transition-colors ${
                        s.isActive ? 'bg-emerald-100 text-emerald-700 hover:bg-red-100 hover:text-red-700'
                                   : 'bg-slate-100 text-slate-500 hover:bg-emerald-100 hover:text-emerald-700'
                      }`}
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
                    {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : 'Never'}
                  </td>
                  <td className="px-5 py-3">
                    <button
                      onClick={() => toggleUser({ userId: u.id, isActive: !u.isActive })}
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full transition-colors ${
                        u.isActive ? 'bg-emerald-100 text-emerald-700 hover:bg-red-100 hover:text-red-700'
                                   : 'bg-slate-100 text-slate-500 hover:bg-emerald-100 hover:text-emerald-700'
                      }`}
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
    </div>
  );
}
