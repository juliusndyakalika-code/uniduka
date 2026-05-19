import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { CheckCircle2, ChevronRight, ChevronLeft, Store, MapPin, Layers, Loader2 } from 'lucide-react';
import api from '../../api/client';
import { useAuthStore } from '../../store/authStore';

const STEPS = [
  { num: 1, label: 'Shop Identity', icon: <Store size={16} /> },
  { num: 2, label: 'Location',      icon: <MapPin size={16} /> },
  { num: 3, label: 'Business Type', icon: <Layers size={16} /> },
];

const BUSINESS_TYPES = [
  { value: 'RETAIL_STORE',        label: 'Retail Store',             group: 'A — Retail & Commerce',       desc: 'General merchandise, clothing, electronics, hardware' },
  { value: 'WHOLESALE_B2B',       label: 'Wholesale / B2B',          group: 'A — Retail & Commerce',       desc: 'Distributors, importers, trade suppliers' },
  { value: 'GROCERY_SUPERMARKET', label: 'Grocery / Supermarket',    group: 'A — Retail & Commerce',       desc: 'Fresh produce, packaged goods, dairy, bakery' },
  { value: 'PHARMACY_CHEMIST',    label: 'Pharmacy / Chemist',       group: 'A — Retail & Commerce',       desc: 'Prescription & OTC medicines, health supplements' },
  { value: 'RESTAURANT',          label: 'Restaurant / Full-Service', group: 'B — Food & Beverage',         desc: 'Sit-down, fine dining, family restaurant, cafeteria' },
  { value: 'CAFE_QSR',            label: 'Café / Quick Service',      group: 'B — Food & Beverage',         desc: 'Coffee shop, fast food, juice bar, takeaway' },
  { value: 'BAR_NIGHTCLUB',       label: 'Bar / Nightclub',          group: 'B — Food & Beverage',         desc: 'Bar, pub, nightclub, lounge, event bar' },
  { value: 'SALON_SPA',           label: 'Salon / Barbershop / Spa', group: 'C — Services & Appointments', desc: 'Hair, nails, beauty, barbershop, wellness' },
  { value: 'CLINIC_MEDICAL',      label: 'Clinic / Medical Practice', group: 'C — Services & Appointments', desc: 'GP, dental, physio, optometry, veterinary' },
  { value: 'REPAIR_WORKSHOP',     label: 'Repair & Service Workshop', group: 'C — Services & Appointments', desc: 'Auto repair, electronics, plumbing, electrical' },
  { value: 'HOTEL_GUESTHOUSE',    label: 'Hotel / Guesthouse',       group: 'D — Hospitality & Lodging',   desc: 'Hotel, guesthouse, serviced apartment, lodge' },
];

const GROUP_COLORS: Record<string, string> = {
  'A — Retail & Commerce':       'bg-blue-50 border-blue-200 text-blue-700',
  'B — Food & Beverage':         'bg-emerald-50 border-emerald-200 text-emerald-700',
  'C — Services & Appointments': 'bg-amber-50 border-amber-200 text-amber-700',
  'D — Hospitality & Lodging':   'bg-purple-50 border-purple-200 text-purple-700',
};

interface WizardForm {
  tradingName: string; legalName: string; contactEmail: string; phone: string; address: string;
  country: string; city: string; currency: string; timezone: string;
}

export default function SetupWizard() {
  const navigate = useNavigate();
  const { setShopId: storeSetShopId, account } = useAuthStore();
  const { register, getValues, formState: { errors }, trigger } = useForm<WizardForm>({
    defaultValues: { country: 'TZ', currency: 'TZS', timezone: 'Africa/Dar_es_Salaam', city: 'Dar es Salaam' },
  });

  const [step, setStep]               = useState(1);
  const [businessType, setBusinessType] = useState('');
  const [profile, setProfile]         = useState<{ modules: { key: string }[]; units: { abbreviation: string }[] } | null>(null);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');

  const groups = Array.from(new Set(BUSINESS_TYPES.map(b => b.group)));

  async function selectBusinessType(type: string) {
    setBusinessType(type);
    try {
      const res = await api.get(`/business/${type}`);
      setProfile(res.data.data);
    } catch { /* profile preview optional */ }
  }

  async function handleNext() {
    setError('');

    // Validate step 1 fields before moving on
    if (step === 1) {
      const ok = await trigger('tradingName');
      if (!ok) return;
      setStep(2);
      return;
    }

    if (step === 2) {
      setStep(3);
      return;
    }

    // Step 3 — create the shop
    if (step === 3) {
      if (!businessType) { setError('Please select a business type'); return; }
      setLoading(true);
      try {
        const vals = getValues();
        const res = await api.post('/shops', {
          tradingName:  vals.tradingName,
          legalName:    vals.legalName    || undefined,
          contactEmail: vals.contactEmail || undefined,
          phone:        vals.phone        || undefined,
          addressLine1: vals.address      || undefined,
          businessType,
          country:  vals.country,
          city:     vals.city     || undefined,
          timezone: vals.timezone,
          currency: vals.currency,
        });
        const { shop, accessToken } = res.data.data;

        // Mark wizard complete immediately — all config is seeded from the business profile
        await api.post(`/shops/${shop.id}/wizard`, { step: 8, data: {} });

        storeSetShopId(shop.id, accessToken);

        // If subscription is not yet active, go to pending page; otherwise dashboard
        navigate(account?.subscriptionActive ? '/dashboard' : '/pending', { replace: true });
      } catch (e: unknown) {
        setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Something went wrong. Please try again.');
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <div className="min-h-screen bg-[#F8F5F0] p-4 sm:p-8">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 mb-3">
            <svg width="24" height="28" viewBox="0 0 56 64" fill="none">
              <rect x="4" y="4" width="48" height="40" rx="6" fill="#a66624"/>
              <rect x="14" y="16" width="8" height="14" rx="2" fill="white" opacity="0.9"/>
              <rect x="24" y="16" width="8" height="14" rx="2" fill="white" opacity="0.9"/>
              <rect x="34" y="16" width="8" height="14" rx="2" fill="white" opacity="0.9"/>
              <path d="M20 44 L28 58 L36 44" fill="#a66624"/>
            </svg>
            <span className="text-xl font-bold">Uni<span className="font-light text-primary-600">Duka</span></span>
          </div>
          <h1 className="text-2xl font-bold text-stone-900">Register Your Shop</h1>
          <p className="text-sm text-stone-400 mt-1">Step {step} of 3 — {STEPS[step - 1].label}</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {STEPS.map((s) => (
            <div key={s.num} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-all ${
                step > s.num  ? 'bg-primary-600 border-primary-600 text-white' :
                step === s.num ? 'bg-primary-600 border-primary-600 text-white' :
                                 'bg-white border-stone-300 text-stone-400'
              }`}>
                {step > s.num ? <CheckCircle2 size={14} /> : s.num}
              </div>
              {s.num < STEPS.length && (
                <div className={`w-16 h-0.5 ${step > s.num ? 'bg-primary-400' : 'bg-stone-200'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className="card p-6 sm:p-8">
          {error && (
            <div className="mb-5 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              {error}
            </div>
          )}

          {/* ── Step 1: Shop Identity ── */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-bold text-stone-900 mb-1">Shop Identity</h2>
                <p className="text-xs text-stone-400">Basic details for your shop. You can update these any time from Shop Settings.</p>
              </div>
              <div className="grid sm:grid-cols-2 gap-5">
                <div className="sm:col-span-2">
                  <label className="label">Trading Name <span className="text-red-500">*</span></label>
                  <input
                    {...register('tradingName', { required: 'Trading name is required' })}
                    className="input"
                    placeholder="e.g. Mama Ntilie Fresh"
                    autoFocus
                  />
                  {errors.tradingName && <p className="mt-1 text-xs text-red-600">{errors.tradingName.message}</p>}
                </div>
                <div>
                  <label className="label">Legal / Registered Name</label>
                  <input {...register('legalName')} className="input" placeholder="e.g. Mama Ntilie Catering Ltd" />
                </div>
                <div>
                  <label className="label">Contact Email</label>
                  <input {...register('contactEmail')} type="email" className="input" placeholder="shop@example.com" />
                </div>
                <div>
                  <label className="label">Phone</label>
                  <input {...register('phone')} type="tel" className="input" placeholder="+255 7XX XXX XXX" />
                </div>
                <div>
                  <label className="label">Physical Address</label>
                  <input {...register('address')} className="input" placeholder="Kimathi Street, Nairobi CBD" />
                </div>
              </div>
            </div>
          )}

          {/* ── Step 2: Location ── */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-bold text-stone-900 mb-1">Location & Currency</h2>
                <p className="text-xs text-stone-400">Sets your tax region, receipt currency, and business hours timezone.</p>
              </div>
              <div className="grid sm:grid-cols-2 gap-5">
                <div>
                  <label className="label">Country</label>
                  <select {...register('country')} className="select">
                    <option value="TZ">Tanzania</option>
                    <option value="KE">Kenya</option>
                    <option value="UG">Uganda</option>
                    <option value="RW">Rwanda</option>
                    <option value="ZA">South Africa</option>
                    <option value="NG">Nigeria</option>
                    <option value="GH">Ghana</option>
                    <option value="US">United States</option>
                    <option value="GB">United Kingdom</option>
                  </select>
                </div>
                <div>
                  <label className="label">City</label>
                  <input {...register('city')} className="input" placeholder="Dar es Salaam" />
                </div>
                <div>
                  <label className="label">Currency</label>
                  <select {...register('currency')} className="select">
                    <option value="TZS">TZS — Tanzanian Shilling</option>
                    <option value="KES">KES — Kenyan Shilling</option>
                    <option value="UGX">UGX — Ugandan Shilling</option>
                    <option value="USD">USD — US Dollar</option>
                    <option value="EUR">EUR — Euro</option>
                    <option value="GBP">GBP — British Pound</option>
                    <option value="ZAR">ZAR — South African Rand</option>
                    <option value="NGN">NGN — Nigerian Naira</option>
                    <option value="GHS">GHS — Ghanaian Cedi</option>
                  </select>
                </div>
                <div>
                  <label className="label">Timezone</label>
                  <select {...register('timezone')} className="select">
                    <option value="Africa/Dar_es_Salaam">Africa/Dar_es_Salaam (EAT +3)</option>
                    <option value="Africa/Nairobi">Africa/Nairobi (EAT +3)</option>
                    <option value="Africa/Kampala">Africa/Kampala (EAT +3)</option>
                    <option value="Africa/Lagos">Africa/Lagos (WAT +1)</option>
                    <option value="Africa/Johannesburg">Africa/Johannesburg (SAST +2)</option>
                    <option value="Europe/London">Europe/London (GMT/BST)</option>
                    <option value="America/New_York">America/New_York (EST/EDT)</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* ── Step 3: Business Type ── */}
          {step === 3 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-bold text-stone-900 mb-1">Business Type</h2>
                <p className="text-xs text-stone-400 mb-2">
                  Choosing a type loads a pre-built configuration — inventory model, modules, units, and tax defaults.
                  This cannot be changed after setup.
                </p>
              </div>

              {groups.map(group => (
                <div key={group}>
                  <span className={`inline-flex px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest rounded-sm border mb-2 ${GROUP_COLORS[group]}`}>
                    {group}
                  </span>
                  <div className="grid sm:grid-cols-2 gap-2">
                    {BUSINESS_TYPES.filter(b => b.group === group).map(bt => (
                      <button
                        key={bt.value}
                        type="button"
                        onClick={() => selectBusinessType(bt.value)}
                        className={`text-left p-3 rounded-lg border-2 transition-all ${
                          businessType === bt.value
                            ? 'border-primary-600 bg-primary-50'
                            : 'border-stone-200 hover:border-stone-400 bg-white'
                        }`}
                      >
                        <p className="text-sm font-semibold text-stone-900">{bt.label}</p>
                        <p className="text-xs text-stone-400 mt-0.5">{bt.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              {businessType && profile && (
                <div className="p-4 bg-stone-50 border border-stone-200 rounded-lg">
                  <p className="text-xs font-semibold text-stone-500 uppercase tracking-widest mb-2">What gets configured automatically</p>
                  <p className="text-xs text-stone-600"><span className="font-medium">Modules:</span> {profile.modules.map(m => m.key.replace(/_/g, ' ')).join(', ')}</p>
                  <p className="text-xs text-stone-600 mt-1"><span className="font-medium">Units:</span> {profile.units.map(u => u.abbreviation).join(', ')}</p>
                  <p className="text-xs text-stone-400 mt-2">You can adjust modules, tax rules, and units from Shop Settings after setup.</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-6">
          <button
            type="button"
            onClick={() => setStep(s => s - 1)}
            disabled={step === 1}
            className="btn-secondary flex items-center gap-2 disabled:opacity-30"
          >
            <ChevronLeft size={14} /> Back
          </button>

          <span className="text-xs text-stone-400">{step} / 3</span>

          <button
            type="button"
            onClick={handleNext}
            disabled={loading || (step === 3 && !businessType)}
            className="btn-primary flex items-center gap-2 min-w-[120px] justify-center"
          >
            {loading
              ? <><Loader2 size={14} className="animate-spin" /> Creating…</>
              : step === 3
                ? 'Launch Shop'
                : <> Continue <ChevronRight size={14} /></>
            }
          </button>
        </div>
      </div>
    </div>
  );
}
