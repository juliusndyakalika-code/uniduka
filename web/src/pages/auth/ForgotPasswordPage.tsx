import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Loader2, Eye, EyeOff, ArrowLeft, MessageSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { API_BASE } from '../../config';
import LanguageToggle from '../../components/ui/LanguageToggle';
import { LogoMark } from '../../components/ui/Logo';

/**
 * Password recovery by SMS code.
 *
 * Deliberately not the shared `api` client. That one attaches whatever token is
 * in storage and, on a 401, tries a refresh and then signs the user out. Nobody
 * on this screen has a session worth sending, and an expired one sitting in
 * storage would get them logged out mid-reset.
 */
const plain = axios.create({ baseURL: API_BASE });

type Step = 'phone' | 'code';

export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [step, setStep]         = useState<Step>('phone');
  const [phone, setPhone]       = useState('');
  const [username, setUsername] = useState('');
  const [code, setCode]         = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd]   = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [notice, setNotice]     = useState('');

  function readError(e: unknown): string {
    const res = (e as { response?: { data?: { message?: string } } })?.response;
    return res?.data?.message || t('auth.resetFailed');
  }

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(''); setNotice('');
    try {
      const res = await plain.post('/auth/password/forgot', { username, phone });
      // The reply is the same whether or not that number has an account, so
      // this screen cannot be used to find out who is registered. Moving to the
      // code step regardless is part of that: stopping here for an unknown
      // number would give the answer away just as plainly.
      setNotice(res.data?.data?.message || t('auth.codeSentIfRegistered'));
      setStep('code');
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      setError(status === 429 ? readError(e) : readError(e));
    } finally { setLoading(false); }
  }

  async function submitReset(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) { setError(t('auth.passwordTooShort')); return; }
    setLoading(true); setError('');
    try {
      await plain.post('/auth/password/reset', { username, phone, code, password });
      // No session comes back from a reset by design, so the only way on is to
      // sign in with the password they just chose.
      navigate('/login', { replace: true, state: { passwordReset: true } });
    } catch (e) {
      setError(readError(e));
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen bg-[#F8F5F0] flex items-center justify-center px-4 relative">
      <div className="absolute top-4 right-4"><LanguageToggle /></div>

      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2.5 mb-4">
            <LogoMark size={32} />
            <span className="text-2xl font-bold tracking-tight">Mauzo<span className="text-primary-600">Halisi</span></span>
          </div>
        </div>

        <div className="card p-8">
          <h1 className="text-xl font-bold mb-1">{t('auth.forgotPasswordTitle')}</h1>
          <p className="text-sm text-stone-500 mb-6">
            {step === 'phone' ? t('auth.forgotPasswordHelp') : t('auth.enterCodeHelp')}
          </p>

          {notice && (
            <div className="mb-4 flex gap-2 rounded-lg bg-primary-50 p-3 text-sm text-primary-800">
              <MessageSquare size={16} className="mt-0.5 shrink-0" />
              <span>{notice}</span>
            </div>
          )}
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
          )}

          {step === 'phone' ? (
            <form onSubmit={requestCode} className="space-y-4">
              {/* Both, and they have to belong to the same account. A phone
                  number is public enough to be on a shop sign; on its own it
                  was all anyone needed to put a live code on the owner's
                  handset. */}
              <div>
                <label htmlFor="username" className="label">{t('auth.resetUsername')}</label>
                <input
                  id="username" autoComplete="username" autoFocus
                  className="input" placeholder={t('auth.emailPlaceholder')}
                  value={username} onChange={(e) => setUsername(e.target.value)} required
                />
              </div>
              <div>
                <label htmlFor="phone" className="label">{t('auth.phoneNumber')}</label>
                <input
                  id="phone" type="tel" inputMode="tel" autoComplete="tel"
                  className="input" placeholder="0712 345 678"
                  value={phone} onChange={(e) => setPhone(e.target.value)} required
                />
                <p className="mt-1 text-[11px] text-stone-400">{t('auth.resetPhoneHint')}</p>
              </div>
              <button type="submit" className="btn-primary w-full"
                      disabled={loading || !phone.trim() || !username.trim()}>
                {loading ? <Loader2 size={18} className="animate-spin" /> : t('auth.sendCode')}
              </button>
            </form>
          ) : (
            <form onSubmit={submitReset} className="space-y-4">
              <div>
                <label htmlFor="code" className="label">{t('auth.verificationCode')}</label>
                <input
                  id="code" inputMode="numeric" autoComplete="one-time-code" autoFocus
                  maxLength={6} className="input tracking-[0.5em] text-center text-lg"
                  placeholder="••••••"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  required
                />
              </div>

              <div>
                <label htmlFor="password" className="label">{t('auth.newPassword')}</label>
                <div className="relative">
                  <input
                    id="password" type={showPwd ? 'text' : 'password'} autoComplete="new-password"
                    className="input pr-10" value={password}
                    onChange={(e) => setPassword(e.target.value)} required minLength={8}
                  />
                  <button
                    type="button" onClick={() => setShowPwd((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400"
                    aria-label={showPwd ? t('auth.hidePassword') : t('auth.showPassword')}
                  >
                    {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <p className="mt-1 text-xs text-stone-400">{t('auth.passwordMinHint')}</p>
              </div>

              <button
                type="submit" className="btn-primary w-full"
                disabled={loading || code.length < 6 || password.length < 8}
              >
                {loading ? <Loader2 size={18} className="animate-spin" /> : t('auth.resetPassword')}
              </button>

              <button
                type="button"
                onClick={() => { setStep('phone'); setCode(''); setError(''); setNotice(''); }}
                className="w-full text-sm text-stone-500 hover:text-stone-700"
              >
                {t('auth.useDifferentNumber')}
              </button>
            </form>
          )}
        </div>

        <Link to="/login" className="mt-6 flex items-center justify-center gap-1.5 text-sm text-stone-500 hover:text-stone-700">
          <ArrowLeft size={15} /> {t('auth.backToSignIn')}
        </Link>
      </div>
    </div>
  );
}
