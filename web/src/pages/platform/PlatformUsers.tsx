import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../../api/client';

interface PlatformUser {
  id: string; fullName: string; email: string; role: string; isActive: boolean;
  lastLoginAt?: string; createdAt: string;
  ownerAccount: { id: string; legalName: string };
}

const ROLE_COLORS: Record<string, string> = {
  ACCOUNT_OWNER:   'bg-amber-100 text-amber-700',
  CASHIER:         'bg-green-100 text-green-700',
  INVENTORY_STAFF: 'bg-blue-100 text-blue-700',
};

export default function PlatformUsers() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery<PlatformUser[]>({
    queryKey: ['platform-users', search],
    queryFn: () => api.get('/platform/users', { params: { search, limit: 100 } }).then(r => r.data.data),
  });

  const { mutate: toggleUser } = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch(`/platform/users/${id}`, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platform-users'] }),
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">All Users</h1>
        <p className="text-sm text-slate-500 mt-0.5">{data?.length ?? 0} users across all tenants</p>
      </div>

      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or email…"
          className="w-full max-w-sm pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-violet-400"
        />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="p-10 text-center text-slate-400 text-sm">Loading…</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">User</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Tenant</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Role</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Last Login</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(data ?? []).map(u => (
                <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-600 text-xs font-bold flex items-center justify-center shrink-0">
                        {u.fullName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900">{u.fullName}</p>
                        <p className="text-xs text-slate-400">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Link to={`/platform/accounts/${u.ownerAccount.id}`} className="text-violet-600 hover:underline text-xs font-medium">
                      {u.ownerAccount.legalName}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ROLE_COLORS[u.role] ?? 'bg-slate-100 text-slate-600'}`}>
                      {u.role.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : 'Never'}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleUser({ id: u.id, isActive: !u.isActive })}
                      className={`text-xs font-semibold px-2.5 py-1 rounded-full transition-colors ${
                        u.isActive ? 'bg-emerald-100 text-emerald-700 hover:bg-red-100 hover:text-red-700'
                                   : 'bg-slate-100 text-slate-500 hover:bg-emerald-100 hover:text-emerald-700'
                      }`}
                    >
                      {u.isActive ? 'Active' : 'Deactivate'}
                    </button>
                  </td>
                </tr>
              ))}
              {!data?.length && (
                <tr><td colSpan={5} className="text-center text-slate-400 py-12">No users found</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
