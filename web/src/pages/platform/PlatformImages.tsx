import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ImageIcon, Check, Ban, ExternalLink } from 'lucide-react';
import api from '../../api/client';

/**
 * Product photos waiting for a person.
 *
 * The built-in checker approves clean photos and rejects explicit ones on
 * its own. What lands here is the in-between: a lot of skin, swimwear,
 * underwear, or a photo the checker could not read. None of these are shown
 * to customers until someone decides.
 */

interface Item {
  id: string; status: 'PENDING' | 'APPROVED' | 'REJECTED'; reason: string | null;
  scores: Record<string, number> | null; createdAt: string; reviewedAt: string | null;
  product: string; shop: string; slug: string | null; thumb: string;
}
interface Resp { counts: Record<string, number>; items: Item[] }

const TABS = [['PENDING', 'Waiting'], ['REJECTED', 'Rejected'], ['APPROVED', 'Approved']] as const;
const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const pct = (n?: number) => `${Math.round((n ?? 0) * 100)}%`;

export default function PlatformImages() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<string>('PENDING');
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const { data, isLoading } = useQuery<{ data: Resp }>({
    queryKey: ['platform-images', tab],
    queryFn: () => api.get('/platform/images', { params: { status: tab } }).then(r => r.data),
    refetchInterval: 60_000,
  });
  const d = data?.data;

  const decide = useMutation({
    mutationFn: ({ id, approve, reason }: { id: string; approve: boolean; reason?: string }) =>
      api.post(`/platform/images/${id}/decision`, { approve, reason }),
    onSuccess: () => {
      setRejecting(null); setReason('');
      qc.invalidateQueries({ queryKey: ['platform-images'] });
    },
  });

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div className="flex items-center gap-2">
          <ImageIcon size={20} className="text-stone-700" />
          <div>
            <h1 className="page-title">Photo review</h1>
            <p className="page-subtitle">Online store photos the checker held back · hidden from customers until decided</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        {TABS.map(([v, label]) => (
          <button key={v} onClick={() => setTab(v)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === v ? 'bg-stone-900 text-white' : 'text-stone-500 hover:bg-stone-100'}`}>
            {label}{d?.counts[v] ? ` (${d.counts[v]})` : ''}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-sm text-stone-400">Loading…</p>
      ) : !d?.items.length ? (
        <div className="card flex items-center gap-2 p-6 text-sm text-emerald-700">
          <Check size={16} /> {tab === 'PENDING' ? 'Nothing waiting for review.' : 'Nothing here.'}
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {d.items.map(it => (
            <li key={it.id} className="card overflow-hidden">
              <img src={it.thumb} alt={`${it.product} from ${it.shop}`} className="aspect-square w-full bg-stone-100 object-contain" />
              <div className="space-y-2 p-4">
                <div>
                  <p className="truncate text-sm font-semibold text-stone-900">{it.product}</p>
                  <p className="flex items-center gap-1 truncate text-xs text-stone-500">
                    {it.shop}
                    {it.slug && (
                      <a href={`/s/${it.slug}`} target="_blank" rel="noreferrer" className="text-stone-400 hover:text-stone-700" aria-label="Open store">
                        <ExternalLink size={11} />
                      </a>
                    )}
                  </p>
                </div>
                {it.scores ? (
                  <p className="text-[11px] tabular-nums text-stone-500">
                    Explicit {pct((it.scores.porn ?? 0) + (it.scores.hentai ?? 0))} · Suggestive {pct(it.scores.sexy)} · Neutral {pct(it.scores.neutral)}
                  </p>
                ) : (
                  <p className="text-[11px] text-stone-400">Not scored by the checker</p>
                )}
                {it.reason && <p className="text-[11px] text-red-700">{it.reason}</p>}
                <p className="text-[11px] text-stone-400">Uploaded {when(it.createdAt)}{it.reviewedAt ? ` · decided ${when(it.reviewedAt)}` : ''}</p>

                {rejecting === it.id ? (
                  <div className="space-y-2">
                    <input className="input py-1.5 text-xs" placeholder="Reason the owner will see (optional)"
                      value={reason} onChange={e => setReason(e.target.value)} />
                    <div className="flex gap-2">
                      <button className="btn-secondary flex-1 py-1.5 text-[11px]" onClick={() => setRejecting(null)}>Cancel</button>
                      <button className="btn-primary flex-1 py-1.5 text-[11px]" disabled={decide.isPending}
                        onClick={() => decide.mutate({ id: it.id, approve: false, reason })}>Reject</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2 pt-1">
                    {it.status !== 'APPROVED' && (
                      <button className="btn-primary flex-1 py-1.5 text-[11px]" disabled={decide.isPending}
                        onClick={() => decide.mutate({ id: it.id, approve: true })}>
                        <Check size={12} /> Approve
                      </button>
                    )}
                    {it.status !== 'REJECTED' && (
                      <button className="btn-secondary flex-1 py-1.5 text-[11px]" disabled={decide.isPending}
                        onClick={() => { setRejecting(it.id); setReason(''); }}>
                        <Ban size={12} /> Reject
                      </button>
                    )}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
