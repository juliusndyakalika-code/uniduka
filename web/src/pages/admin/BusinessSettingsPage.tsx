import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Building2, CreditCard, Shield, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import api from '../../api/client';
import { useAuthStore } from '../../store/authStore';

interface AccountInfo {
  id: string; legalName: string; tradingName?: string; email?: string; phone?: string;
  country?: string; subscriptionPlan: string; subscriptionExpiresAt?: string | null;
  subscriptionActive: boolean; daysRemaining: number | null;
}
interface Form { legalName: string; tradingName?: string; email?: string; phone?: string; }

const PLANS = [
  { key: 'STARTER', label: 'Starter', price: 'Free', shops: 1, staff: 3 },
  { key: 'GROWTH', label: 'Growth', price: 'TZS 65,000/mo', shops: 3, staff: 15 },
  { key: 'BUSINESS', label: 'Business', price: 'TZS 195,000/mo', shops: 10, staff: 100 },
  { key: 'ENTERPRISE', label: 'Enterprise', price: 'Custom', shops: -1, staff: -1 },
];

export default function BusinessSettingsPage() {
  const { account } = useAuthStore();
  const qc = useQueryClient();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const { register, handleSubmit, reset } = useForm<Form>();

  const { data: info } = useQuery<AccountInfo>({
    queryKey: ['account'],
    queryFn: () => api.get('/tenant/').then(r => r.data.data),
  });

  useEffect(() => {
    if (info) reset({ legalName: info.legalName, tradingName: info.tradingName, email: info.email, phone: info.phone });
  }, [info, reset]);

  const { mutate: update, isPending } = useMutation({
    mutationFn: (d: Form) => api.patch('/tenant/', d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['account'] }); setSaved(true); setTimeout(() => setSaved(false), 3000); },
    onError: (e: unknown) => setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed'),
  });


  return (
    <div className="space-y-6 max-w-2xl">
      <div className="page-header">
        <h1 className="page-title">Business Settings</h1>
      </div>

      {/* Business info */}
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-5">
          <Building2 size={16} className="text-primary-600" />
          <h3 className="text-sm font-bold text-stone-900">Business Information</h3>
        </div>
        {error && <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">{error}</div>}
        {saved && <div className="mb-4 px-3 py-2 bg-green-50 border border-green-200 rounded text-xs text-green-700">Changes saved!</div>}
        <form onSubmit={handleSubmit(d => update(d))} className="space-y-4">
          <div>
            <label className="label">Legal Name</label>
            <input {...register('legalName', { required: true })} className="input" />
          </div>
          <div>
            <label className="label">Trading Name</label>
            <input {...register('tradingName')} className="input" placeholder="Optional, shown on receipts" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Email</label>
              <input {...register('email')} type="email" className="input" />
            </div>
            <div>
              <label className="label">Phone</label>
              <input {...register('phone')} type="tel" className="input" />
            </div>
          </div>
          <button type="submit" disabled={isPending} className="btn-primary">
            {isPending ? 'Saving…' : 'Save Changes'}
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
            <p className="text-xs text-stone-500 mb-2">To upgrade or renew your plan, contact support:</p>
            <div className="flex gap-2 flex-wrap justify-end">
              <a href="mailto:support@mauzosmart.com" className="btn-secondary text-xs py-1.5 px-3">Email Support</a>
              <a href="https://wa.me/255700000000" target="_blank" rel="noreferrer" className="btn-primary text-xs py-1.5 px-3">WhatsApp</a>
            </div>
          </div>
        </div>
        {/* Plan comparison */}
        <div className="mt-5 pt-5 border-t border-stone-100 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {PLANS.map(plan => {
            const isCurrent = info?.subscriptionPlan === plan.key;
            return (
              <div key={plan.key} className={`p-3 rounded-xl border-2 ${isCurrent ? 'border-primary-400 bg-primary-50' : 'border-stone-100'}`}>
                <p className="text-xs font-bold text-stone-900 mb-0.5">{plan.label}</p>
                <p className="text-xs text-primary-700 font-semibold mb-1">{plan.price}</p>
                <p className="text-[10px] text-stone-400">
                  {plan.shops === -1 ? 'Unlimited shops' : `${plan.shops} shop${plan.shops > 1 ? 's' : ''}`}<br />
                  {plan.staff === -1 ? 'Unlimited staff' : `${plan.staff} staff`}
                </p>
                {isCurrent && <p className="text-[10px] text-primary-600 font-semibold mt-1">✓ Current plan</p>}
              </div>
            );
          })}
        </div>
      </div>

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
