import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { X, TrendingDown } from 'lucide-react';
import api from '../../api/client';

/**
 * What to order, worked out from what has been selling.
 *
 * Every figure here is arithmetic on the shop's own sales, shown with its
 * working: sold per day, days left, and the quantity that covers the supplier's
 * lead time plus two weeks. The owner unticks what they do not want, and the
 * rest becomes draft purchase orders, one per supplier. Drafts only: nothing
 * is sent or owed until they open one and move it on.
 */

interface Row {
  productId: string; name: string; unit: string | null;
  stock: number; dailyRate: number; daysLeft: number | null;
  suggestedQty: number; unitCost: number; supplierName: string | null;
}
interface Forecast {
  assumptions: { windowDays: number; leadDays: number; coverDays: number };
  items: Row[];
}

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

export default function ReorderSheet({ currency, onClose }: { currency: string; onClose: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [skip, setSkip] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery<{ data: Forecast }>({
    queryKey: ['forecast', 'reorder'],
    queryFn: () => api.get('/inventory/forecast', { params: { only: 'reorder' } }).then(r => r.data),
  });
  const f = data?.data;
  const chosen = f?.items.filter(r => !skip.has(r.productId)) ?? [];
  const total = chosen.reduce((s, r) => s + r.suggestedQty * r.unitCost, 0);

  const draft = useMutation({
    mutationFn: () => api.post('/inventory/forecast/reorder', { productIds: chosen.map(r => r.productId) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attention'] });
      onClose();
      navigate('/inventory/purchase-orders');
    },
  });

  const toggle = (id: string) => setSkip(s => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  return (
    <div className="fixed inset-0 z-[1000] flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        role="dialog" aria-modal="true" aria-labelledby="reorder-title"
        className="card flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-b-none sm:mx-4 sm:rounded-b-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 border-b border-stone-100 p-4 sm:p-5">
          <TrendingDown size={18} className="mt-0.5 shrink-0 text-red-600" />
          <div className="min-w-0 flex-1">
            <h2 id="reorder-title" className="text-sm font-bold text-stone-900">{t('reorder.title')}</h2>
            {f && (
              <p className="mt-0.5 text-xs text-stone-500">
                {t('reorder.basis', { window: f.assumptions.windowDays, lead: f.assumptions.leadDays, cover: f.assumptions.coverDays })}
              </p>
            )}
          </div>
          <button onClick={onClose} aria-label={t('common.close', 'Close')} className="rounded-md p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700">
            <X size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {isLoading ? (
            <p className="p-5 text-sm text-stone-400">{t('common.loading', 'Loading…')}</p>
          ) : !f?.items.length ? (
            <p className="p-5 text-sm text-stone-500">{t('reorder.none')}</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {f.items.map(r => {
                const on = !skip.has(r.productId);
                return (
                  <li key={r.productId}>
                    <label className="flex cursor-pointer items-start gap-3 px-4 py-3 sm:px-5">
                      <input type="checkbox" checked={on} onChange={() => toggle(r.productId)} className="mt-1 h-4 w-4 shrink-0 accent-emerald-700" />
                      <div className="min-w-0 flex-1">
                        <p className={`truncate text-sm font-medium ${on ? 'text-stone-900' : 'text-stone-400 line-through'}`}>{r.name}</p>
                        <p className="mt-0.5 text-[11px] text-stone-500">
                          {t('reorder.working', {
                            stock: fmt(r.stock), rate: r.dailyRate,
                            days: r.daysLeft === null ? '-' : Math.floor(r.daysLeft),
                          })}
                          {r.supplierName ? ` · ${r.supplierName}` : ''}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-bold tabular-nums text-stone-900">{fmt(r.suggestedQty)}{r.unit ? ` ${r.unit}` : ''}</p>
                        <p className="text-[11px] tabular-nums text-stone-400">{currency} {fmt(r.suggestedQty * r.unitCost)}</p>
                      </div>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {!!f?.items.length && (
          <div className="flex flex-wrap items-center gap-3 border-t border-stone-100 p-4 sm:p-5">
            <p className="min-w-0 flex-1 text-xs text-stone-500">
              {t('reorder.summary', { count: chosen.length })} · <span className="font-semibold tabular-nums text-stone-800">{currency} {fmt(total)}</span>
            </p>
            {draft.isError && <p className="w-full text-xs text-red-600">{t('reorder.failed')}</p>}
            <button className="btn-primary" disabled={!chosen.length || draft.isPending} onClick={() => draft.mutate()}>
              {draft.isPending ? t('common.saving', 'Saving…') : t('reorder.create')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
