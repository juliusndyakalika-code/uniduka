import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Building2, CreditCard, Shield } from 'lucide-react';
import api from '../../api/client';
import { useAuthStore } from '../../store/authStore';

interface AccountInfo {
  id: string; legalName: string; tradingName?: string; email?: string; phone?: string;
  country?: string; plan: string; planExpiresAt?: string;
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

  const { mutate: upgrade } = useMutation({
    mutationFn: (plan: string) => api.post('/tenant/upgrade', { plan }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['account'] }),
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
          <h3 className="text-sm font-bold text-stone-900">Subscription Plan</h3>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {PLANS.map(plan => {
            const isCurrent = info?.plan === plan.key;
            return (
              <div
                key={plan.key}
                className={`p-4 border-2 rounded-xl ${isCurrent ? 'border-primary-400 bg-primary-50' : 'border-stone-200'}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-bold text-stone-900">{plan.label}</p>
                  {isCurrent && <span className="badge badge-amber text-xs">Current</span>}
                </div>
                <p className="text-lg font-bold text-primary-700 mb-1">{plan.price}</p>
                <p className="text-xs text-stone-400">
                  {plan.shops === -1 ? 'Unlimited shops' : `${plan.shops} shop${plan.shops > 1 ? 's' : ''}`} ·{' '}
                  {plan.staff === -1 ? 'Unlimited staff' : `${plan.staff} staff`}
                </p>
                {!isCurrent && plan.key !== 'ENTERPRISE' && (
                  <button
                    onClick={() => upgrade(plan.key)}
                    className="btn-primary text-xs px-3 py-1.5 mt-3"
                  >
                    Upgrade
                  </button>
                )}
                {plan.key === 'ENTERPRISE' && !isCurrent && (
                  <p className="text-xs text-stone-400 mt-3">Contact sales</p>
                )}
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
