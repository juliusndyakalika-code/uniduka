import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, CheckCircle, XCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../../api/client';

interface Shop {
  id: string; tradingName: string; businessType: string; isActive: boolean;
  city?: string; country?: string; currency: string; wizardCompleted: boolean; createdAt: string;
  ownerAccount: { id: string; legalName: string; email: string };
}

export default function PlatformShops() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery<Shop[]>({
    queryKey: ['platform-shops', search],
    queryFn: () => api.get('/platform/shops', { params: { search, limit: 100 } }).then(r => r.data.data),
  });

  const { mutate: toggleShop } = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch(`/platform/shops/${id}`, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platform-shops'] }),
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">All Shops</h1>
          <p className="text-sm text-slate-500 mt-0.5">{data?.length ?? 0} shops across all tenants</p>
        </div>
      </div>

      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or city…"
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
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Shop</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Tenant</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Type</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Setup</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(data ?? []).map(s => (
                <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-900">{s.tradingName}</p>
                    {s.city && <p className="text-xs text-slate-400">{s.city}, {s.country}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <Link to={`/platform/accounts/${s.ownerAccount.id}`} className="text-violet-600 hover:underline text-xs font-medium">
                      {s.ownerAccount.legalName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{s.businessType.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-3">
                    {s.wizardCompleted
                      ? <span className="flex items-center gap-1 text-xs text-emerald-600"><CheckCircle size={12} /> Done</span>
                      : <span className="flex items-center gap-1 text-xs text-amber-600"><XCircle size={12} /> Pending</span>
                    }
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleShop({ id: s.id, isActive: !s.isActive })}
                      className={`text-xs font-semibold px-2.5 py-1 rounded-full transition-colors ${
                        s.isActive ? 'bg-emerald-100 text-emerald-700 hover:bg-red-100 hover:text-red-700'
                                   : 'bg-slate-100 text-slate-500 hover:bg-emerald-100 hover:text-emerald-700'
                      }`}
                    >
                      {s.isActive ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">{new Date(s.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
              {!data?.length && (
                <tr><td colSpan={6} className="text-center text-slate-400 py-12">No shops found</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
