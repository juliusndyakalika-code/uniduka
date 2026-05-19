import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Store, MapPin, X, ArrowRight } from 'lucide-react';
import { useForm } from 'react-hook-form';
import api from '../../api/client';
import { useAuthStore } from '../../store/authStore';

interface Branch {
  id: string; tradingName: string; city?: string; country?: string;
  businessType: string; branchMode: string; isActive: boolean;
}
interface Form { tradingName: string; city?: string; country?: string; branchMode: string; }

const BRANCH_MODES = [
  { key: 'INDEPENDENT', label: 'Independent', desc: 'Separate inventory & products' },
  { key: 'SHARED_CATALOGUE', label: 'Shared Catalogue', desc: 'Same products, separate stock' },
  { key: 'SHARED_INVENTORY', label: 'Shared Inventory', desc: 'Fully shared stock across branches' },
];

export default function BranchesPage() {
  const { shopId } = useAuthStore();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');

  const { register, handleSubmit, reset } = useForm<Form>({ defaultValues: { branchMode: 'INDEPENDENT' } });

  const { data: branches = [], isLoading } = useQuery<Branch[]>({
    queryKey: ['branches', shopId],
    queryFn: () => api.get('/branches').then(r => r.data.data),
    enabled: !!shopId,
  });

  const { mutate: create, isPending } = useMutation({
    mutationFn: (d: Form) => api.post('/branches', { ...d, parentShopId: shopId }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['branches'] }); setShowForm(false); reset(); },
    onError: (e: unknown) => setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed'),
  });

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div>
          <h1 className="page-title">Branches</h1>
          <p className="page-subtitle">{branches.length} locations</p>
        </div>
        <button className="btn-primary" onClick={() => { setError(''); setShowForm(true); }}>
          <Plus size={14} className="mr-1.5" /> New Branch
        </button>
      </div>

      {isLoading ? (
        <div className="card p-8 text-center text-stone-400">Loading…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {branches.map(b => (
            <div key={b.id} className="card p-5 hover:border-primary-200 transition-colors">
              <div className="flex items-start justify-between mb-3">
                <div className="p-2 bg-primary-50 text-primary-600 rounded-lg">
                  <Store size={18} />
                </div>
                <span className={`badge ${b.isActive ? 'badge-green' : 'badge-stone'}`}>
                  {b.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
              <h3 className="text-sm font-bold text-stone-900 mb-1">{b.tradingName}</h3>
              {(b.city || b.country) && (
                <div className="flex items-center gap-1 text-xs text-stone-400 mb-2">
                  <MapPin size={11} />
                  <span>{[b.city, b.country].filter(Boolean).join(', ')}</span>
                </div>
              )}
              <div className="flex items-center gap-2 mt-3">
                <span className="badge badge-stone text-xs">{b.businessType.replace(/_/g, ' ')}</span>
                <span className="badge badge-blue text-xs">{b.branchMode.replace(/_/g, ' ')}</span>
              </div>
            </div>
          ))}
          {branches.length === 0 && (
            <div className="col-span-full card p-10 text-center">
              <Store size={32} className="mx-auto text-stone-300 mb-3" />
              <p className="text-sm text-stone-400 mb-4">No branches yet. Add locations to expand your business.</p>
              <button className="btn-primary mx-auto" onClick={() => setShowForm(true)}>
                <Plus size={14} className="mr-1.5" /> Add First Branch
              </button>
            </div>
          )}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card p-6 w-full max-w-sm">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold text-stone-900">New Branch</h3>
              <button onClick={() => setShowForm(false)} className="text-stone-400 hover:text-stone-700"><X size={18} /></button>
            </div>
            {error && <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">{error}</div>}
            <form onSubmit={handleSubmit(d => create(d))} className="space-y-4">
              <div>
                <label className="label">Branch Name</label>
                <input {...register('tradingName', { required: true })} className="input" placeholder="e.g. Westlands Branch" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">City</label>
                  <input {...register('city')} className="input" placeholder="Nairobi" />
                </div>
                <div>
                  <label className="label">Country</label>
                  <input {...register('country')} className="input" placeholder="TZ" />
                </div>
              </div>
              <div>
                <label className="label">Inventory Mode</label>
                <div className="space-y-2 mt-1">
                  {BRANCH_MODES.map(m => (
                    <label key={m.key} className="flex items-start gap-3 p-3 border border-stone-200 rounded-lg cursor-pointer hover:border-primary-300 has-[:checked]:border-primary-400 has-[:checked]:bg-primary-50 transition-colors">
                      <input {...register('branchMode')} type="radio" value={m.key} className="mt-0.5" />
                      <div>
                        <p className="text-xs font-semibold text-stone-900">{m.label}</p>
                        <p className="text-xs text-stone-400">{m.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" className="btn-secondary flex-1" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" disabled={isPending} className="btn-primary flex-1">{isPending ? 'Creating…' : 'Create Branch'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
