import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X, Percent, Trash2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import api from '../../api/client';
import { useAuthStore } from '../../store/authStore';

interface TaxRule {
  id: string; name: string; rate: number; taxMode: string; isDefault: boolean;
  appliesToBusinessType?: string;
}
interface Form { name: string; rate: number; taxMode: 'INCLUSIVE' | 'EXCLUSIVE'; isDefault: boolean; }

export default function TaxRulesPage() {
  const { shopId } = useAuthStore();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');

  const { register, handleSubmit, reset } = useForm<Form>({
    defaultValues: { taxMode: 'EXCLUSIVE', isDefault: false },
  });

  const { data: rules = [], isLoading } = useQuery<TaxRule[]>({
    queryKey: ['tax-rules', shopId],
    queryFn: () => api.get('/pos/tax-rules').then(r => r.data.data),
    enabled: !!shopId,
  });

  const { mutate: create, isPending } = useMutation({
    mutationFn: (d: Form) => api.post('/pos/tax-rules', d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tax-rules'] }); setShowForm(false); reset(); },
    onError: (e: unknown) => setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed'),
  });

  const { mutate: remove } = useMutation({
    mutationFn: (id: string) => api.delete(`/pos/tax-rules/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tax-rules'] }),
  });

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="page-header">
        <div>
          <h1 className="page-title">Tax Rules</h1>
          <p className="page-subtitle">VAT and other tax configurations</p>
        </div>
        <button className="btn-primary" onClick={() => { setError(''); setShowForm(true); }}>
          <Plus size={14} className="mr-1.5" /> Add Rule
        </button>
      </div>

      <div className="card">
        {isLoading ? (
          <div className="p-8 text-center text-stone-400">Loading…</div>
        ) : (
          <div className="divide-y divide-stone-50">
            {rules.map(rule => (
              <div key={rule.id} className="flex items-center justify-between px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary-50 text-primary-600 rounded-lg">
                    <Percent size={14} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-stone-900">{rule.name}</p>
                      {rule.isDefault && <span className="badge badge-amber text-xs">Default</span>}
                    </div>
                    <p className="text-xs text-stone-400">{rule.rate}% · {rule.taxMode}</p>
                  </div>
                </div>
                {!rule.isDefault && (
                  <button
                    onClick={() => { if (confirm('Delete this tax rule?')) remove(rule.id); }}
                    className="p-1.5 rounded hover:bg-red-50 text-stone-400 hover:text-red-500"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            ))}
            {rules.length === 0 && (
              <div className="px-5 py-8 text-center text-stone-400">No tax rules configured</div>
            )}
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card p-6 w-full max-w-sm">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold text-stone-900">New Tax Rule</h3>
              <button onClick={() => setShowForm(false)} className="text-stone-400 hover:text-stone-700"><X size={18} /></button>
            </div>
            {error && <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">{error}</div>}
            <form onSubmit={handleSubmit(d => create(d))} className="space-y-4">
              <div>
                <label className="label">Rule Name</label>
                <input {...register('name', { required: true })} className="input" placeholder="e.g. VAT 16%" />
              </div>
              <div>
                <label className="label">Rate (%)</label>
                <input {...register('rate', { required: true, valueAsNumber: true, min: 0, max: 100 })} type="number" step="0.1" className="input" placeholder="16" />
              </div>
              <div>
                <label className="label">Tax Mode</label>
                <select {...register('taxMode')} className="select">
                  <option value="EXCLUSIVE">Exclusive (added on top)</option>
                  <option value="INCLUSIVE">Inclusive (included in price)</option>
                  <option value="EXEMPT">Exempt</option>
                  <option value="ZERO_RATED">Zero-rated</option>
                </select>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input {...register('isDefault')} type="checkbox" className="rounded" />
                <span className="text-xs text-stone-600">Set as default rule</span>
              </label>
              <div className="flex gap-3 pt-2">
                <button type="button" className="btn-secondary flex-1" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" disabled={isPending} className="btn-primary flex-1">{isPending ? 'Saving…' : 'Add Rule'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
