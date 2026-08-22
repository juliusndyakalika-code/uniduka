import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import LanguageToggle from '../../components/ui/LanguageToggle';
import { LogoMark } from '../../components/ui/Logo';

interface Form { fullName: string; legalName: string; email: string; phone?: string; password: string; confirmPassword: string; }

export default function RegisterPage() {
  const { register, handleSubmit, watch, formState: { errors } } = useForm<Form>();
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function onSubmit(data: Form) {
    setLoading(true); setError('');
    try {
      const res = await api.post('/auth/register', data);
      const { accessToken, refreshToken, user, account } = res.data.data;
      setAuth(accessToken, user, account, undefined, refreshToken);
      navigate('/setup/wizard');
    } catch (e: unknown) {
      setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Registration failed');
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen bg-[#F8F5F0] flex items-center justify-center px-4 py-8 relative">
      <div className="absolute top-4 right-4">
        <LanguageToggle />
      </div>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2.5 mb-2">
            <LogoMark size={28} />
            <span className="text-2xl font-bold tracking-tight">Mauzo<span className="text-primary-600">Halisi</span></span>
          </div>
        </div>

        <div className="card p-8">
          <h2 className="text-lg font-bold text-stone-900 mb-1">{t('auth.registerTitle')}</h2>
          <p className="text-xs text-stone-400 mb-6">Start managing your business today</p>

          {error && <div className="mb-4 px-3 py-2.5 bg-red-50 border border-red-200 rounded-sm text-xs text-red-700">{error}</div>}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div>
              <label className="label">{t('auth.fullName')}</label>
              <input {...register('fullName', { required: true })} className="input" placeholder="Amina Hassan" />
              {errors.fullName && <p className="mt-1 text-xs text-red-600">{t('common.required')}</p>}
            </div>
            <div>
              <label className="label">{t('auth.businessName')}</label>
              <input {...register('legalName', { required: true })} className="input" placeholder="Mwangaza Enterprises Ltd" />
              {errors.legalName && <p className="mt-1 text-xs text-red-600">{t('common.required')}</p>}
            </div>
            <div>
              <label className="label">{t('auth.email')}</label>
              <input {...register('email', { required: true, pattern: /\S+@\S+\.\S+/ })} type="email" className="input" placeholder={t('auth.emailPlaceholder')} />
              {errors.email && <p className="mt-1 text-xs text-red-600">{t('auth.invalidEmail')}</p>}
            </div>
            <div>
              <label className="label">Phone (optional)</label>
              <input {...register('phone')} type="tel" className="input" placeholder="+255 7XX XXX XXX" />
            </div>
            <div>
              <label className="label">{t('auth.password')}</label>
              <input {...register('password', { required: true, minLength: 8 })} type="password" className="input" placeholder={t('auth.passwordPlaceholder')} />
              {errors.password && <p className="mt-1 text-xs text-red-600">Min. 8 characters required</p>}
            </div>
            <div>
              <label className="label">{t('auth.confirmPassword')}</label>
              <input {...register('confirmPassword', { required: true, validate: v => v === watch('password') || 'Passwords do not match' })} type="password" className="input" placeholder="Re-enter password" />
              {errors.confirmPassword && <p className="mt-1 text-xs text-red-600">{errors.confirmPassword.message}</p>}
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? <Loader2 size={14} className="animate-spin" /> : t('auth.register')}
            </button>
          </form>

          <p className="text-center text-xs text-stone-400 mt-6">
            {t('auth.haveAccount')}{' '}
            <Link to="/login" className="text-primary-600 font-semibold hover:underline">{t('auth.signInLink')}</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
