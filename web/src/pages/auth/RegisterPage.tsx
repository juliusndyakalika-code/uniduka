import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Loader2 } from 'lucide-react';
import api from '../../api/client';
import { useAuthStore } from '../../store/authStore';

interface Form { fullName: string; legalName: string; email: string; phone?: string; password: string; confirmPassword: string; }

export default function RegisterPage() {
  const { register, handleSubmit, watch, formState: { errors } } = useForm<Form>();
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function onSubmit(data: Form) {
    setLoading(true); setError('');
    try {
      const res = await api.post('/auth/register', data);
      const { accessToken, user, account } = res.data.data;
      setAuth(accessToken, user, account);
      navigate('/setup/wizard');
    } catch (e: unknown) {
      setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Registration failed');
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen bg-[#F8F5F0] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2.5 mb-2">
            <svg width="28" height="28" viewBox="0 0 40 40" fill="none">
              <rect width="40" height="40" rx="9" fill="#a66624"/>
              <rect x="6" y="27" width="7" height="9" rx="1.5" fill="white" opacity="0.6"/>
              <rect x="16.5" y="21" width="7" height="15" rx="1.5" fill="white" opacity="0.8"/>
              <rect x="27" y="14" width="7" height="22" rx="1.5" fill="white"/>
              <path d="M30.5 11 L30.5 6 M27.5 8.5 L30.5 5.5 L33.5 8.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="text-2xl font-bold tracking-tight">Mauzo<span className="font-light text-primary-600">Smart</span></span>
          </div>
        </div>

        <div className="card p-8">
          <h2 className="text-lg font-bold text-stone-900 mb-1">Create account</h2>
          <p className="text-xs text-stone-400 mb-6">Start managing your business today</p>

          {error && <div className="mb-4 px-3 py-2.5 bg-red-50 border border-red-200 rounded-sm text-xs text-red-700">{error}</div>}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div>
              <label className="label">Your Full Name</label>
              <input {...register('fullName', { required: true })} className="input" placeholder="Amina Hassan" />
              {errors.fullName && <p className="mt-1 text-xs text-red-600">Required</p>}
            </div>
            <div>
              <label className="label">Business / Company Name</label>
              <input {...register('legalName', { required: true })} className="input" placeholder="Mwangaza Enterprises Ltd" />
              {errors.legalName && <p className="mt-1 text-xs text-red-600">Required</p>}
            </div>
            <div>
              <label className="label">Email</label>
              <input {...register('email', { required: true, pattern: /\S+@\S+\.\S+/ })} type="email" className="input" placeholder="you@business.com" />
              {errors.email && <p className="mt-1 text-xs text-red-600">Valid email required</p>}
            </div>
            <div>
              <label className="label">Phone (optional)</label>
              <input {...register('phone')} type="tel" className="input" placeholder="+255 7XX XXX XXX" />
            </div>
            <div>
              <label className="label">Password</label>
              <input {...register('password', { required: true, minLength: 8 })} type="password" className="input" placeholder="Min. 8 characters" />
              {errors.password && <p className="mt-1 text-xs text-red-600">Min. 8 characters required</p>}
            </div>
            <div>
              <label className="label">Confirm Password</label>
              <input {...register('confirmPassword', { required: true, validate: v => v === watch('password') || 'Passwords do not match' })} type="password" className="input" placeholder="Re-enter password" />
              {errors.confirmPassword && <p className="mt-1 text-xs text-red-600">{errors.confirmPassword.message}</p>}
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? <Loader2 size={14} className="animate-spin" /> : 'Create Account'}
            </button>
          </form>

          <p className="text-center text-xs text-stone-400 mt-6">
            Already have an account?{' '}
            <Link to="/login" className="text-primary-600 font-semibold hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
