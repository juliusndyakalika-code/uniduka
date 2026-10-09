import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertOctagon, Check, ChevronDown, Search, Trash2 } from 'lucide-react';
import api from '../../api/client';

/**
 * What is going wrong on the platform, without needing Railway access.
 *
 * Each row is one kind of error with how often it happened and when it was
 * first and last seen, so a failure that repeated four hundred times reads as
 * one problem rather than burying everything else. Messages were masked
 * before they were stored, so phone numbers and tokens never reach this page.
 */

interface ErrorRow {
  id: string; message: string; stack: string | null;
  count: number; firstAt: string; lastAt: string;
}
interface ErrorsResponse {
  items: ErrorRow[]; total: number;
  stats: { groups24h: number; occurrences24h: number };
  retention: { days: number; choices: number[] };
}

const RANGES = [['24h', 'Last 24 hours'], ['7d', 'Last 7 days'], ['30d', 'Last 30 days'], ['all', 'Everything kept']] as const;

const ago = (iso: string) => {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};
const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function PlatformErrors() {
  const qc = useQueryClient();
  const [range, setRange] = useState<string>('7d');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const { data, isLoading } = useQuery<{ data: ErrorsResponse }>({
    queryKey: ['platform-errors', range, q],
    queryFn: () => api.get('/platform/errors', { params: { range, q: q || undefined } }).then(r => r.data),
    refetchInterval: 30_000,
  });
  const d = data?.data;

  const retention = useMutation({
    mutationFn: (days: number) => api.patch('/platform/errors/retention', { days }).then(r => r.data),
    onSuccess: () => {
      setSaved(true); setTimeout(() => setSaved(false), 2500);
      qc.invalidateQueries({ queryKey: ['platform-errors'] });
    },
  });

  const dismiss = useMutation({
    mutationFn: (id: string) => api.delete(`/platform/errors/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platform-errors'] }),
  });

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div className="flex items-center gap-2">
          <AlertOctagon size={20} className="text-red-600" />
          <div>
            <h1 className="page-title">Errors</h1>
            <p className="page-subtitle">Grouped · personal data masked · refreshes every 30s</p>
          </div>
        </div>
      </div>

      {/* The headline, then the policy that decides how far back it goes. */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card p-4">
          <p className="text-[11px] uppercase tracking-widest text-stone-400">Kinds of error, 24h</p>
          <p className={`mt-1 text-2xl font-bold tabular-nums ${d?.stats.groups24h ? 'text-red-700' : 'text-emerald-700'}`}>
            {d?.stats.groups24h ?? '·'}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-[11px] uppercase tracking-widest text-stone-400">Occurrences, 24h</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-stone-900">{d?.stats.occurrences24h ?? '·'}</p>
        </div>
        <div className="card p-4">
          <label htmlFor="retention" className="text-[11px] uppercase tracking-widest text-stone-400">Keep errors for</label>
          <div className="mt-1 flex items-center gap-2">
            <select
              id="retention"
              className="input py-1.5 text-sm"
              value={d?.retention.days ?? 30}
              disabled={!d || retention.isPending}
              onChange={e => retention.mutate(Number(e.target.value))}
            >
              {(d?.retention.choices ?? [7, 14, 30, 60, 90]).map(n => <option key={n} value={n}>{n} days</option>)}
            </select>
            {saved && <Check size={16} className="shrink-0 text-emerald-600" />}
          </div>
          <p className="mt-1 text-[11px] text-stone-400">Older errors are deleted. Applies immediately.</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input className="input pl-8 text-sm" placeholder="Filter messages…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-1">
          {RANGES.map(([v, label]) => (
            <button key={v} onClick={() => setRange(v)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                range === v ? 'bg-stone-900 text-white' : 'text-stone-500 hover:bg-stone-100'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="card overflow-hidden">
        {isLoading ? (
          <p className="p-6 text-sm text-stone-400">Loading…</p>
        ) : !d?.items.length ? (
          <div className="flex items-center gap-2 p-6 text-sm text-emerald-700">
            <Check size={16} /> No errors {q ? 'match that filter' : 'in this period'}.
          </div>
        ) : (
          <ul className="divide-y divide-stone-100">
            {d.items.map(e => (
              <li key={e.id} className="px-4 py-3">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 shrink-0 rounded-md bg-red-50 px-2 py-0.5 text-[11px] font-bold tabular-nums text-red-700">
                    ×{e.count}
                  </span>
                  <button className="min-w-0 flex-1 text-left" onClick={() => setOpen(open === e.id ? null : e.id)}>
                    <p className="break-words font-mono text-[12.5px] leading-snug text-stone-800">{e.message}</p>
                    <p className="mt-1 text-[11px] text-stone-400">
                      last {ago(e.lastAt)} · first {when(e.firstAt)}
                      {e.stack && <ChevronDown size={11} className={`ml-1 inline transition-transform ${open === e.id ? 'rotate-180' : ''}`} />}
                    </p>
                  </button>
                  <button
                    onClick={() => dismiss.mutate(e.id)}
                    title="Clear. If it happens again it will come back."
                    aria-label="Clear this error"
                    className="shrink-0 rounded-md p-1.5 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                {open === e.id && e.stack && (
                  <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-stone-50 p-3 font-mono text-[11px] leading-relaxed text-stone-600">
                    {e.stack}
                  </pre>
                )}
              </li>
            ))}
          </ul>
        )}
        {d && d.total > d.items.length && (
          <p className="border-t border-stone-100 px-4 py-2 text-[11px] text-stone-400">
            Showing the {d.items.length} most recent of {d.total}. Narrow the period or filter to see the rest.
          </p>
        )}
      </div>
    </div>
  );
}
