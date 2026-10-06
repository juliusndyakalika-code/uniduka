import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, LogOut, RefreshCw, CreditCard } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { LogoMark } from '../../components/ui/Logo';
import PayForPlan, { type Payment } from '../../components/billing/PayForPlan';

export default function PendingApprovalPage() {
  const { user, account, token, logout, applyPayment } = useAuthStore();
  const navigate = useNavigate();
  const { t } = useTranslation();

  // Poll account status every 30 s — navigate away once approved
  const { data } = useQuery({
    queryKey: ['account-status'],
    queryFn: () => api.get('/tenant/').then(r => r.data.data),
    refetchInterval: 30_000,
    enabled: !!token,
  });

  useEffect(() => {
    if (data?.subscriptionActive) {
      // Carries the plan and expiry the server just reported rather than only
      // flipping the active flag: leaving a stale past expiry behind is what
      // sent a freshly activated owner back to the expired screen.
      applyPayment(data.plan ?? data.subscriptionPlan, data.subscriptionExpiresAt ?? null);
      navigate('/dashboard', { replace: true });
    }
  }, [data, applyPayment, navigate]);

  const [showPay, setShowPay] = useState(false);

  function handleLogout() { logout(); navigate('/login'); }

  /**
   * A successful payment sets subscriptionActive on the server, so the gate
   * that sent them here will now let them through. Going straight in beats
   * leaving them on this screen until the 30-second poll notices.
   */
  function activated(p: Payment) {
    // Shares the expired screen's path so the two cannot drift apart again.
    // The previous version flipped subscriptionActive but left the old expiry
    // date in place, which was stale the moment it was written.
    applyPayment(p.plan, p.expiresAfter);
    navigate('/dashboard', { replace: true });
  }

  return (
    <div className="min-h-screen bg-[rgb(var(--paper))] flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        {/* Logo */}
        <div className="inline-flex items-center gap-2.5 mb-8">
          <LogoMark size={32} />
          <span className="text-2xl font-bold tracking-tight">Mauzo<span className="text-primary-600">Halisi</span></span>
        </div>

        <div className="bg-white rounded-2xl border border-stone-200 p-10 shadow-sm">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <Clock size={28} className="text-amber-600" />
          </div>

          <h2 className="text-xl font-bold text-stone-900 mb-2">{t('auth.pendingApproval')}</h2>
          <p className="text-sm text-stone-500 mb-6 leading-relaxed">
            {t('auth.pendingMessage')}
          </p>

          <div className="bg-stone-50 rounded-xl p-4 mb-6 text-left space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-stone-500">Plan</span>
              <span className="font-semibold text-stone-800">{account?.plan ?? 'STARTER'}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-stone-500">Account</span>
              <span className="font-semibold text-stone-800">{user?.email}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-stone-500">Status</span>
              <span className="font-semibold text-amber-600">Pending activation</span>
            </div>
          </div>

          {/* Waiting on someone else is a dead end. Paying is the one action
              that ends it, and the shop can do it right here. */}
          {showPay ? (
            <div className="mb-6">
              <PayForPlan compact onPaid={activated} />
            </div>
          ) : (
            <button
              onClick={() => setShowPay(true)}
              className="btn-primary w-full py-3 mb-4"
            >
              <CreditCard size={14} /> {t('billing.activateNow')}
            </button>
          )}

          <p className="text-xs text-stone-400 mb-6">
            {showPay ? t('billing.orWaitForApproval') : t('auth.pendingAutoCheck')}
          </p>

          <div className="flex gap-3">
            <button
              onClick={() => window.location.reload()}
              className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 border border-stone-200 text-sm text-stone-600 rounded-lg hover:bg-stone-50 transition-colors"
            >
              <RefreshCw size={13} /> Check now
            </button>
            <button
              onClick={handleLogout}
              className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 border border-stone-200 text-sm text-red-500 rounded-lg hover:bg-red-50 transition-colors"
            >
              <LogOut size={13} /> {t('sidebar.signOut')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
