import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Check, X, Loader2, Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * What the customer watches while a mobile money prompt sits on their phone.
 *
 * The wait is the part of paying that feels broken: the prompt is on a
 * different device, nothing on screen moves, and there is no way to tell a slow
 * network from a payment that already failed. So every one of those outcomes
 * gets its own state here rather than a single spinner that eventually stops.
 */

export type PayPhase = 'waiting' | 'success' | 'failed' | 'timeout';

/**
 * A short two-note chime, synthesised rather than loaded.
 *
 * An audio file would be another request that has to succeed on a Tanzanian
 * mobile connection before the one moment it is needed. Web Audio is already
 * there and costs nothing.
 *
 * Browsers only allow audio that follows a user gesture; this always does,
 * since the customer tapped Pay. It still runs inside try/catch, because a
 * blocked or missing AudioContext must never take the success screen down with
 * it: the tick is the confirmation, the sound is a bonus.
 */
function chime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;

    // Two notes a fifth apart, the second a touch after the first.
    [[880, 0], [1318.5, 0.11]].forEach(([freq, at]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      // Rise fast, fall slow, so it reads as a bell rather than a beep.
      gain.gain.setValueAtTime(0.0001, now + at);
      gain.gain.exponentialRampToValueAtTime(0.22, now + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.55);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + at);
      osc.stop(now + at + 0.6);
    });

    // Release the hardware once it has rung out. Leaving contexts open is how
    // a page ends up unable to make any sound at all.
    window.setTimeout(() => { void ctx.close().catch(() => {}); }, 1200);
  } catch { /* no sound is not a failure */ }
}

export default function PaymentStatusModal({
  phase, amount, reason, secondsLeft, onRetry, onClose, onKeepWaiting,
}: {
  phase: PayPhase;
  amount: string;
  /** The gateway's reason code, when it gave one. */
  reason?: string | null;
  /** Counts down during the wait so the spinner is not the only thing moving. */
  secondsLeft?: number;
  onRetry: () => void;
  onClose: () => void;
  onKeepWaiting: () => void;
}) {
  const { t } = useTranslation();
  const rang = useRef(false);

  // Once only. Re-renders during the redirect would otherwise ring again.
  useEffect(() => {
    if (phase === 'success' && !rang.current) {
      rang.current = true;
      chime();
    }
  }, [phase]);

  // Escape closes, but only from a state the customer can act on. Dismissing
  // mid-wait would hide the one thing telling them to look at their phone.
  useEffect(() => {
    if (phase === 'waiting') return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, onClose]);

  /**
   * Turn the gateway's reason code into something a shopkeeper can act on.
   *
   * The codes are written for us, not for them: INSUFFICIENT_BALANCE reads as
   * noise on a phone, and the useful part is knowing whether to top up or just
   * try again. Anything unrecognised falls back to the plain failure line
   * rather than showing the raw code.
   */
  const failureText = () => {
    const code = (reason ?? '').toUpperCase();
    if (/INSUFFICIENT|BALANCE|FUNDS/.test(code)) return t('billing.failNoBalance');
    if (/CANCEL/.test(code))                     return t('billing.failCancelled');
    if (/TIMEOUT|EXPIRED/.test(code))            return t('billing.failExpired');
    if (/PIN|AUTH/.test(code))                   return t('billing.failPin');
    return t('billing.failGeneric');
  };

  /**
   * Rendered into document.body rather than in place.
   *
   * This component sits inside a .card, and .card sets isolation: isolate to
   * keep its water-drop decorations in the right layer. That makes the card a
   * stacking context, which a position: fixed descendant cannot escape: the
   * overlay's z-index then competes only with the card's own children, so
   * later cards further down the page painted straight over the dialog. A
   * portal lifts it out of every ancestor's stacking context.
   */
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-live="polite"
    >
      <div className="card w-full max-w-sm p-8 text-center">

        {phase === 'waiting' && (
          <>
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-stone-100">
              <Loader2 size={30} className="animate-spin text-stone-500" />
            </div>
            <h2 className="mb-1 text-lg font-bold text-stone-900">{t('billing.verifyingPayment')}</h2>
            <p className="text-sm text-stone-500">{t('billing.checkPhonePin', { amount })}</p>

            {typeof secondsLeft === 'number' && secondsLeft > 0 && (
              <p className="mt-4 text-xs tabular-nums text-stone-400">
                {t('billing.waitingSeconds', { seconds: secondsLeft })}
              </p>
            )}

            {/* An out, because a modal with no exit is its own kind of failure.
                Closing stops the watching, not the payment. */}
            <button type="button" onClick={onClose}
                    className="mt-6 text-xs text-stone-400 underline-offset-2 hover:text-stone-600 hover:underline">
              {t('billing.checkLater')}
            </button>
          </>
        )}

        {phase === 'success' && (
          <>
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
              <Check size={32} className="text-emerald-600" strokeWidth={3} />
            </div>
            <h2 className="mb-1 text-lg font-bold text-stone-900">{t('billing.paymentComplete')}</h2>
            <p className="text-sm text-stone-500">{t('billing.takingYouIn')}</p>
          </>
        )}

        {phase === 'failed' && (
          <>
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
              <X size={32} className="text-red-600" strokeWidth={3} />
            </div>
            <h2 className="mb-1 text-lg font-bold text-stone-900">{t('billing.paymentFailed')}</h2>
            <p className="mb-6 text-sm text-stone-500">{failureText()}</p>
            <button type="button" onClick={onRetry} className="btn-primary w-full py-3">
              {t('billing.tryAgain')}
            </button>
            <button type="button" onClick={onClose}
                    className="mt-3 text-xs text-stone-400 hover:text-stone-600">
              {t('common.cancel')}
            </button>
          </>
        )}

        {phase === 'timeout' && (
          <>
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
              <Clock size={30} className="text-amber-600" />
            </div>
            <h2 className="mb-1 text-lg font-bold text-stone-900">{t('billing.stillWaiting')}</h2>
            {/* Deliberately does not claim the payment failed. It may well be
                on its way, and telling someone to pay again when the first one
                is about to land is how a shop pays twice. */}
            <p className="mb-6 text-sm text-stone-500">{t('billing.stillWaitingHelp')}</p>
            <button type="button" onClick={onKeepWaiting} className="btn-primary w-full py-3">
              {t('billing.keepWaiting')}
            </button>
            <button type="button" onClick={onClose}
                    className="mt-3 text-xs text-stone-400 hover:text-stone-600">
              {t('billing.checkLater')}
            </button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
