import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Building2, X, ChevronRight } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import api from '../../api/client';

interface Account {
  id: string; legalName: string; email: string; phone?: string;
  subscriptionPlan: string; subscriptionActive: boolean; isActive: boolean; createdAt: string;
  _count: { shops: number; users: number };
}
interface CreateForm {
  legalName: string; email: string; phone?: string;
  ownerName: string; ownerEmail: string; ownerPassword: string;
  subscriptionPlan: string;
}

const PLANS = ['STARTER', 'GROWTH', 'BUSINESS', 'ENTERPRISE'];
const PLAN_COLORS: Record<string, string> = {
  STARTER: 'badge-stone', GROWTH: 'badge-blue', BUSINESS: 'badge-amber', ENTERPRISE: 'badge-green',
};

export default function PlatformAccounts() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState('');

  const { register, handleSubmit, reset, formState: { errors } } = useForm<CreateForm>({
    defaultValues: { subscriptionPlan: 'STARTER' },
  });

  const { data, isLoading } = useQuery<Account[]>({
    queryKey: ['platform-accounts', search],
    queryFn: () => api.get('/platform/accounts', { params: { search, limit: 50 } }).then(r => r.data.data),
  });

  const { mutate: toggleActive } = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch(`/platform/accounts/${id}`, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platform-accounts'] }),
  });

  const { mutate: approveAccount } = useMutation({
    mutationFn: (id: string) => api.post(`/platform/accounts/${id}/approve`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platform-accounts'] }),
  });

  const { mutate: changePlan } = useMutation({
    mutationFn: ({ id, plan }: { id: string; plan: string }) =>
      api.patch(`/platform/accounts/${id}`, { subscriptionPlan: plan }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platform-accounts'] }),
  });

  const { mutate: create, isPending } = useMutation({
    mutationFn: (d: CreateForm) => api.post('/platform/accounts', d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-accounts'] });
      qc.invalidateQueries({ queryKey: ['platform-metrics'] });
      setShowCreate(false); reset();
    },
    onError: (e: unknown) => setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed'),
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Tenant Accounts</h1>
          <p className="text-sm text-slate-500 mt-0.5">{data?.length ?? 0} accounts</p>
        </div>
        <button onClick={() => { setError(''); setShowCreate(true); }}
          className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 text-white text-sm font-semibold rounded-lg hover:bg-violet-700 transition-colors">
          <Plus size={15} /> New Account
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or email…"
          className="w-full max-w-sm pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-violet-400"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="p-10 text-center text-slate-400 text-sm">Loading…</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Account</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Plan</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Shops / Users</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Joined</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(data ?? []).map(a => (
                <tr key={a.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-violet-100 text-violet-600 font-bold text-sm flex items-center justify-center shrink-0">
                        {a.legalName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900">{a.legalName}</p>
                        <p className="text-xs text-slate-400">{a.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={a.subscriptionPlan}
                      onChange={e => changePlan({ id: a.id, plan: e.target.value })}
                      className="text-xs border border-slate-200 rounded px-2 py-1 bg-white focus:outline-none focus:border-violet-400"
                    >
                      {PLANS.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-slate-700">{a._count.shops} shops</span>
                    <span className="text-slate-300 mx-1">·</span>
                    <span className="text-slate-700">{a._count.users} users</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {!a.subscriptionActive ? (
                        <button
                          onClick={() => approveAccount(a.id)}
                          className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 hover:bg-emerald-100 hover:text-emerald-700 transition-colors"
                        >
                          Pending
                        </button>
                      ) : (
                        <button
                          onClick={() => toggleActive({ id: a.id, isActive: !a.isActive })}
                          className={`text-xs font-semibold px-2.5 py-1 rounded-full transition-colors ${
                            a.isActive
                              ? 'bg-emerald-100 text-emerald-700 hover:bg-red-100 hover:text-red-700'
                              : 'bg-slate-100 text-slate-500 hover:bg-emerald-100 hover:text-emerald-700'
                          }`}
                        >
                          {a.isActive ? 'Active' : 'Suspended'}
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {new Date(a.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <Link to={`/platform/accounts/${a.id}`} className="text-slate-400 hover:text-violet-600 transition-colors">
                      <ChevronRight size={16} />
                    </Link>
                  </td>
                </tr>
              ))}
              {!data?.length && (
                <tr><td colSpan={6} className="text-center text-slate-400 py-12">No accounts yet</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Create account modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-base font-bold text-slate-900">Create Tenant Account</h3>
                <p className="text-xs text-slate-400 mt-0.5">Creates the account and the owner user</p>
              </div>
              <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
            </div>
            {error && <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">{error}</div>}
            <form onSubmit={handleSubmit(d => create(d))} className="space-y-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Business Info</p>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Legal Business Name</label>
                <input {...register('legalName', { required: true })} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-400" placeholder="Acme Ltd" />
                {errors.legalName && <p className="text-xs text-red-500 mt-0.5">Required</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Business Email</label>
                  <input {...register('email', { required: true })} type="email" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-400" placeholder="info@acme.com" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Phone</label>
                  <input {...register('phone')} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-400" placeholder="+255 7XX XXX XXX" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Subscription Plan</label>
                <select {...register('subscriptionPlan')} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-400">
                  {PLANS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>

              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider pt-1">Owner User</p>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Full Name</label>
                <input {...register('ownerName', { required: true })} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-400" placeholder="Jane Doe" />
                {errors.ownerName && <p className="text-xs text-red-500 mt-0.5">Required</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Login Email</label>
                  <input {...register('ownerEmail', { required: true })} type="email" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-400" placeholder="jane@acme.com" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Temp Password</label>
                  <input {...register('ownerPassword', { required: true, minLength: 8 })} type="password" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-400" placeholder="Min. 8 chars" />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowCreate(false)}
                  className="flex-1 px-4 py-2 text-sm border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={isPending}
                  className="flex-1 px-4 py-2 text-sm bg-violet-600 text-white font-semibold rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors">
                  {isPending ? 'Creating…' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
