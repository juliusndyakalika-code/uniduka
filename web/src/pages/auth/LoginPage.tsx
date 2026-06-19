import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import api from '../../api/client';
import { useAuthStore } from '../../store/authStore';

interface Form { email: string; password: string; totp?: string; }

export default function LoginPage() {
  const { register, handleSubmit, formState: { errors } } = useForm<Form>();
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [need2fa, setNeed2fa] = useState(false);

  async function onSubmit(data: Form) {
    setLoading(true); setError('');
    try {
      const res = await api.post('/auth/login', data);
      const { accessToken, user, account, shopId, require2fa } = res.data.data;
      if (require2fa) { setNeed2fa(true); setLoading(false); return; }
      setAuth(accessToken, user, account, shopId);
      navigate(user.role === 'PLATFORM_ADMIN' ? '/platform' : '/dashboard');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '';
      setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message || msg || 'Login failed');
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen bg-[#F8F5F0] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2.5 mb-4">
            <svg width="32" height="32" viewBox="0 0 40 40" fill="none">
              <rect width="40" height="40" rx="9" fill="#a66624"/>
              <rect x="6" y="27" width="7" height="9" rx="1.5" fill="white" opacity="0.6"/>
              <rect x="16.5" y="21" width="7" height="15" rx="1.5" fill="white" opacity="0.8"/>
              <rect x="27" y="14" width="7" height="22" rx="1.5" fill="white"/>
              <path d="M30.5 11 L30.5 6 M27.5 8.5 L30.5 5.5 L33.5 8.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="text-2xl font-bold tracking-tight">Mauzo<span className="font-light text-primary-600">Smart</span></span>
          </div>
          <p className="text-xs uppercase tracking-widest text-stone-400">Smart Sales Platform</p>
        </div>

        <div className="card p-8">
          <h2 className="text-lg font-bold text-stone-900 mb-1">Sign in</h2>
          <p className="text-xs text-stone-400 mb-6">Access your business dashboard</p>

          {error && (
            <div className="mb-4 px-3 py-2.5 bg-red-50 border border-red-200 rounded-sm text-xs text-red-700">{error}</div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div>
              <label className="label">Email address</label>
              <input
                {...register('email', { required: 'Email required', pattern: { value: /\S+@\S+\.\S+/, message: 'Invalid email' } })}
                type="email" className="input" placeholder="you@business.com" autoComplete="email"
              />
              {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
            </div>

            <div>
              <label className="label">Password</label>
              <div className="relative">
                <input
                  {...register('password', { required: 'Password required' })}
                  type={showPwd ? 'text' : 'password'} className="input pr-8" placeholder="••••••••" autoComplete="current-password"
                />
                <button type="button" onClick={() => setShowPwd(v => !v)} className="absolute right-0 top-2.5 text-stone-400 hover:text-stone-700">
                  {showPwd ? <EyeOff size={16}/> : <Eye size={16}/>}
                </button>
              </div>
              {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>}
            </div>

            {need2fa && (
              <div>
                <label className="label">2FA Code</label>
                <input {...register('totp')} type="text" inputMode="numeric" maxLength={6} className="input" placeholder="000000" />
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? <Loader2 size={14} className="animate-spin" /> : 'Sign In'}
            </button>
          </form>

          <p className="text-center text-xs text-stone-400 mt-6">
            No account?{' '}
            <Link to="/register" className="text-primary-600 font-semibold hover:underline">Create one</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
