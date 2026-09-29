import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Smartphone, AlertTriangle, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import PaymentStatusModal, { PayPhase } from './PaymentStatusModal';

/**
 * Choosing a plan and paying for it.
 *
 * Shared by the subscription page, the pending-activation screen and the
 * expired screen. Those last two are where a shop most needs to pay, and
 * duplicating the flow into each would mean three places to fix whenever the
 * gateway's behaviour changes.
 */

interface PlanRow { plan: string; monthlyPrice: number | null; buyable?: boolean }
interface PlansResponse {
  current: string; active: boolean; expiresAt: string | null;
  paymentsEnabled: boolean; plans: PlanRow[];
}
export interface Quote {
  fromPlan: string; toPlan: string; isRenewal: boolean;
  daysRemaining: number; creditApplied: number; amount: number;
  totalDays: number; expiresAt: string;
}
export interface Payment {
  reference: string; plan: string; months: number; amount: number;
  status: 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED' | 'CANCELLED' | 'EXPIRED';
  failureReason: string | null; expiresAfter: string | null;
  createdAt: string; completedAt: string | null;
}

const MONTH_CHOICES = [1, 3, 6, 12];
/** How often the server is asked where the payment got to. */
const POLL_MS = 3000;
/**
 * How long to watch before giving up.
 *
 * Matched to the mobile money prompt itself, which the networks expire at
 * around three minutes. Watching past that only shows a spinner for something
 * that can no longer be approved.
 */
const WAIT_SECONDS = 180;
const MAX_TRIES = WAIT_SECONDS / (POLL_MS / 1000);
export const money = (n: number) => `TSh ${Math.round(n).toLocaleString()}`;

export default function PayForPlan({ onPaid, compact }: {
  /** Called once a payment succeeds, so the host screen can let the shop in. */
  onPaid?: (p: Payment) => void;
  /** Tighter spacing for the activation screens, which are a single card. */
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const [plan, setPlan]         = useState('GROWTH');
  const [months, setMonths]     = useState(1);
  const [phone, setPhone]       = useState('');
  const [error, setError]       = useState('');
  const [paying, setPaying]     = useState(false);
  const [watching, setWatching] = useState<string | null>(null);
  const [result, setResult]     = useState<Payment | null>(null);
  const [phase, setPhase]       = useState<PayPhase | null>(null);
  const [left, setLeft]         = useState(0);

  const { data } = useQuery<{ data: PlansResponse }>({
    queryKey: ['billing-plans'],
    queryFn: () => api.get('/billing/plans').then(r => r.data),
  });
  const info = data?.data;

  /**
   * What this payment would actually do, asked of the server rather than
   * recomputed here.
   *
   * Changing plan converts unused time into value, which on an upgrade can
   * shorten a long remaining period: a year of Growth is worth six months of
   * Business. That has to be agreed to before paying, not found out after.
   */
  const { data: quoteRes } = useQuery<{ data: Quote }>({
    queryKey: ['billing-quote', plan, months],
    queryFn: () => api.get('/billing/quote', { params: { plan, months } }).then(r => r.data),
    enabled: Boolean(info?.paymentsEnabled !== false),
  });
  const quote = quoteRes?.data;
  // /billing/plans returns every tier so the comparison table elsewhere can
  // render them all. Only the buyable ones belong in this picker: Starter is
  // free and Enterprise is priced on application, and both rendered as
  // "TSh 0 per month" when they leaked in.
  const buyable = (info?.plans ?? []).filter(p => p.buyable !== false && (p.monthlyPrice ?? 0) > 0);
  const chosen = buyable.find(p => p.plan === plan);
  const total = (chosen?.monthlyPrice ?? 0) * months;

  // While a prompt sits on the customer's phone, ask the server where it got
  // to. The webhook is what settles it; this is so the screen does not hang on
  // a spinner if that webhook is slow or lost.
  const lastRef = useRef<string | null>(null);
  const timer = useRef<number | null>(null);
  const clock = useRef<number | null>(null);
  useEffect(() => {
    if (!watching) return;

    // A visible countdown, because during the wait the spinner is the only
    // thing moving and it says nothing about how much patience is left.
    setLeft(WAIT_SECONDS);
    clock.current = window.setInterval(() => setLeft(s => (s > 0 ? s - 1 : 0)), 1000);

    let tries = 0;
    const stopClock = () => { if (clock.current) window.clearInterval(clock.current); };

    const tick = async () => {
      tries++;
      try {
        const r = await api.get(`/billing/payments/${watching}`);
        const p: Payment = r.data.data;
        if (p.status !== 'PENDING' && p.status !== 'PROCESSING') {
          stopClock();
          setResult(p); setWatching(null); setPaying(false);
          qc.invalidateQueries({ queryKey: ['billing-plans'] });
          qc.invalidateQueries({ queryKey: ['billing-payments'] });

          if (p.status === 'SUCCESS') {
            setPhase('success');
            // Long enough for the tick and the chime to register as the answer
            // to what they just did, short enough not to feel like a hang.
            window.setTimeout(() => onPaid?.(p), 1600);
          } else {
            setPhase('failed');
          }
          return;
        }
      } catch { /* a blip should not end the wait */ }

      // Giving up is a separate outcome from failing. The payment may still be
      // travelling, so this says so rather than claiming it failed.
      if (tries >= MAX_TRIES) {
        stopClock();
        setWatching(null); setPaying(false); setPhase('timeout');
        return;
      }
      timer.current = window.setTimeout(tick, POLL_MS);
    };

    timer.current = window.setTimeout(tick, POLL_MS);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
      stopClock();
    };
  }, [watching, qc, onPaid]);

  async function pay() {
    setError(''); setResult(null); setPaying(true); setPhase('waiting');
    try {
      const r = await api.post('/billing/pay', { plan, months, phone });
      lastRef.current = r.data.data.reference;
      setWatching(r.data.data.reference);
    } catch (e) {
      setPaying(false); setPhase(null);
      setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message
        || t('billing.couldNotStart'));
    }
  }

  /**
   * Withdraw the prompt, not just the spinner.
   *
   * Closing the modal alone left the payment live at the gateway, which kept
   * re-asking the customer for a PIN they had already declined. The cancel is
   * fired and not awaited: the screen should close the moment they ask it to,
   * and losing the race to an approval is handled by the server, which reads
   * the real status back rather than assuming.
   */
  function dismiss() {
    const ref = watching ?? lastRef.current;
    if (ref) {
      void api.post(`/billing/payments/${ref}/cancel`)
        .then(() => {
          qc.invalidateQueries({ queryKey: ['billing-plans'] });
          qc.invalidateQueries({ queryKey: ['billing-payments'] });
        })
        .catch(() => { /* the payment settles on its own either way */ });
    }
    setPhase(null); setWatching(null); setPaying(false);
  }

  /** Give the same reference more time rather than starting a second payment. */
  function keepWaiting() {
    if (result) return;
    setPhase('waiting');
    setPaying(true);
    setWatching(w => w ?? lastRef.current);
    if (!watching && lastRef.current) setWatching(lastRef.current);
  }

  // Built once and included by every branch below, so whichever card is on
  // screen the modal still sits over it.
  const modal = phase ? (
    <PaymentStatusModal
      phase={phase}
      amount={money(total)}
      reason={result?.failureReason ?? result?.status ?? null}
      secondsLeft={left}
      onRetry={() => { setPhase(null); setResult(null); pay(); }}
      onClose={dismiss}
      onKeepWaiting={keepWaiting}
    />
  ) : null;

  if (info && !info.paymentsEnabled) {
    return (
      <div className="flex items-start gap-2 text-left">
        <AlertTriangle size={15} className="text-amber-600 mt-0.5 shrink-0" />
        <p className="text-sm text-stone-600">{t('billing.notConfigured')}</p>
      </div>
    );
  }

  if (result?.status === 'SUCCESS') {
    return (
      <>
      {modal}
      <div className="flex items-start gap-3 text-left">
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
      </>
    );
  }

  return (
    <div className="text-left">
      {modal}

      <label className="label">{t('billing.choosePlan')}</label>
      <div className={`grid sm:grid-cols-2 gap-3 ${compact ? 'mb-4' : 'mb-5'}`}>
        {buyable.map(p => (
          <button key={p.plan} onClick={() => setPlan(p.plan)} type="button"
            className={`text-left rounded-xl p-3 transition-all ${plan === p.plan ? 'ring-2 ring-stone-900' : ''}`}
            style={{ background: '#E8EBF0',
                     boxShadow: plan === p.plan
                       ? 'inset 4px 4px 9px #c5cad3, inset -4px -4px 9px #ffffff'
                       : '4px 4px 10px #c5cad3, -4px -4px 10px #ffffff' }}>
            <p className="text-sm font-bold text-stone-900">{p.plan}</p>
            <p className="text-xs text-stone-500 mt-0.5">{money(p.monthlyPrice ?? 0)} {t('billing.perMonth')}</p>
          </button>
        ))}
      </div>

      <label className="label">{t('billing.howLong')}</label>
      <div className={`flex flex-wrap gap-2 ${compact ? 'mb-4' : 'mb-5'}`}>
        {MONTH_CHOICES.map(m => (
          <button key={m} onClick={() => setMonths(m)} type="button"
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${months === m ? 'text-stone-900' : 'text-stone-500'}`}
            style={{ background: '#E8EBF0',
                     boxShadow: months === m
                       ? 'inset 3px 3px 7px #c5cad3, inset -3px -3px 7px #ffffff'
                       : '3px 3px 8px #c5cad3, -3px -3px 8px #ffffff' }}>
            {t('billing.months', { count: m })}
          </button>
        ))}
      </div>

      <label className="label">{t('billing.phone')}</label>
      <input className="input-box mb-2" value={phone} placeholder="0712 345 678" inputMode="tel"
             onChange={e => setPhone(e.target.value)} disabled={paying} />
      <p className={`text-[11px] text-stone-400 ${compact ? 'mb-4' : 'mb-5'}`}>{t('billing.phoneHint')}</p>

      {quote && !quote.isRenewal && quote.daysRemaining > 0 && (
        <div className="mb-4 rounded-xl bg-stone-50 p-3 text-xs leading-relaxed text-stone-600">
          {quote.creditApplied > 0 ? (
            <>
              {t('billing.quoteCredit', {
                days: quote.daysRemaining,
                plan: quote.fromPlan,
                credit: money(quote.creditApplied),
              })}{' '}
              <strong className="text-stone-900">
                {t('billing.quoteResult', { days: quote.totalDays, plan: quote.toPlan })}
              </strong>
            </>
          ) : (
            <strong className="text-stone-900">
              {t('billing.quoteResult', { days: quote.totalDays, plan: quote.toPlan })}
            </strong>
          )}
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <span className="text-xs uppercase tracking-widest text-stone-400">{t('billing.total')}</span>
        <span className="text-xl font-bold text-stone-900">{money(total)}</span>
      </div>

      <button className="btn-primary w-full py-3" disabled={paying || !phone} onClick={pay} type="button">
        {paying ? (
          <><Loader2 size={14} className="animate-spin" /> {t('common.saving')}</>
        ) : (
          <><Smartphone size={14} /> {t('billing.payNow', { amount: money(total) })}</>
        )}
      </button>

      {error && <p className="text-xs text-red-600 text-center mt-3">{error}</p>}
    </div>
  );
}
