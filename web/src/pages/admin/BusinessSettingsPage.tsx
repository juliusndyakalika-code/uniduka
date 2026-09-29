import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Building2, CreditCard, Shield, CheckCircle2, ShieldCheck } from 'lucide-react';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { PageLoader } from '../../components/ui/Loader';
import { SUPPORT, waLinkTo } from '../../config';
import PayForPlan, { type Payment } from '../../components/billing/PayForPlan';
import ContactVerification, { pendingCount } from '../../components/account/ContactVerification';

interface AccountInfo {
  id: string; legalName: string; tradingName?: string; email?: string; phone?: string;
  country?: string; subscriptionPlan: string; subscriptionExpiresAt?: string | null;
  subscriptionActive: boolean; daysRemaining: number | null;
}
interface Form { legalName: string; tradingName?: string; email?: string; phone?: string; }

/**
 * Plans come from the server.
 *
 * They used to be a hardcoded table here, which had drifted to prices six
 * times the real ones and would never have corrected itself. The prices and
 * limits are defined once in core/plans on the backend and read from
 * /billing/plans, so this card cannot disagree with what is actually charged.
 */
interface PlanRow {
  plan: string; label: string; monthlyPrice: number | null; buyable: boolean;
  limits: { shops: number; branches: number; staff: number; registers: number };
  support: string;
}
interface PlansResponse {
  current: string; active: boolean; expiresAt: string | null;
  paymentsEnabled: boolean; plans: PlanRow[];
}

const UNLIMITED_FROM = 999;
const planPrice = (p: PlanRow) =>
  p.monthlyPrice === null ? 'Custom'
    : p.monthlyPrice === 0 ? 'Free'
    : `TZS ${p.monthlyPrice.toLocaleString()}/mo`;
const planLimit = (n: number, one: string, many: string) =>
  n >= UNLIMITED_FROM ? `Unlimited ${many}` : `${n} ${n === 1 ? one : many}`;

export default function BusinessSettingsPage() {
  const { account, applyPayment } = useAuthStore();
  const [changing, setChanging] = useState(false);
  // Starts at 1 so the card renders while the status loads, then corrects
  // itself. Starting at 0 would hide it for a beat on every visit.
  const [verifyPending, setVerifyPending] = useState(1);

  // The same source the payment flow itself reads, so the comparison table and
  // what is actually charged can never disagree.
  const { data: billingEnvelope } = useQuery<{ data: PlansResponse }>({
    queryKey: ['billing-plans'],
    queryFn: () => api.get('/billing/plans').then(r => r.data),
  });
  const billing = billingEnvelope?.data;

  function changed(p: Payment) {
    applyPayment(p.plan, p.expiresAfter);
    setChanging(false);
    qc.invalidateQueries({ queryKey: ['billing-plans'] });
    qc.invalidateQueries({ queryKey: ['tenant'] });
  }
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const { register, handleSubmit, reset } = useForm<Form>();

  const { data: info, isLoading } = useQuery<AccountInfo>({
    queryKey: ['account'],
    queryFn: () => api.get('/tenant/').then(r => r.data.data),
  });

  const enterpriseSubject = `Enterprise plan enquiry — ${info?.legalName ?? account?.legalName ?? ''}`.trim();
  const enterpriseEnquiry =
    `Hello, I would like to talk about the Enterprise plan for ` +
    `${info?.legalName ?? account?.legalName ?? 'my business'}. ` +
    `We are currently on the ${info?.subscriptionPlan ?? 'STARTER'} plan.`;

  useEffect(() => {
    if (info) reset({ legalName: info.legalName, tradingName: info.tradingName, email: info.email, phone: info.phone });
  }, [info, reset]);

  const { mutate: update, isPending } = useMutation({
    mutationFn: (d: Form) => api.patch('/tenant/', d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['account'] }); setSaved(true); setTimeout(() => setSaved(false), 3000); },
    onError: (e: unknown) => setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed'),
  });

  if (isLoading) return <div className="card"><PageLoader /></div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="page-header">
        <h1 className="page-title">{t('settings.businessTitle')}</h1>
      </div>

      {/* Business info */}
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-5">
          <Building2 size={16} className="text-primary-600" />
          <h3 className="text-sm font-bold text-stone-900">Business Information</h3>
        </div>
        {error && <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">{t('settings.saveFailed')}</div>}
        {saved && <div className="mb-4 px-3 py-2 bg-green-50 border border-green-200 rounded text-xs text-green-700">{t('settings.saved')}</div>}
        <form onSubmit={handleSubmit(d => update(d))} className="space-y-4">
          <div>
            <label className="label">{t('settings.legalName')}</label>
            <input {...register('legalName', { required: true })} className="input" />
          </div>
          <div>
            <label className="label">{t('settings.tradingName')}</label>
            <input {...register('tradingName')} className="input" placeholder="Optional, shown on receipts" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">{t('settings.email')}</label>
              <input {...register('email')} type="email" className="input" />
            </div>
            <div>
              <label className="label">{t('settings.phone')}</label>
              <input {...register('phone')} type="tel" className="input" />
            </div>
          </div>
          <button type="submit" disabled={isPending} className="btn-primary">
            {isPending ? t('common.loading') : t('settings.saveChanges')}
          </button>
        </form>
      </div>

      {/* Subscription */}
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-5">
          <CreditCard size={16} className="text-primary-600" />
          <h3 className="text-sm font-bold text-stone-900">Subscription</h3>
        </div>
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg font-bold text-stone-900">{info?.subscriptionPlan ?? '—'}</span>
              {info?.subscriptionActive
                ? <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 flex items-center gap-1"><CheckCircle2 size={10} /> Active</span>
                : <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">Inactive</span>}
            </div>
            {info?.subscriptionExpiresAt ? (
              <p className={`text-xs ${info.daysRemaining !== null && info.daysRemaining <= 7 ? 'text-red-600 font-medium' : 'text-stone-500'}`}>
                Expires {format(new Date(info.subscriptionExpiresAt), 'MMM d, yyyy')}
                {info.daysRemaining !== null && (
                  <span className="ml-1">
                    {info.daysRemaining === 0 ? '(expired)' : `· ${info.daysRemaining} day${info.daysRemaining === 1 ? '' : 's'} left`}
                  </span>
                )}
              </p>
            ) : info?.subscriptionActive ? (
              <p className="text-xs text-stone-500">No expiry date</p>
            ) : null}
          </div>
          <div className="text-right">
            {/* Owners change their own plan now. Support stays as a fallback
                for anyone paying another way, but it is no longer the only
                route: telling someone to email you in order to hand you money
                is a good way not to be handed it. */}
            {billing?.paymentsEnabled !== false && (
              <button type="button" onClick={() => setChanging(v => !v)}
                      className="btn-primary text-xs py-1.5 px-3">
                {changing ? t('common.cancel') : t('billing.changePlan')}
              </button>
            )}
            <div className="mt-2 flex gap-2 flex-wrap justify-end">
              <a href={`mailto:${SUPPORT.supportEmail}`} className="btn-secondary text-xs py-1.5 px-3">Email Support</a>
              <a href={waLinkTo("Hello, I would like to upgrade or renew my MauzoHalisi plan.")} target="_blank" rel="noreferrer" className="btn-secondary text-xs py-1.5 px-3">WhatsApp</a>
            </div>
          </div>
        </div>
        {changing && (
          <div className="mt-5 pt-5 border-t border-stone-100">
            <PayForPlan onPaid={changed} />
          </div>
        )}

        {/* Plan comparison */}
        <div className="mt-5 pt-5 border-t border-stone-100 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(billing?.plans ?? [])
            // Starter is the free trial everyone starts on and cannot be
            // bought or returned to. Once an account has moved off it, showing
            // it is an option they do not have.
            .filter(p => p.plan !== 'STARTER' || info?.subscriptionPlan === 'STARTER')
            .map(plan => {
            const isCurrent = info?.subscriptionPlan === plan.plan;
            return (
              <div key={plan.plan} className={`p-3 rounded-xl border-2 ${isCurrent ? 'border-primary-400 bg-primary-50' : 'border-stone-100'}`}>
                <p className="text-xs font-bold text-stone-900 mb-0.5">{plan.label}</p>
                <p className="text-xs text-primary-700 font-semibold mb-1">{planPrice(plan)}</p>
                <p className="text-[10px] text-stone-400">
                  {planLimit(plan.limits.shops, 'shop', 'shops')}<br />
                  {planLimit(plan.limits.staff, 'staff account', 'staff accounts')}
                </p>
                {isCurrent && <p className="text-[10px] text-primary-600 font-semibold mt-1">✓ {t('billing.currentPlan')}</p>}
                {/* Enterprise has no price to pay online, so the card has to go
                    somewhere rather than sit there as a dead end. The message
                    is written for them, naming the business and the plan they
                    are on, so support has the context without asking. */}
                {!isCurrent && plan.monthlyPrice === null && (
                  <div className="mt-2 flex flex-col gap-1">
                    <a
                      href={waLinkTo(enterpriseEnquiry)}
                      target="_blank" rel="noreferrer"
                      className="text-[10px] font-semibold text-primary-600 hover:underline"
                    >
                      {t('billing.talkToUs')} →
                    </a>
                    <a
                      href={`mailto:${SUPPORT.supportEmail}?subject=${encodeURIComponent(enterpriseSubject)}&body=${encodeURIComponent(enterpriseEnquiry)}`}
                      className="text-[10px] text-stone-400 hover:text-stone-600 hover:underline"
                    >
                      {t('billing.orEmailUs')}
                    </a>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Contact verification.

          The screen after sign-up could be skipped and never reopened, so an
          owner who tapped "Do this later" had no way back to it. This is that
          way back, and it also lets someone verify a number they changed. */}
      {verifyPending > 0 && (
        <div className="card p-6">
          <div className="mb-5 flex items-center gap-2">
            <ShieldCheck size={16} className="text-primary-600" />
            <h3 className="text-sm font-bold text-stone-900">{t('auth.verifyContactsTitle')}</h3>
          </div>
          <p className="mb-5 text-xs text-stone-500">{t('auth.verifyContactsHelp')}</p>
          <ContactVerification onChange={(s) => setVerifyPending(pendingCount(s))} />
        </div>
      )}

      {/* Security */}
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-5">
          <Shield size={16} className="text-primary-600" />
          <h3 className="text-sm font-bold text-stone-900">Security</h3>
        </div>
        <div className="space-y-3">
          <a href="/admin/users" className="flex items-center justify-between p-3 border border-stone-200 rounded-lg hover:border-stone-300 transition-colors">
            <div>
              <p className="text-sm font-medium text-stone-900">Manage Staff & Roles</p>
              <p className="text-xs text-stone-400">Add, edit or deactivate staff accounts</p>
            </div>
            <span className="text-stone-400">→</span>
          </a>
          <a href="/admin/tax-rules" className="flex items-center justify-between p-3 border border-stone-200 rounded-lg hover:border-stone-300 transition-colors">
            <div>
              <p className="text-sm font-medium text-stone-900">Tax Rules</p>
              <p className="text-xs text-stone-400">Configure VAT and other tax rates</p>
            </div>
            <span className="text-stone-400">→</span>
          </a>
        </div>
      </div>
    </div>
  );
}
