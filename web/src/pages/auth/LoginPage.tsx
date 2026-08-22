import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import LanguageToggle from '../../components/ui/LanguageToggle';
import { LogoMark } from '../../components/ui/Logo';

interface Form { username: string; password: string; totp?: string; }

export default function LoginPage() {
  const { register, handleSubmit, formState: { errors } } = useForm<Form>();
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [need2fa, setNeed2fa] = useState(false);

  async function onSubmit(data: Form) {
    setLoading(true); setError('');
    try {
      const res = await api.post('/auth/login', data);
      const { accessToken, refreshToken, user, account, shopId, require2fa } = res.data.data;
      if (require2fa) { setNeed2fa(true); setLoading(false); return; }
      setAuth(accessToken, user, account, shopId, refreshToken);
      navigate(user.role === 'PLATFORM_ADMIN' ? '/platform' : '/dashboard');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '';
      setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message || msg || 'Login failed');
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen bg-[#F8F5F0] flex items-center justify-center px-4 relative">
      <div className="absolute top-4 right-4">
        <LanguageToggle />
      </div>
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2.5 mb-4">
            <LogoMark size={32} />
            <span className="text-2xl font-bold tracking-tight">Mauzo<span className="text-primary-600">Halisi</span></span>
          </div>
          <p className="text-xs uppercase tracking-widest text-stone-400">{t('auth.smartSalesPlatform')}</p>
        </div>

        <div className="card p-8">
          <h2 className="text-lg font-bold text-stone-900 mb-1">{t('auth.signInTitle')}</h2>
          <p className="text-xs text-stone-400 mb-6">{t('auth.signInSubtitle')}</p>

          {error && (
            <div className="mb-4 px-3 py-2.5 bg-red-50 border border-red-200 rounded-sm text-xs text-red-700">{error}</div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div>
              <label className="label">Email or Phone Number</label>
              <input
                {...register('username', { required: 'Email or phone number is required' })}
                type="text" className="input" placeholder="your@email.com or +255..." autoComplete="username"
              />
              {errors.username && <p className="mt-1 text-xs text-red-600">{errors.username.message}</p>}
            </div>

            <div>
              <label className="label">{t('auth.password')}</label>
              <div className="relative">
                <input
                  {...register('password', { required: t('auth.passwordRequired') })}
                  type={showPwd ? 'text' : 'password'} className="input pr-8" placeholder={t('auth.passwordPlaceholder')} autoComplete="current-password"
                />
                <button type="button" onClick={() => setShowPwd(v => !v)} className="absolute right-0 top-2.5 text-stone-400 hover:text-stone-700">
                  {showPwd ? <EyeOff size={16}/> : <Eye size={16}/>}
                </button>
              </div>
              {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>}
            </div>

            {need2fa && (
              <div>
                <label className="label">{t('auth.twoFactorCode')}</label>
                <input {...register('totp')} type="text" inputMode="numeric" maxLength={6} className="input" placeholder="000000" />
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? <Loader2 size={14} className="animate-spin" /> : t('auth.signIn')}
            </button>
          </form>

          <p className="text-center text-xs text-stone-400 mt-6">
            {t('auth.noAccount')}{' '}
            <Link to="/register" className="text-primary-600 font-semibold hover:underline">{t('auth.createOne')}</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
