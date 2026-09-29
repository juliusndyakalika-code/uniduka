import { useEffect, useState, useCallback, useRef } from 'react';
import { Check, Smartphone, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';

/**
 * Confirming the phone number on an account.
 *
 * Phone only. Email confirmation was removed: it could not be delivered from
 * this host, since Railway blocks outbound SMTP below the Pro plan, and an
 * address nobody could ever confirm was worse on screen than none at all.
 */

interface Channel {
  verified: boolean;
  available: boolean;
  address?: string | null;
  number?: string | null;
}
export interface VerificationStatus { phone: Channel }

export default function ContactVerification({ onChange }: {
  /** Told after every reload, so a host screen can react to it being finished. */
  onChange?: (s: VerificationStatus) => void;
}) {
  const { t } = useTranslation();

  const [status, setStatus]   = useState<VerificationStatus | null>(null);
  const [phoneCode, setPhone] = useState('');
  const [busy, setBusy]       = useState<'phone' | null>(null);
  const [resent, setResent]   = useState<'phone' | null>(null);
  const [errors, setErrors]   = useState<{ phone?: string }>({});

  /**
   * Held in a ref rather than named as a dependency.
   *
   * Callers pass an inline function, so its identity changes on every render.
   * With it in the dependency array, load was a new function each time, the
   * effect re-ran each time, and the component fetched in a tight loop until
   * the rate limiter answered 429. The status then failed to load and the
   * panels vanished, leaving a screen that demanded verification while
   * offering nothing to verify with.
   */
  const notify = useRef(onChange);
  notify.current = onChange;

  const load = useCallback(async () => {
    try {
      const res = await api.get('/auth/verification');
      setStatus(res.data.data);
      notify.current?.(res.data.data);
    } catch {
      // Leave whatever was last known on screen. Blanking it on a transient
      // failure is what turned a hiccup into a dead end.
      setStatus((prev) => prev);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const readError = (e: unknown, fallback: string) =>
    (e as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;

  async function verify(channel: 'phone') {
    const code = phoneCode;
    setBusy(channel); setErrors((p) => ({ ...p, [channel]: undefined }));
    try {
      await api.post(`/auth/${channel}/verify`, { code });
      setPhone('');
      await load();
    } catch (e) {
      setErrors((p) => ({ ...p, [channel]: readError(e, t('auth.codeWrong')) }));
    } finally { setBusy(null); }
  }

  async function resend(channel: 'phone') {
    setBusy(channel); setErrors((p) => ({ ...p, [channel]: undefined }));
    try {
      await api.post(`/auth/${channel}/send-otp`);
      setResent(channel);
      setTimeout(() => setResent(null), 4000);
    } catch (e) {
      // A cooldown is not a failure, and the server words it as such. Saying
      // "too many attempts" while the first code is still arriving only makes
      // people press harder.
      setErrors((p) => ({ ...p, [channel]: readError(e, t('auth.resendFailed')) }));
    } finally { setBusy(null); }
  }

  if (!status) return null;

  function panel(
    channel: 'phone',
    ch: Channel,
    icon: React.ReactNode,
    label: string,
    target: string | null | undefined,
    code: string,
    setCode: (v: string) => void,
  ) {
    // A channel the server reports as unavailable gets no box at all, which
    // is what an account with no number, or a deployment with no SMS gateway,
    // looks like. An input that cannot work is worse than an absent one.
    if (!ch.available) return null;

    return (
      <div className="border-t border-stone-100 pt-5 first:border-0 first:pt-0">
        <div className="mb-1 flex items-center gap-2.5">
          <span className="text-stone-400">{icon}</span>
          <span className="text-sm font-medium">{label}</span>
          {ch.verified && (
            <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
              <Check size={12} /> {t('auth.verified')}
            </span>
          )}
        </div>
        <p className="mb-3 text-sm text-stone-500">{target}</p>

        {!ch.verified && (
          <>
            <div className="flex gap-2">
              <input
                inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                className="input flex-1 text-center tracking-[0.4em]" placeholder="••••••"
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
    <div className="space-y-5">
      {panel('phone', status.phone, <Smartphone size={16} />, t('auth.phoneNumber'), status.phone.number, phoneCode, setPhone)}
    </div>
  );
}

/** How many channels are available but still unconfirmed. */
export function pendingCount(s: VerificationStatus | null): number {
  if (!s) return 0;
  return s.phone.available && !s.phone.verified ? 1 : 0;
}
