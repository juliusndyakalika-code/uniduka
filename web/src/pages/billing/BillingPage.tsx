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

      <div className="card p-5 mb-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-widest text-stone-400">{t('billing.currentPlan')}</p>
            <p className="text-lg font-bold text-stone-900 mt-0.5">{info?.current}</p>
          </div>
          {info?.expiresAt && (
            <div className="text-right">
              <p className="text-xs uppercase tracking-widest text-stone-400">
                {info.active ? t('billing.renewsOn') : t('billing.expiredOn')}
              </p>
              <p className="text-sm font-semibold text-stone-800 mt-0.5">
                {new Date(info.expiresAt).toLocaleDateString()}
              </p>
            </div>
          )}
        </div>
      </div>

      {info && !info.paymentsEnabled && (
        <div className="card p-4 mb-5 flex items-start gap-2">
          <AlertTriangle size={15} className="text-amber-600 mt-0.5 shrink-0" />
          <p className="text-sm text-stone-600">{t('billing.notConfigured')}</p>
        </div>
      )}

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
