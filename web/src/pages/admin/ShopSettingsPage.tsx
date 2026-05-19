import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Store, MapPin, Layers, Receipt, Package, Check, Plus, Trash2, ShieldCheck } from 'lucide-react';
import api from '../../api/client';
import { useAuthStore } from '../../store/authStore';

interface ShopConfig {
  id: string; tradingName: string; legalName?: string; contactEmail?: string; phone?: string;
  addressLine1?: string; city?: string; country?: string; currency: string; timezone: string;
  businessType: string; inventoryModel: string; pricingMode: string; taxMode: string;
  tin?: string; vrn?: string;
  wizardCompleted: boolean; configScore?: number;
  shopModules: { moduleKey: string; enabled: boolean; required: boolean }[];
  unitProfiles: { id: string; name: string; abbreviation: string; dimension: string }[];
  taxRules: { id: string; name: string; rate: number; isDefault: boolean }[];
}
interface ShopForm {
  tradingName: string; legalName: string; contactEmail: string; phone: string;
  addressLine1: string; city: string; country: string; currency: string; timezone: string;
}
interface TraForm { tin: string; vrn: string; }
interface TaxForm { name: string; rate: number; isDefault: boolean; }

const CURRENCIES = ['TZS','KES','UGX','USD','EUR','GBP','ZAR','NGN','GHS'];
const TIMEZONES  = [
  'Africa/Dar_es_Salaam','Africa/Nairobi','Africa/Kampala',
  'Africa/Lagos','Africa/Johannesburg','Europe/London','America/New_York',
];

export default function ShopSettingsPage() {
  const { shopId } = useAuthStore();
  const qc = useQueryClient();
  const [saved, setSaved]   = useState(false);
  const [error, setError]   = useState('');
  const [taxForm, setTaxForm] = useState(false);

  const { register: reg, handleSubmit, reset } = useForm<ShopForm>();
  const { register: regTax, handleSubmit: handleTax, reset: resetTax } = useForm<TaxForm>({
    defaultValues: { rate: 16, isDefault: false },
  });
  const { register: regTra, handleSubmit: handleTra, reset: resetTra } = useForm<TraForm>();

  const { data: config, isLoading } = useQuery<ShopConfig>({
    queryKey: ['shop-config', shopId],
    queryFn: () => api.get(`/shops/${shopId}/config`).then(r => r.data.data.shop),
    enabled: !!shopId,
  });

  useEffect(() => {
    if (config) {
      reset({
        tradingName: config.tradingName, legalName: config.legalName ?? '',
        contactEmail: config.contactEmail ?? '', phone: config.phone ?? '',
        addressLine1: config.addressLine1 ?? '', city: config.city ?? '',
        country: config.country ?? 'TZ', currency: config.currency, timezone: config.timezone,
      });
      resetTra({ tin: config.tin ?? '', vrn: config.vrn ?? '' });
    }
  }, [config, reset, resetTra]);

  const { mutate: save, isPending } = useMutation({
    mutationFn: (d: ShopForm) => api.put(`/shops/${shopId}`, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shop-config', shopId] });
      qc.invalidateQueries({ queryKey: ['shop-detail', shopId] });
      setSaved(true); setError('');
      setTimeout(() => setSaved(false), 3000);
    },
    onError: (e: unknown) => setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed'),
  });

  const { mutate: saveTra, isPending: savingTra } = useMutation({
    mutationFn: (d: TraForm) => api.put(`/shops/${shopId}`, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shop-config', shopId] });
      qc.invalidateQueries({ queryKey: ['shop-detail', shopId] });
      setSaved(true); setError('');
      setTimeout(() => setSaved(false), 3000);
    },
    onError: (e: unknown) => setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed'),
  });

  const { mutate: toggleModule } = useMutation({
    mutationFn: ({ key, enabled }: { key: string; enabled: boolean }) =>
      api.post(`/shops/${shopId}/wizard`, { step: 5, data: { modules: [{ key, enabled, required: false }] } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shop-config', shopId] }),
  });

  const { mutate: addTax } = useMutation({
    mutationFn: (d: TaxForm) => api.post(`/shops/${shopId}/wizard`, {
      step: 6, data: { taxRules: [{ name: d.name, rate: Number(d.rate), isDefault: d.isDefault }] },
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['shop-config', shopId] }); setTaxForm(false); resetTax(); },
  });

  const { mutate: deleteTax } = useMutation({
    mutationFn: (id: string) => api.delete(`/shops/${shopId}/tax-rules/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shop-config', shopId] }),
  });

  if (isLoading) return <div className="card p-8 text-center text-stone-400">Loading…</div>;
  if (!config)   return <div className="card p-8 text-center text-stone-400">No shop selected</div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="page-header">
        <h1 className="page-title">Shop Settings</h1>
        <p className="page-subtitle">{config.tradingName}</p>
      </div>

      {/* Identity */}
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-5">
          <Store size={16} className="text-primary-600" />
          <h3 className="text-sm font-bold text-stone-900">Shop Identity</h3>
        </div>
        {error && <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">{error}</div>}
        {saved && <div className="mb-4 px-3 py-2 bg-green-50 border border-green-200 rounded text-xs text-green-700">Saved!</div>}
        <form onSubmit={handleSubmit(d => save(d))} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Trading Name *</label>
              <input {...reg('tradingName', { required: true })} className="input" />
            </div>
            <div>
              <label className="label">Legal Name</label>
              <input {...reg('legalName')} className="input" />
            </div>
            <div>
              <label className="label">Contact Email</label>
              <input {...reg('contactEmail')} type="email" className="input" />
            </div>
            <div>
              <label className="label">Phone</label>
              <input {...reg('phone')} className="input" />
            </div>
            <div className="col-span-2">
              <label className="label">Address</label>
              <input {...reg('addressLine1')} className="input" placeholder="Street address" />
            </div>
          </div>
          <button type="submit" disabled={isPending} className="btn-primary">
            {isPending ? 'Saving…' : 'Save Changes'}
          </button>
        </form>
      </div>

      {/* TRA Compliance */}
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck size={16} className="text-primary-600" />
          <h3 className="text-sm font-bold text-stone-900">TRA Compliance</h3>
        </div>
        <p className="text-xs text-stone-400 mb-5">
          Your TIN is printed on every receipt. VRN is required only for VAT-registered businesses.
        </p>

        {!config.tin && (
          <div className="mb-4 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 flex items-start gap-2">
            <span className="font-bold mt-0.5">⚠</span>
            <span>TIN is missing — receipts will show a warning. Enter your TIN from TRA to comply.</span>
          </div>
        )}

        <form onSubmit={handleTra(d => saveTra(d))} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">
                TIN <span className="text-red-500">*</span>
                <span className="text-stone-400 font-normal text-[10px] ml-1">(Taxpayer ID)</span>
              </label>
              <input
                {...regTra('tin')}
                className="input font-mono tracking-widest"
                placeholder="e.g. 100-000-000"
              />
            </div>
            <div>
              <label className="label">
                VRN
                <span className="text-stone-400 font-normal text-[10px] ml-1">(VAT Reg. No. — optional)</span>
              </label>
              <input
                {...regTra('vrn')}
                className="input font-mono"
                placeholder="e.g. 40-123456-A"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button type="submit" disabled={savingTra} className="btn-primary">
              {savingTra ? 'Saving…' : 'Save TRA Details'}
            </button>
            {saved && <span className="text-xs text-emerald-600 font-medium">Saved ✓</span>}
          </div>
        </form>
      </div>

      {/* Location */}
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-5">
          <MapPin size={16} className="text-primary-600" />
          <h3 className="text-sm font-bold text-stone-900">Location & Regional</h3>
        </div>
        <form onSubmit={handleSubmit(d => save(d))} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">City</label>
              <input {...reg('city')} className="input" />
            </div>
            <div>
              <label className="label">Country</label>
              <input {...reg('country')} className="input" placeholder="TZ" />
            </div>
            <div>
              <label className="label">Currency</label>
              <select {...reg('currency')} className="select">
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Timezone</label>
              <select {...reg('timezone')} className="select">
                {TIMEZONES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <button type="submit" disabled={isPending} className="btn-primary">
            {isPending ? 'Saving…' : 'Save Changes'}
          </button>
        </form>
      </div>

      {/* Business Type (read-only) */}
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-4">
          <Layers size={16} className="text-primary-600" />
          <h3 className="text-sm font-bold text-stone-900">Business Configuration</h3>
          <span className="text-xs text-stone-400 ml-auto">Read-only · contact platform admin to change</span>
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm">
          {[
            ['Business Type',    config.businessType.replace(/_/g, ' ')],
            ['Inventory Model',  config.inventoryModel.replace(/_/g, ' ')],
            ['Pricing Mode',     config.pricingMode.replace(/_/g, ' ')],
            ['Tax Mode',         config.taxMode.replace(/_/g, ' ')],
          ].map(([label, value]) => (
            <div key={label} className="p-3 bg-stone-50 rounded-lg">
              <p className="text-xs text-stone-400 mb-0.5">{label}</p>
              <p className="font-semibold text-stone-900 capitalize">{value.toLowerCase()}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Modules */}
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-4">
          <Package size={16} className="text-primary-600" />
          <h3 className="text-sm font-bold text-stone-900">Modules</h3>
        </div>
        <div className="space-y-2">
          {config.shopModules.map(m => (
            <div key={m.moduleKey} className="flex items-center justify-between p-3 border border-stone-200 rounded-lg">
              <div>
                <p className="text-sm font-medium text-stone-900">{m.moduleKey.replace(/_/g, ' ')}</p>
                {m.required && <span className="text-[10px] text-red-500 font-semibold uppercase">Required</span>}
              </div>
              <button
                type="button"
                disabled={m.required}
                onClick={() => toggleModule({ key: m.moduleKey, enabled: !m.enabled })}
                className={`relative w-10 h-5 rounded-full transition-colors disabled:opacity-40 ${m.enabled ? 'bg-primary-600' : 'bg-stone-300'}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${m.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Tax Rules */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Receipt size={16} className="text-primary-600" />
            <h3 className="text-sm font-bold text-stone-900">Tax Rules</h3>
          </div>
          <button onClick={() => setTaxForm(true)} className="btn-secondary text-xs flex items-center gap-1">
            <Plus size={12} /> Add Rule
          </button>
        </div>

        {taxForm && (
          <form onSubmit={handleTax(d => addTax(d))} className="mb-4 p-4 bg-stone-50 border border-stone-200 rounded-lg space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Name</label>
                <input {...regTax('name', { required: true })} className="input" placeholder="VAT 18%" />
              </div>
              <div>
                <label className="label">Rate (%)</label>
                <input {...regTax('rate', { required: true, min: 0, max: 100 })} type="number" step="0.01" className="input" />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input {...regTax('isDefault')} type="checkbox" className="accent-primary-600" />
              Set as default
            </label>
            <div className="flex gap-2">
              <button type="submit" className="btn-primary text-xs">Add</button>
              <button type="button" onClick={() => setTaxForm(false)} className="btn-secondary text-xs">Cancel</button>
            </div>
          </form>
        )}

        <div className="space-y-2">
          {config.taxRules.map(t => (
            <div key={t.id} className="flex items-center justify-between p-3 border border-stone-200 rounded-lg">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-stone-900">{t.name}</span>
                <span className="text-sm text-stone-500">{t.rate}%</span>
                {t.isDefault && (
                  <span className="flex items-center gap-0.5 text-[10px] text-emerald-600 font-semibold">
                    <Check size={10} /> Default
                  </span>
                )}
              </div>
              {!t.isDefault && (
                <button onClick={() => deleteTax(t.id)} className="text-stone-300 hover:text-red-500 transition-colors">
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
