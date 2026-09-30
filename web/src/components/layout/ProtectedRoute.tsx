import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

function tokenExpired(token: string | null): boolean {
  if (!token) return true;
  try {
    const { exp } = JSON.parse(atob(token.split('.')[1]));
    return exp * 1000 < Date.now();
  } catch {
    return true;
  }
}

/**
 * Whether a silent refresh is worth attempting.
 *
 * It used to look for a refresh token in localStorage. That token is an
 * httpOnly cookie now, so the page cannot see it and cannot answer this
 * question. Assuming one exists is the right default: the cost of being wrong
 * is a single failed refresh that logs the user out, which is exactly what
 * would have happened anyway, while assuming the opposite logs out people
 * whose session is perfectly good.
 */
function hasRefreshToken(): boolean {
  return true;
}

interface Props { roles?: string[]; }
export default function ProtectedRoute({ roles }: Props) {
  const { isAuthenticated, token, user, account, logout } = useAuthStore();
  const { pathname } = useLocation();
  const expired = tokenExpired(token);

  // Only hard-logout when the access token is expired AND there's no refresh
  // token to silently renew it. If a refresh token exists, the API client's
  // 401 interceptor will handle renewal on the next API call.
  const canRefresh = hasRefreshToken();

  useEffect(() => {
    if (isAuthenticated && expired && !canRefresh) logout();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isAuthenticated || (expired && !canRefresh)) return <Navigate to="/login" replace />;
  // Platform admins belong in the /platform section
  if (user?.role === 'PLATFORM_ADMIN') return <Navigate to="/platform" replace />;
  // Phone verification is required before the app opens.
  //
  // It is the channel everything important travels on: payment confirmations,
  // the reminders before a subscription lapses, and password recovery, which
  // has no other route. An unconfirmed number means all three fail silently
  // and the owner finds out by losing access.
  //
  // Deliberately conditional on the account having a number at all. An account
  // created without one, or a deployment with no SMS gateway configured,
  // cannot satisfy this, and a gate nobody can pass is a lockout rather than a
  // safeguard. Email stays optional and is prompted on the account page.
  if (user && user.hasPhone && user.phoneVerified === false
      && !pathname.startsWith('/verify') && !pathname.startsWith('/setup')) {
    return <Navigate to="/verify" replace />;
  }

  // An inactive subscription has two quite different causes and they must not
  // share a screen. An account that has never been activated is genuinely
  // waiting on a human. One whose paid period ran out is waiting on nobody, and
  // telling that owner their account is "under review" sends them off to wait
  // for an approval that is never coming, when what they need is the renew
  // button one route over.
  if (account && !account.subscriptionActive && !pathname.startsWith('/setup')) {
    const ended = account.subscriptionExpiresAt
      ? new Date(account.subscriptionExpiresAt).getTime() <= Date.now()
      : false;
    return <Navigate to={ended ? '/expired' : '/pending'} replace />;
  }
  if (roles && user && !roles.includes(user.role)) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
