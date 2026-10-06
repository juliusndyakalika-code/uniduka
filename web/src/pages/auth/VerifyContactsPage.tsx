import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useTranslation } from 'react-i18next';
import LanguageToggle from '../../components/ui/LanguageToggle';
import { LogoMark } from '../../components/ui/Logo';
import ContactVerification, { type VerificationStatus }
  from '../../components/account/ContactVerification';

/**
 * Confirm the phone number on a new account.
 *
 * The code was already sent as the account was created, so this opens ready to
 * accept it rather than making anyone ask first.
 *
 * Confirming is required, because the number is where payment confirmations,
 * expiry reminders and password recovery all go, and password recovery has no
 * other route at all. The gate only applies when there is a number to confirm
 * and an SMS gateway to confirm it with, and the screen keeps a sign out, so a
 * code that never arrives is not a trap.
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

  // The phone is required, so it is the one thing that cannot be postponed.
  // Email can, and an account with no usable phone channel must not be trapped
  // here by a gate it has no way to satisfy.
  const phoneBlocking = Boolean(status?.phone.available && !status.phone.verified);

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-[rgb(var(--paper))] px-4 py-10">
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
            {phoneBlocking ? t('auth.verifyPhoneHelp') : t('auth.verifyContactsDoneOne')}
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
            // Nothing is pending once the phone is confirmed, since it is the
            // only channel, so this is always a plain way onward.
            <button
              type="button" onClick={() => navigate('/dashboard', { replace: true })}
              className="btn-primary mt-6 w-full"
            >
              {t('auth.continue')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
