import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CreditCard, Check, Loader2, AlertTriangle } from 'lucide-react';
import api from '../../api/client';
import { PageLoader } from '../../components/ui/Loader';

/**
 * Editing what the tiers cost and allow.
 *
 * These were constants in the backend, so a price change was a deploy, and the
 * account page carried a stale copy that had drifted to six times the real
 * figure. Everything here is the single source both the billing flow and the
 * limit checks read.
 */

interface PlanRow {
  key: string;
  label: string;
  monthlyPrice: number | null;
  limits: { shops: number; branches: number; staff: number; registers: number };
  support: string;
  sortOrder: number;
  buyable: boolean;
}

const UNLIMITED_FROM = 999;
const money = (n: number) => `TZS ${n.toLocaleString()}`;

export default function PlatformPlans() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<PlanRow> & { limits?: PlanRow['limits'] }>({});
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ data: PlanRow[] }>({
    queryKey: ['platform-plans'],
    queryFn: () => api.get('/platform/plans').then(r => r.data),
  });
  const plans = data?.data ?? [];

  const save = useMutation({
    mutationFn: (p: { key: string; body: Record<string, unknown> }) =>
      api.patch(`/platform/plans/${p.key}`, p.body).then(r => r.data),
    onSuccess: (_r, vars) => {
      setEditing(null); setError('');
      setSaved(vars.key);
      setTimeout(() => setSaved(null), 3000);
      qc.invalidateQueries({ queryKey: ['platform-plans'] });
      // The owner-facing card reads the same endpoint, so it has to refetch.
      qc.invalidateQueries({ queryKey: ['billing-plans'] });
    },
    onError: (e: unknown) =>
      setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message
        || 'Could not save that change.'),
  });

  function startEdit(p: PlanRow) {
    setEditing(p.key);
    setError('');
    setDraft({ label: p.label, monthlyPrice: p.monthlyPrice, support: p.support, limits: { ...p.limits } });
  }

  function submit(key: string) {
    save.mutate({
      key,
      body: {
        label:        draft.label,
        // Empty means priced on application, which is what makes a tier
        // un-buyable. It must reach the server as null, not as zero.
        monthlyPrice: draft.monthlyPrice === null || draft.monthlyPrice === undefined
          ? null : Number(draft.monthlyPrice),
        support:   draft.support,
        shops:     draft.limits?.shops,
        branches:  draft.limits?.branches,
        staff:     draft.limits?.staff,
        registers: draft.limits?.registers,
      },
    });
  }

  if (isLoading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-stone-900">Subscription plans</h1>
        <p className="mt-1 text-sm text-stone-500">
          Prices and limits used by the payment flow, the plan comparison shown to owners,
          and the checks that stop an account exceeding its tier.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}

      <div className="space-y-4">
        {plans.map(p => (
          <div key={p.key} className="card p-5">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <CreditCard size={16} className="text-primary-600" />
              <span className="font-bold text-stone-900">{p.label}</span>
              <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-stone-500">
                {p.key}
              </span>
              {!p.buyable && (
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                  Not sold online
                </span>
              )}
              {saved === p.key && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                  <Check size={12} /> Saved
                </span>
              )}
              <button
                type="button"
                onClick={() => (editing === p.key ? setEditing(null) : startEdit(p))}
                className="btn-secondary ml-auto px-3 py-1.5 text-xs"
              >
                {editing === p.key ? 'Cancel' : 'Edit'}
              </button>
            </div>

            {editing === p.key ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label">Name shown to owners</label>
                  <input className="input" value={draft.label ?? ''}
                         onChange={e => setDraft(d => ({ ...d, label: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Price per month (TZS)</label>
                  <input className="input" inputMode="numeric"
                         placeholder="Leave empty for “on application”"
                         value={draft.monthlyPrice ?? ''}
                         onChange={e => setDraft(d => ({
                           ...d,
                           monthlyPrice: e.target.value === '' ? null : Number(e.target.value.replace(/\D/g, '')),
                         }))} />
                  <p className="mt-1 text-[11px] text-stone-400">
                    Empty means the tier is enquiry-only and cannot be bought in the app.
                  </p>
                </div>

                {(['shops', 'branches', 'staff', 'registers'] as const).map(field => (
                  <div key={field}>
                    <label className="label capitalize">{field}</label>
                    <input className="input" inputMode="numeric"
                           value={draft.limits?.[field] ?? ''}
                           onChange={e => setDraft(d => ({
                             ...d,
                             limits: { ...(d.limits as PlanRow['limits']), [field]: Number(e.target.value.replace(/\D/g, '')) },
                           }))} />
                    <p className="mt-1 text-[11px] text-stone-400">
                      {UNLIMITED_FROM} or more reads as unlimited.
                    </p>
                  </div>
                ))}

                <div className="sm:col-span-2">
                  <label className="label">Support promise</label>
                  <input className="input" value={draft.support ?? ''}
                         onChange={e => setDraft(d => ({ ...d, support: e.target.value }))} />
                </div>

                <div className="sm:col-span-2">
                  <button type="button" className="btn-primary px-5 py-2"
                          disabled={save.isPending} onClick={() => submit(p.key)}>
                    {save.isPending ? <Loader2 size={14} className="animate-spin" /> : 'Save plan'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
                <Fact label="Price" value={p.monthlyPrice === null ? 'On application' : p.monthlyPrice === 0 ? 'Free' : `${money(p.monthlyPrice)}/mo`} />
                <Fact label="Shops" value={limit(p.limits.shops)} />
                <Fact label="Branches" value={limit(p.limits.branches)} />
                <Fact label="Staff" value={limit(p.limits.staff)} />
                <Fact label="Registers" value={limit(p.limits.registers)} />
                <Fact label="Support" value={p.support} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const limit = (n: number) => (n >= UNLIMITED_FROM ? 'Unlimited' : String(n));

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-stone-400">{label}</p>
      <p className="font-medium text-stone-900">{value}</p>
    </div>
  );
}
