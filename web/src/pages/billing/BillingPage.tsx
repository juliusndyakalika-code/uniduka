import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Smartphone, AlertTriangle, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import { PageLoader } from '../../components/ui/Loader';
import PayForPlan from '../../components/billing/PayForPlan';

interface PlanRow { plan: string; monthlyPrice: number }
interface PlansResponse {
  current: string; active: boolean; expiresAt: string | null;
  paymentsEnabled: boolean; plans: PlanRow[];
}
interface Payment {
  reference: string; plan: string; months: number; amount: number;
  status: 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED' | 'CANCELLED' | 'EXPIRED';
  failureReason: string | null; expiresAfter: string | null;
  createdAt: string; completedAt: string | null;
}

const MONTH_CHOICES = [1, 3, 6, 12];

export default function BillingPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const [plan, setPlan]       = useState('GROWTH');
  const [months, setMonths]   = useState(1);
  const [phone, setPhone]     = useState('');
  const [error, setError]     = useState('');
  const [paying, setPaying]   = useState(false);
  const [watching, setWatching] = useState<string | null>(null);
  const [result, setResult]   = useState<Payment | null>(null);

  const money = (n: number) => `TSh ${Math.round(n).toLocaleString()}`;

  const { data, isLoading } = useQuery<{ data: PlansResponse }>({
    queryKey: ['billing-plans'],
    queryFn: () => api.get('/billing/plans').then(r => r.data),
  });
  const { data: history } = useQuery<{ data: Payment[] }>({
    queryKey: ['billing-payments'],
    queryFn: () => api.get('/billing/payments').then(r => r.data),
  });

  const info = data?.data;
  const chosen = info?.plans.find(p => p.plan === plan);
  const total = (chosen?.monthlyPrice ?? 0) * months;

  // While a prompt is sitting on the customer's phone, ask the server where it
  // got to. The webhook is what settles it; this is so the page does not sit
  // on a spinner if that webhook is slow or lost.
  const timer = useRef<number | null>(null);
  useEffect(() => {
    if (!watching) return;
    let tries = 0;
    const tick = async () => {
      tries++;
      try {
        const r = await api.get(`/billing/payments/${watching}`);
        const p: Payment = r.data.data;
        if (p.status !== 'PENDING' && p.status !== 'PROCESSING') {
          setResult(p); setWatching(null); setPaying(false);
          qc.invalidateQueries({ queryKey: ['billing-plans'] });
          qc.invalidateQueries({ queryKey: ['billing-payments'] });
          return;
        }
      } catch { /* keep waiting; a blip should not end the wait */ }
      // Mobile money prompts time out around three minutes, so stop there
      // rather than polling forever.
      if (tries > 60) { setWatching(null); setPaying(false); return; }
      timer.current = window.setTimeout(tick, 3000);
    };
    timer.current = window.setTimeout(tick, 3000);
    return () => { if (timer.current) window.clearTimeout(timer.current); };
  }, [watching, qc]);

  async function pay() {
    setError(''); setResult(null); setPaying(true);
    try {
      const r = await api.post('/billing/pay', { plan, months, phone });
      setWatching(r.data.data.reference);
    } catch (e) {
      setPaying(false);
      setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message
        || t('billing.couldNotStart'));
    }
  }

  if (isLoading) return <PageLoader />;

  return (
    <div className="max-w-3xl">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('billing.title')}</h1>
          <p className="page-subtitle">{t('billing.subtitle')}</p>
        </div>
      </div>

      {info && <PlanCard info={info} />}

      {/* "Payment is not switched on" is PayForPlan's to say: it owns the
          payment flow and renders that message in place of its form. Saying
          it here as well printed the same warning twice. */}

      {result && (
        <div className="card p-5 mb-5">
          {result.status === 'SUCCESS' ? (
            <div className="flex items-start gap-3">
              <Check size={18} className="text-emerald-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-stone-900">{t('billing.paid')}</p>
                <p className="text-xs text-stone-500 mt-1">
                  {t('billing.paidUntil', {
                    date: result.expiresAfter ? new Date(result.expiresAfter).toLocaleDateString() : '',
                  })}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3">
              <AlertTriangle size={18} className="text-red-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-stone-900">{t('billing.notPaid')}</p>
                <p className="text-xs text-stone-500 mt-1">
                  {t(`billing.status.${result.status}`, { defaultValue: result.status })}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="card p-5 mb-5">
        <PayForPlan />
      </div>

      {(history?.data?.length ?? 0) > 0 && (
        <div className="card p-5">
          <p className="text-xs font-bold uppercase tracking-widest text-stone-500 mb-3">
            {t('billing.history')}
          </p>
          {history!.data.map(p => (
            <div key={p.reference} className="flex items-center justify-between py-2 border-b border-stone-200/60 last:border-0">
              <div className="min-w-0">
                <p className="text-xs font-medium text-stone-800">
                  {p.plan} · {t('billing.months', { count: p.months })}
                </p>
                <p className="text-[10px] text-stone-400">
                  {new Date(p.createdAt).toLocaleDateString()} · {p.reference}
                </p>
              </div>
              <div className="text-right shrink-0 ml-3">
                <p className="text-xs font-semibold text-stone-900">{money(p.amount)}</p>
                <p className={`text-[10px] ${p.status === 'SUCCESS' ? 'text-emerald-600' : 'text-stone-400'}`}>
                  {t(`billing.status.${p.status}`, { defaultValue: p.status })}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Days between now and then, counted in whole days.
 *
 * Rounded up, so an expiry eighteen hours away reads "1 day" rather than
 * "0 days", which would say the plan has already gone when it has not.
 */
function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

/** Matches core/notices on the server: the day the first reminder goes out. */
const REMINDER_FROM_DAYS = 7;

/**
 * The plan, in the colour of its own health.
 *
 * It used to be the same pale card as everything else on the page, which
 * told the owner nothing at a glance and made the one fact they came for
 * hunt for itself. The colour now carries the state, so the card is both
 * distinct and informative rather than merely decorated.
 *
 * The pulse is reserved for the last few days before expiry. A plan in good
 * standing needs no attention, and something that beats quietly in a corner
 * forever stops meaning anything; saving it for the week when paying is
 * actually due is what makes it register when it appears.
 *
 * Not on the ended state, which looks like the obvious candidate. An
 * account past its date is bounced off this page before the card renders,
 * to /expired or /pending depending on its flags, so a pulse there would
 * beat where nobody is looking. The red styling stays as a fallback in case
 * that routing ever changes.
 */
function PlanCard({ info }: { info: { current: string; active: boolean; expiresAt: string | null } }) {
  const { t, i18n } = useTranslation();
  const days = info.expiresAt ? daysUntil(info.expiresAt) : null;
  const ended = !info.active || (days !== null && days < 0);
  const soon  = !ended && days !== null && days <= REMINDER_FROM_DAYS;
  // Starter is the free trial, the same rule the sidebar badge uses. A trial
  // running normally is not a problem, but it is not a paid plan either, so
  // it wears the house colour rather than the green that means "settled".
  const onTrial = (info.current ?? '').trim().toUpperCase() === 'STARTER';

  const tone = ended
    ? { ring: 'ring-red-200',     bg: 'bg-red-50',     ink: 'text-red-700',     dot: 'bg-red-500',     chip: 'bg-red-100 text-red-800' }
    : soon
    ? { ring: 'ring-amber-200',   bg: 'bg-amber-50',   ink: 'text-amber-800',   dot: 'bg-amber-500',   chip: 'bg-amber-100 text-amber-900' }
    : onTrial
    ? { ring: 'ring-primary-200', bg: 'bg-primary-50', ink: 'text-primary-800', dot: 'bg-primary-500', chip: 'bg-primary-100 text-primary-900' }
    : { ring: 'ring-emerald-200', bg: 'bg-emerald-50', ink: 'text-emerald-800', dot: 'bg-emerald-500', chip: 'bg-emerald-100 text-emerald-900' };

  const status = ended
    ? t(onTrial ? 'billing.trialEnded' : 'billing.statusEnded')
    : days === null
    ? t(onTrial ? 'billing.trialActive' : 'billing.statusActive')
    : soon
    ? t(onTrial ? 'billing.trialSoon' : 'billing.statusSoon', { count: days })
    : t(onTrial ? 'billing.trialDays' : 'billing.statusDays', { count: days });

  const when = info.expiresAt
    ? new Date(info.expiresAt).toLocaleDateString(i18n.language === 'sw' ? 'sw-TZ' : 'en-GB',
        { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

  return (
    <div className={`mb-5 rounded-2xl p-5 ring-1 ${tone.bg} ${tone.ring}`}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-widest text-stone-500">{t('billing.currentPlan')}</p>
          <p className={`mt-1 flex flex-wrap items-center gap-2.5 text-2xl font-bold ${tone.ink}`}>
            <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${tone.dot} ${soon ? 'mh-heartbeat' : ''}`} />
            {info.current}
            {/* Said twice on purpose: the chip is read at a glance, the
                status line below explains what it means for the dates. */}
            {onTrial && (
              <span className="rounded-md bg-white/70 px-2 py-0.5 text-[11px] font-bold uppercase tracking-widest">
                {t('billing.trialChip')}
              </span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${tone.chip}`}>{status}</span>
          {when && (
            <div className="text-right">
              <p className="text-[11px] uppercase tracking-widest text-stone-500">
                {ended
                  ? t('billing.expiredOn')
                  : t(onTrial ? 'billing.trialEndsOn' : 'billing.renewsOn')}
              </p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums text-stone-800">{when}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
