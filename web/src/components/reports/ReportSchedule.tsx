import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BellRing, Check, Loader2, MessageSquare, Send, Smartphone } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';

/**
 * Choosing which business reports this shop receives.
 *
 * Each period is a switch, and each switch carries what it costs: an owner
 * turning on daily is committing to 365 messages a year, and that is worth
 * saying plainly rather than discovering on a bill. The preview renders the
 * real message from this shop's real figures, so the decision is made against
 * the thing itself rather than a description of it.
 */

type Period = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';

interface Prefs {
  daily: boolean; weekly: boolean; monthly: boolean; quarterly: boolean; yearly: boolean;
  sendHour: number; phone: string | null; enabled: boolean;
}

interface Preview {
  body: string;
  characters: number;
  parts: number;
  wouldSend: boolean;
  metrics: { revenue: number; netProfit: number; transactions: number; stockValue: number; quiet: boolean };
}

/** Sends per year, which is the number that actually decides the bill. */
const PERIODS: { key: Period; perYear: number }[] = [
  { key: 'daily',     perYear: 365 },
  { key: 'weekly',    perYear: 52 },
  { key: 'monthly',   perYear: 12 },
  { key: 'quarterly', perYear: 4 },
  { key: 'yearly',    perYear: 1 },
];

export default function ReportSchedule() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [preview, setPreview] = useState<Period | null>(null);
  const [saved, setSaved] = useState(false);

  const { data: prefs, isLoading } = useQuery<{ data: Prefs }>({
    queryKey: ['report-schedule'],
    queryFn: () => api.get('/reporting/schedule').then(r => r.data),
  });
  const p = prefs?.data;

  const { data: previewData, isFetching: previewing } = useQuery<{ data: Preview }>({
    queryKey: ['report-preview', preview],
    queryFn: () => api.get('/reporting/schedule/preview', { params: { period: preview } }).then(r => r.data),
    enabled: Boolean(preview),
  });

  /**
   * Send one report now.
   *
   * The scheduled send is the worst place to find out a number is wrong or a
   * sender name is unapproved: once a day, at a fixed hour, silently. This
   * makes the same journey on demand.
   */
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const test = useMutation({
    mutationFn: () => api.post('/reporting/schedule/test', { period: preview ?? 'daily' }).then(r => r.data),
    onSuccess: (r) => {
      setTestError(null);
      setTestResult(r?.data?.to ?? '');
      setTimeout(() => setTestResult(null), 8000);
    },
    onError: (e: unknown) => {
      setTestResult(null);
      setTestError((e as { response?: { data?: { message?: string } } })?.response?.data?.message
        || 'Could not send the test message.');
    },
  });

  const save = useMutation({
    mutationFn: (body: Partial<Prefs>) => api.patch('/reporting/schedule', body).then(r => r.data),
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      qc.invalidateQueries({ queryKey: ['report-schedule'] });
    },
  });

  if (isLoading || !p) return null;

  // Total messages a year at the current selection. The honest headline: it is
  // what the choices add up to, not a per-switch abstraction.
  const perYear = PERIODS.reduce((n, row) => n + (p[row.key] ? row.perYear : 0), 0);

  return (
    <div className="card p-6">
      <div className="mb-1 flex items-center gap-2">
        <BellRing size={16} className="text-primary-600" />
        <h3 className="text-sm font-bold text-stone-900">{t('reports.scheduleTitle')}</h3>
        {saved && (
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
            <Check size={12} /> {t('common.saved')}
          </span>
        )}
      </div>
      <p className="mb-5 text-xs text-stone-500">{t('reports.scheduleHelp')}</p>

      {/* Push costs nothing and reaches the same person, so it is stated up
          front: an owner who installs the app stops paying for these. */}
      <div className="mb-5 flex items-start gap-2 rounded-xl bg-stone-50 p-3">
        <Smartphone size={14} className="mt-0.5 shrink-0 text-stone-400" />
        <p className="text-[11px] leading-snug text-stone-600">{t('reports.pushFirst')}</p>
      </div>

      <div className="space-y-2">
        {PERIODS.map(({ key, perYear: n }) => (
          <div key={key} className="flex items-center gap-3 rounded-xl p-2 hover:bg-stone-50">
            <button
              type="button"
              role="switch"
              aria-checked={p[key]}
              disabled={!p.enabled || save.isPending}
              onClick={() => save.mutate({ [key]: !p[key] })}
              className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                p[key] ? 'bg-emerald-500' : 'bg-stone-300'
              } disabled:opacity-40`}
            >
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                p[key] ? 'translate-x-4' : 'translate-x-0.5'
              }`} />
            </button>

            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-stone-900">{t(`reports.period.${key}`)}</p>
              <p className="text-[11px] text-stone-400">
                {t('reports.perYear', { count: n })}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setPreview(preview === key ? null : key)}
              className="shrink-0 text-[11px] text-primary-600 hover:underline"
            >
              {preview === key ? t('common.close') : t('reports.preview')}
            </button>
          </div>
        ))}
      </div>

      {preview && (
        <div className="mt-4 rounded-xl border border-stone-200 p-3">
          {previewing ? (
            <Loader2 size={14} className="animate-spin text-stone-400" />
          ) : previewData?.data ? (
            <>
              <div className="mb-2 flex items-center gap-1.5">
                <MessageSquare size={12} className="text-stone-400" />
                <span className="text-[11px] font-semibold uppercase tracking-widest text-stone-400">
                  {t('reports.previewTitle')}
                </span>
              </div>
              <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-stone-800">
                {previewData.data.body}
              </pre>
              <p className="mt-2 text-[11px] text-stone-400">
                {t('reports.previewCost', {
                  characters: previewData.data.characters,
                  parts: previewData.data.parts,
                })}
              </p>
              {/* A quiet period sends nothing at all, and an owner should know
                  that before wondering why no message arrived. */}
              {!previewData.data.wouldSend && (
                <p className="mt-1 text-[11px] text-amber-700">{t('reports.previewQuiet')}</p>
              )}
            </>
          ) : null}
        </div>
      )}

      <div className="mt-5 grid gap-4 border-t border-stone-100 pt-5 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="sendHour">{t('reports.sendHour')}</label>
          <select
            id="sendHour"
            className="input"
            value={p.sendHour}
            disabled={!p.enabled}
            onChange={e => save.mutate({ sendHour: Number(e.target.value) })}
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-stone-400">{t('reports.sendHourHint')}</p>
        </div>

        <div>
          <label className="label" htmlFor="reportPhone">{t('reports.phone')}</label>
          <input
            id="reportPhone"
            className="input"
            inputMode="tel"
            defaultValue={p.phone ?? ''}
            disabled={!p.enabled}
            placeholder={t('reports.phonePlaceholder')}
            onBlur={e => {
              const v = e.target.value.trim();
              if (v !== (p.phone ?? '')) save.mutate({ phone: v || null });
            }}
          />
          <p className="mt-1 text-[11px] text-stone-400">{t('reports.phoneHint')}</p>
        </div>
      </div>

      <label className="mt-5 flex items-center gap-2 border-t border-stone-100 pt-4 text-sm">
        <input
          type="checkbox"
          checked={!p.enabled}
          onChange={e => save.mutate({ enabled: !e.target.checked })}
        />
        <span className="text-stone-600">{t('reports.pauseAll')}</span>
      </label>

      {p.enabled && perYear > 0 && (
        <p className="mt-3 text-[11px] text-stone-400">
          {t('reports.totalPerYear', { count: perYear })}
        </p>
      )}

      <div className="mt-4 border-t border-stone-100 pt-4">
        <button
          type="button"
          className="btn-secondary px-4 py-2 text-xs"
          disabled={test.isPending}
          onClick={() => test.mutate()}
        >
          {test.isPending
            ? <Loader2 size={13} className="animate-spin" />
            : <><Send size={13} /> {t('reports.sendTest')}</>}
        </button>
        <p className="mt-2 text-[11px] text-stone-400">{t('reports.sendTestHint')}</p>
        {testResult !== null && (
          <p className="mt-2 text-[11px] text-emerald-700">
            {t('reports.sendTestDone', { phone: testResult })}
          </p>
        )}
        {testError && <p className="mt-2 text-[11px] text-red-600">{testError}</p>}
      </div>
    </div>
  );
}
