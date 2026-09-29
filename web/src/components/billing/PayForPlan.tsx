import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Smartphone, AlertTriangle, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';

/**
 * Choosing a plan and paying for it.
 *
 * Shared by the subscription page, the pending-activation screen and the
 * expired screen. Those last two are where a shop most needs to pay, and
 * duplicating the flow into each would mean three places to fix whenever the
 * gateway's behaviour changes.
 */

interface PlanRow { plan: string; monthlyPrice: number }
interface PlansResponse {
  current: string; active: boolean; expiresAt: string | null;
  paymentsEnabled: boolean; plans: PlanRow[];
}
export interface Payment {
  reference: string; plan: string; months: number; amount: number;
  status: 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED' | 'CANCELLED' | 'EXPIRED';
  failureReason: string | null; expiresAfter: string | null;
  createdAt: string; completedAt: string | null;
}

const MONTH_CHOICES = [1, 3, 6, 12];
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

  const { data } = useQuery<{ data: PlansResponse }>({
    queryKey: ['billing-plans'],
    queryFn: () => api.get('/billing/plans').then(r => r.data),
  });
  const info = data?.data;
  const chosen = info?.plans.find(p => p.plan === plan);
  const total = (chosen?.monthlyPrice ?? 0) * months;

  // While a prompt sits on the customer's phone, ask the server where it got
  // to. The webhook is what settles it; this is so the screen does not hang on
  // a spinner if that webhook is slow or lost.
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
          if (p.status === 'SUCCESS') onPaid?.(p);
          return;
        }
      } catch { /* a blip should not end the wait */ }
      // Mobile money prompts time out around three minutes.
      if (tries > 60) { setWatching(null); setPaying(false); return; }
      timer.current = window.setTimeout(tick, 3000);
    };
    timer.current = window.setTimeout(tick, 3000);
    return () => { if (timer.current) window.clearTimeout(timer.current); };
  }, [watching, qc, onPaid]);

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
    );
  }

  return (
    <div className="text-left">
      {result && (
        <div className="flex items-start gap-2 mb-4">
          <AlertTriangle size={15} className="text-red-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-stone-900">{t('billing.notPaid')}</p>
            <p className="text-xs text-stone-500">
              {t(`billing.status.${result.status}`, { defaultValue: result.status })}
            </p>
          </div>
        </div>
      )}

      <label className="label">{t('billing.choosePlan')}</label>
      <div className={`grid sm:grid-cols-2 gap-3 ${compact ? 'mb-4' : 'mb-5'}`}>
        {info?.plans.map(p => (
          <button key={p.plan} onClick={() => setPlan(p.plan)} type="button"
            className={`text-left rounded-xl p-3 transition-all ${plan === p.plan ? 'ring-2 ring-stone-900' : ''}`}
            style={{ background: '#E8EBF0',
                     boxShadow: plan === p.plan
                       ? 'inset 4px 4px 9px #c5cad3, inset -4px -4px 9px #ffffff'
                       : '4px 4px 10px #c5cad3, -4px -4px 10px #ffffff' }}>
            <p className="text-sm font-bold text-stone-900">{p.plan}</p>
            <p className="text-xs text-stone-500 mt-0.5">{money(p.monthlyPrice)} {t('billing.perMonth')}</p>
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

      <div className="flex items-center justify-between mb-4">
        <span className="text-xs uppercase tracking-widest text-stone-400">{t('billing.total')}</span>
        <span className="text-xl font-bold text-stone-900">{money(total)}</span>
      </div>

      <button className="btn-primary w-full py-3" disabled={paying || !phone} onClick={pay} type="button">
        {watching ? (
          <><Loader2 size={14} className="animate-spin" /> {t('billing.waitingForPin')}</>
        ) : paying ? (
          <><Loader2 size={14} className="animate-spin" /> {t('common.saving')}</>
        ) : (
          <><Smartphone size={14} /> {t('billing.payNow', { amount: money(total) })}</>
        )}
      </button>

      {watching && <p className="text-xs text-stone-500 text-center mt-3">{t('billing.checkPhone')}</p>}
      {error && <p className="text-xs text-red-600 text-center mt-3">{error}</p>}
    </div>
  );
}
