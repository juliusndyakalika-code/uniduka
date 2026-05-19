import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Star, Plus, Edit2, X } from 'lucide-react';
import { useForm } from 'react-hook-form';
import api from '../../api/client';
import { useAuthStore } from '../../store/authStore';

interface LoyaltyProgram {
  id: string; name: string; pointsPerUnit: number; redeemRate: number;
  tiers: { name: string; minPoints: number; discountPct: number }[];
}
interface ProgramForm { name: string; pointsPerUnit: number; redeemRate: number; }

export default function LoyaltyPage() {
  const { shopId } = useAuthStore();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');

  const { register, handleSubmit, reset } = useForm<ProgramForm>();

  const { data: program, isLoading } = useQuery<LoyaltyProgram | null>({
    queryKey: ['loyalty', shopId],
    queryFn: () => api.get('/loyalty/program').then(r => r.data.data).catch(() => null),
    enabled: !!shopId,
  });

  const { mutate: save, isPending } = useMutation({
    mutationFn: (d: ProgramForm) => program
      ? api.patch(`/loyalty/program/${program.id}`, d)
      : api.post('/loyalty/program', d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['loyalty'] }); setShowForm(false); },
    onError: (e: unknown) => setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed'),
  });

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div>
          <h1 className="page-title">Loyalty Program</h1>
          <p className="page-subtitle">Reward your regular customers</p>
        </div>
        <button className="btn-primary" onClick={() => {
          if (program) reset({ name: program.name, pointsPerUnit: program.pointsPerUnit, redeemRate: program.redeemRate });
          setError('');
          setShowForm(true);
        }}>
          {program ? <><Edit2 size={14} className="mr-1.5" /> Edit</> : <><Plus size={14} className="mr-1.5" /> Setup</>}
        </button>
      </div>

      {isLoading ? (
        <div className="card p-8 text-center text-stone-400">Loading…</div>
      ) : !program ? (
        <div className="card p-10 text-center">
          <div className="w-14 h-14 bg-primary-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <Star size={24} className="text-primary-500" />
          </div>
          <h3 className="text-base font-bold text-stone-900 mb-2">No loyalty program</h3>
          <p className="text-sm text-stone-400 mb-6">Set up a loyalty program to reward repeat customers with points and tier discounts.</p>
          <button className="btn-primary mx-auto" onClick={() => { reset({}); setShowForm(true); }}>
            <Plus size={14} className="mr-1.5" /> Setup Loyalty Program
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-stone-700 mb-4">{program.name}</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-xs text-stone-500">Points per unit spent</span>
                <span className="text-sm font-bold text-stone-900">{program.pointsPerUnit}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-stone-500">Redeem rate (pts → TZS)</span>
                <span className="text-sm font-bold text-stone-900">1 pt = {program.redeemRate} TZS</span>
              </div>
            </div>
          </div>

          <div className="card p-5">
            <h3 className="text-sm font-semibold text-stone-700 mb-4">Loyalty Tiers</h3>
            {program.tiers.length > 0 ? (
              <div className="space-y-2">
                {program.tiers.map((t, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-stone-50 last:border-0">
                    <div className="flex items-center gap-2">
                      <Star size={12} className="text-primary-400" />
                      <span className="text-sm font-medium text-stone-800">{t.name}</span>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-stone-400">{t.minPoints}+ pts</p>
                      <p className="text-xs font-semibold text-primary-600">{t.discountPct}% off</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-stone-400">No tiers configured</p>
            )}
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card p-6 w-full max-w-sm">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold text-stone-900">Loyalty Program</h3>
              <button onClick={() => setShowForm(false)} className="text-stone-400 hover:text-stone-700"><X size={18} /></button>
            </div>
            {error && <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">{error}</div>}
            <form onSubmit={handleSubmit(d => save(d))} className="space-y-4">
              <div>
                <label className="label">Program Name</label>
                <input {...register('name', { required: true })} className="input" placeholder="e.g. Wanjiku Rewards" />
              </div>
              <div>
                <label className="label">Points per TZS 1000 spent</label>
                <input {...register('pointsPerUnit', { required: true, valueAsNumber: true })} type="number" min={1} className="input" placeholder="1" />
              </div>
              <div>
                <label className="label">1 Point = TZS</label>
                <input {...register('redeemRate', { required: true, valueAsNumber: true, min: 0.01 })} type="number" step="0.01" className="input" placeholder="0.50" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" className="btn-secondary flex-1" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" disabled={isPending} className="btn-primary flex-1">{isPending ? 'Saving…' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
