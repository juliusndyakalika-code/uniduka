import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, LogOut, RefreshCw } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import api from '../../api/client';
import { useAuthStore } from '../../store/authStore';

export default function PendingApprovalPage() {
  const { user, account, setAuth, token, logout } = useAuthStore();
  const navigate = useNavigate();

  // Poll account status every 30 s — navigate away once approved
  const { data } = useQuery({
    queryKey: ['account-status'],
    queryFn: () => api.get('/tenant/').then(r => r.data.data),
    refetchInterval: 30_000,
    enabled: !!token,
  });

  useEffect(() => {
    if (data?.subscriptionActive && account && user && token) {
      // Update Zustand with the now-active account so the gate opens
      setAuth(token, user, { ...account, subscriptionActive: true }, undefined);
      navigate('/dashboard', { replace: true });
    }
  }, [data, account, user, token, setAuth, navigate]);

  function handleLogout() { logout(); navigate('/login'); }

  return (
    <div className="min-h-screen bg-[#F8F5F0] flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        {/* Logo */}
        <div className="inline-flex items-center gap-2.5 mb-8">
          <svg width="32" height="36" viewBox="0 0 56 64" fill="none">
            <rect x="4" y="4" width="48" height="40" rx="6" fill="#a66624"/>
            <rect x="14" y="16" width="8" height="14" rx="2" fill="white" opacity="0.9"/>
            <rect x="24" y="16" width="8" height="14" rx="2" fill="white" opacity="0.9"/>
            <rect x="34" y="16" width="8" height="14" rx="2" fill="white" opacity="0.9"/>
            <path d="M20 44 L28 58 L36 44" fill="#a66624"/>
          </svg>
          <span className="text-2xl font-bold tracking-tight">Uni<span className="font-light text-primary-600">Duka</span></span>
        </div>

        <div className="bg-white rounded-2xl border border-stone-200 p-10 shadow-sm">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <Clock size={28} className="text-amber-600" />
          </div>

          <h2 className="text-xl font-bold text-stone-900 mb-2">Awaiting Approval</h2>
          <p className="text-sm text-stone-500 mb-6 leading-relaxed">
            Your account <span className="font-semibold text-stone-700">{account?.legalName}</span> has been
            registered and is pending activation by our platform administrators.
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

          <p className="text-xs text-stone-400 mb-6">
            This page checks automatically every 30 seconds. You'll be redirected as soon as your account is activated.
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
              <LogOut size={13} /> Sign out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
