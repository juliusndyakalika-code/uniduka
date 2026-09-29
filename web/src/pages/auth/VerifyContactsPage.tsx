import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useTranslation } from 'react-i18next';
import LanguageToggle from '../../components/ui/LanguageToggle';
import { LogoMark } from '../../components/ui/Logo';
import ContactVerification, { pendingCount, type VerificationStatus }
  from '../../components/account/ContactVerification';

/**
 * Confirm the phone number and email address on a new account.
 *
 * Both codes were already sent when the account was created, so this opens
 * ready to accept them rather than making anyone ask first.
 *
 * Nothing is gated on finishing it. The codes exist so we can reach the owner
 * about payments and an expiring subscription, and locking someone out of the
 * shop they just signed up for because an SMS is slow would cost far more than
 * an unconfirmed number does. Whatever is skipped stays finishable from the
 * account page, which is the part that was missing: this screen used to be
 * reachable only in the moment after sign-up, so "later" meant never.
 */
export default function VerifyContactsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [status, setStatus] = useState<VerificationStatus | null>(null);
  const { markPhoneVerified, logout } = useAuthStore();

  /**
   * Keep the session in step with the server.
   *
   * The gate reads phoneVerified from the cached user, so a verification that
   * did not write it back would bounce the owner straight back to this screen.
   */
  function onStatus(s: VerificationStatus) {
    setStatus(s);
    if (s.phone.verified) markPhoneVerified();
  }

  const pending = pendingCount(status);
  // The phone is required, so it is the one thing that cannot be postponed.
  // Email can, and an account with no usable phone channel must not be trapped
  // here by a gate it has no way to satisfy.
  const phoneBlocking = Boolean(status?.phone.available && !status.phone.verified);
  const available = status
    ? [status.phone.available, status.email.available].filter(Boolean).length
    : 0;

  // "Both are confirmed" is wrong when only one channel exists, which is the
  // normal case whenever no mail transport is reachable.
  const doneCopy = available > 1 ? t('auth.verifyContactsDone') : t('auth.verifyContactsDoneOne');

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-[#F8F5F0] px-4 py-10">
      <div className="absolute right-4 top-4"><LanguageToggle /></div>

      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex items-center gap-2.5">
            <LogoMark size={32} />
            <span className="text-2xl font-bold tracking-tight">Mauzo<span className="text-primary-600">Halisi</span></span>
          </div>
        </div>

        <div className="card p-8">
          <h1 className="mb-1 text-xl font-bold">{t('auth.verifyContactsTitle')}</h1>
          <p className="mb-6 text-sm text-stone-500">
            {phoneBlocking
              ? t('auth.verifyPhoneHelp')
              : pending > 0 ? t('auth.verifyContactsHelp') : doneCopy}
          </p>

          <ContactVerification onChange={onStatus} />

          {phoneBlocking ? (
            <>
              <p className="mt-6 text-center text-xs leading-snug text-stone-500">
                {t('auth.phoneRequiredHint')}
              </p>
              {/* A required screen still needs a door. Without this, anyone
                  whose code never arrives is stuck with no way even to sign
                  out and try another account. */}
              <button
                type="button"
                onClick={() => { logout(); navigate('/login', { replace: true }); }}
                className="mt-4 w-full text-xs text-stone-400 hover:text-stone-600"
              >
                {t('sidebar.signOut')}
              </button>
            </>
          ) : (
            <>
              <button
                type="button" onClick={() => navigate('/dashboard', { replace: true })}
                className={pending > 0 ? 'mt-6 w-full text-sm text-stone-500 hover:text-stone-700' : 'btn-primary mt-6 w-full'}
              >
                {pending > 0 ? t('auth.verifyLater') : t('auth.continue')}
              </button>

              {/* Only the email can reach this, and saying where it can be
                  finished makes skipping a postponement rather than a
                  decision that cannot be revisited. */}
              {pending > 0 && (
                <p className="mt-3 text-center text-[11px] leading-snug text-stone-400">
                  {t('auth.verifyLaterHint')}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
