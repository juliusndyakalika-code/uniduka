import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, X, ChevronRight } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import { useDataTable, SortableTh, TablePagination } from '../../components/ui/DataTable';

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

  const acctTable = useDataTable(data ?? [], {
    sortValues: {
      account: a => a.legalName,
      plan: a => a.subscriptionPlan,
      counts: a => a._count.shops,
      status: a => (a.subscriptionActive ? (a.isActive ? 0 : 1) : 2),
      joined: a => new Date(a.createdAt),
    },
    initialSort: { field: 'joined', dir: 'desc' },
    pageSize: 25,
  });

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">Tenant Accounts</h1>
          <p className="page-subtitle">{data?.length ?? 0} accounts</p>
        </div>
        <button onClick={() => { setError(''); setShowCreate(true); }} className="btn-primary">
          <Plus size={15} /> New Account
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or email…"
          className="input pl-8"
        />
      </div>

      {/* Table */}
      <div className="table-wrapper">
        {isLoading ? (
          <div className="p-10 text-center text-stone-400 text-sm">Loading…</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <SortableTh field="account" sort={acctTable.sort} onSort={acctTable.toggleSort}>Account</SortableTh>
                <SortableTh field="plan"    sort={acctTable.sort} onSort={acctTable.toggleSort}>Plan</SortableTh>
                <SortableTh field="counts"  sort={acctTable.sort} onSort={acctTable.toggleSort}>Shops / Users</SortableTh>
                <SortableTh field="status"  sort={acctTable.sort} onSort={acctTable.toggleSort}>Status</SortableTh>
                <SortableTh field="joined"  sort={acctTable.sort} onSort={acctTable.toggleSort}>Joined</SortableTh>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {acctTable.view.map(a => (
                <tr key={a.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-violet-100 text-violet-600 font-bold text-sm flex items-center justify-center shrink-0">
                        {a.legalName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold text-stone-900">{a.legalName}</p>
                        <p className="text-xs text-stone-400">{a.email}</p>
                      </div>
                    </div>
                  </td>
                  <td>
                    <select
                      value={a.subscriptionPlan}
                      onChange={e => changePlan({ id: a.id, plan: e.target.value })}
                      className="text-xs border border-stone-200 rounded px-2 py-1 bg-[#E8EBF0] focus:outline-none"
                    >
                      {PLANS.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </td>
                  <td>
                    <span className="text-stone-700">{a._count.shops} shops</span>
                    <span className="text-stone-300 mx-1">·</span>
                    <span className="text-stone-700">{a._count.users} users</span>
                  </td>
                  <td>
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
                              : 'bg-stone-100 text-stone-500 hover:bg-emerald-100 hover:text-emerald-700'
                          }`}
                        >
                          {a.isActive ? 'Active' : 'Suspended'}
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="text-xs text-stone-400">
                    {new Date(a.createdAt).toLocaleDateString()}
                  </td>
                  <td>
                    <Link to={`/platform/accounts/${a.id}`} className="text-stone-400 hover:text-violet-600 transition-colors">
                      <ChevronRight size={16} />
                    </Link>
                  </td>
                </tr>
              ))}
              {acctTable.total === 0 && (
                <tr><td colSpan={6} className="text-center text-stone-400 py-12">No accounts yet</td></tr>
              )}
            </tbody>
          </table>
        )}
        {!isLoading && <TablePagination page={acctTable.page} pageCount={acctTable.pageCount} total={acctTable.total} pageSize={acctTable.pageSize} onPage={acctTable.setPage} onPageSize={acctTable.setPageSize} />}
      </div>

      {/* Create account modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-base font-bold text-stone-900">Create Tenant Account</h3>
                <p className="text-xs text-stone-400 mt-0.5">Creates the account and the owner user</p>
              </div>
              <button onClick={() => setShowCreate(false)} className="text-stone-400 hover:text-stone-700"><X size={18} /></button>
            </div>
            {error && <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">{error}</div>}
            <form onSubmit={handleSubmit(d => create(d))} className="space-y-4">
              <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Business Info</p>
              <div>
                <label className="label">Legal Business Name</label>
                <input {...register('legalName', { required: true })} className="input" placeholder="Acme Ltd" />
                {errors.legalName && <p className="text-xs text-red-500 mt-0.5">Required</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Business Email</label>
                  <input {...register('email', { required: true })} type="email" className="input" placeholder="info@acme.com" />
                </div>
                <div>
                  <label className="label">Phone</label>
                  <input {...register('phone')} className="input" placeholder="+255 7XX XXX XXX" />
                </div>
              </div>
              <div>
                <label className="label">Subscription Plan</label>
                <select {...register('subscriptionPlan')} className="select">
                  {PLANS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>

              <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider pt-1">Owner User</p>
              <div>
                <label className="label">Full Name</label>
                <input {...register('ownerName', { required: true })} className="input" placeholder="Jane Doe" />
                {errors.ownerName && <p className="text-xs text-red-500 mt-0.5">Required</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Login Email</label>
                  <input {...register('ownerEmail', { required: true })} type="email" className="input" placeholder="jane@acme.com" />
                </div>
                <div>
                  <label className="label">Temp Password</label>
                  <input {...register('ownerPassword', { required: true, minLength: 8 })} type="password" className="input" placeholder="Min. 8 chars" />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary flex-1">
                  Cancel
                </button>
                <button type="submit" disabled={isPending} className="btn-primary flex-1">
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
