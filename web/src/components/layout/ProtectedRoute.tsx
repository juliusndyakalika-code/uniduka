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

function hasRefreshToken(): boolean {
  try { return !!localStorage.getItem('ud_refresh'); } catch { return false; }
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
  // Block access to shop functionality until subscription approved — but allow setup wizard
  if (account && !account.subscriptionActive && !pathname.startsWith('/setup')) return <Navigate to="/pending" replace />;
  if (roles && user && !roles.includes(user.role)) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
