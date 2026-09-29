import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Check, Mail, Smartphone } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import LanguageToggle from '../../components/ui/LanguageToggle';
import { LogoMark } from '../../components/ui/Logo';

interface Channel {
  verified: boolean;
  available: boolean;
  address?: string | null;
  number?: string | null;
}
interface Status { email: Channel; phone: Channel }

/**
 * Confirm the phone number and email address on a new account.
 *
 * Both codes were already sent when the account was created, so this screen
 * opens ready to accept them rather than making anyone ask first.
 *
 * It does not block the app. The codes are for reaching the owner about
 * payments and an expiring subscription, and locking someone out of the shop
 * they just signed up for because an SMS is slow would cost far more than the
 * unconfirmed number does. Anything still outstanding stays promptable later.
 */
export default function VerifyContactsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [status, setStatus]   = useState<Status | null>(null);
  const [phoneCode, setPhone] = useState('');
  const [emailCode, setEmail] = useState('');
  const [busy, setBusy]       = useState<'phone' | 'email' | null>(null);
  const [resent, setResent]   = useState<'phone' | 'email' | null>(null);
  const [errors, setErrors]   = useState<{ phone?: string; email?: string }>({});

  const load = useCallback(async () => {
    try {
      const res = await api.get('/auth/verification');
      setStatus(res.data.data);
    } catch {
      // A profile that cannot be read is not a reason to trap someone here.
      navigate('/dashboard', { replace: true });
    }
  }, [navigate]);

  useEffect(() => { void load(); }, [load]);

  const readError = (e: unknown, fallback: string) =>
    (e as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;

  async function verify(channel: 'phone' | 'email') {
    const code = channel === 'phone' ? phoneCode : emailCode;
    setBusy(channel); setErrors((p) => ({ ...p, [channel]: undefined }));
    try {
      await api.post(`/auth/${channel}/verify`, { code });
      if (channel === 'phone') setPhone(''); else setEmail('');
      await load();
    } catch (e) {
      setErrors((p) => ({ ...p, [channel]: readError(e, t('auth.codeWrong')) }));
    } finally { setBusy(null); }
  }

  async function resend(channel: 'phone' | 'email') {
    setBusy(channel); setErrors((p) => ({ ...p, [channel]: undefined }));
    try {
      await api.post(`/auth/${channel}/send-otp`);
      setResent(channel);
      setTimeout(() => setResent(null), 4000);
    } catch (e) {
      // A cooldown is not a failure, and saying "too many attempts" when the
      // code is simply still on its way makes people try harder.
      setErrors((p) => ({ ...p, [channel]: readError(e, t('auth.resendFailed')) }));
    } finally { setBusy(null); }
  }

  if (!status) {
    return (
      <div className="min-h-screen bg-[#F8F5F0] flex items-center justify-center">
        <Loader2 className="animate-spin text-stone-400" size={28} />
      </div>
    );
  }

  const available = [status.phone.available, status.email.available].filter(Boolean).length;
  const pending = [
    status.phone.available && !status.phone.verified,
    status.email.available && !status.email.verified,
  ].filter(Boolean).length;

  // "Both are confirmed" is wrong when only one channel exists, which is the
  // normal case whenever email is not configured or the account has no phone.
  const doneCopy = available > 1 ? t('auth.verifyContactsDone') : t('auth.verifyContactsDoneOne');

  function panel(
    channel: 'phone' | 'email',
    ch: Channel,
    icon: React.ReactNode,
    label: string,
    target: string | null | undefined,
    code: string,
    setCode: (v: string) => void,
  ) {
    if (!ch.available) return null;

    return (
      <div className="border-t border-stone-100 pt-5 first:border-0 first:pt-0">
        <div className="flex items-center gap-2.5 mb-1">
          <span className="text-stone-400">{icon}</span>
          <span className="font-medium text-sm">{label}</span>
          {ch.verified && (
            <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
              <Check size={12} /> {t('auth.verified')}
            </span>
          )}
        </div>
        <p className="text-sm text-stone-500 mb-3">{target}</p>

        {!ch.verified && (
          <>
            <div className="flex gap-2">
              <input
                inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                className="input tracking-[0.4em] text-center flex-1" placeholder="••••••"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              />
              <button
                type="button" className="btn-primary px-5"
                disabled={busy === channel || code.length < 6}
                onClick={() => verify(channel)}
              >
                {busy === channel ? <Loader2 size={16} className="animate-spin" /> : t('auth.verify')}
              </button>
            </div>

            {errors[channel] && <p className="mt-2 text-sm text-red-600">{errors[channel]}</p>}
            {resent === channel && <p className="mt-2 text-sm text-green-700">{t('auth.codeResent')}</p>}

            <button
              type="button" onClick={() => resend(channel)} disabled={busy === channel}
              className="mt-2 text-sm text-primary-600 hover:text-primary-700 disabled:opacity-50"
            >
              {t('auth.resendCode')}
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F5F0] flex items-center justify-center px-4 py-10 relative">
      <div className="absolute top-4 right-4"><LanguageToggle /></div>

      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2.5 mb-4">
            <LogoMark size={32} />
            <span className="text-2xl font-bold tracking-tight">Mauzo<span className="text-primary-600">Halisi</span></span>
          </div>
        </div>

        <div className="card p-8">
          <h1 className="text-xl font-bold mb-1">{t('auth.verifyContactsTitle')}</h1>
          <p className="text-sm text-stone-500 mb-6">
            {pending > 0 ? t('auth.verifyContactsHelp') : doneCopy}
          </p>

          <div className="space-y-5">
            {panel('phone', status.phone, <Smartphone size={16} />, t('auth.phoneNumber'), status.phone.number, phoneCode, setPhone)}
            {panel('email', status.email, <Mail size={16} />, t('auth.emailAddress'), status.email.address, emailCode, setEmail)}
          </div>

          <button
            type="button" onClick={() => navigate('/dashboard', { replace: true })}
            className={pending > 0 ? 'mt-6 w-full text-sm text-stone-500 hover:text-stone-700' : 'btn-primary mt-6 w-full'}
          >
            {pending > 0 ? t('auth.verifyLater') : t('auth.continue')}
          </button>
        </div>
      </div>
    </div>
  );
}
