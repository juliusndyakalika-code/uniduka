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

interface Props { roles?: string[]; }
export default function ProtectedRoute({ roles }: Props) {
  const { isAuthenticated, token, user, account, logout } = useAuthStore();
  const { pathname } = useLocation();
  const expired = tokenExpired(token);

  // Flush stale localStorage if the stored token is expired
  useEffect(() => {
    if (isAuthenticated && expired) logout();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isAuthenticated || expired) return <Navigate to="/login" replace />;
  // Platform admins belong in the /platform section
  if (user?.role === 'PLATFORM_ADMIN') return <Navigate to="/platform" replace />;
  // Block access to shop functionality until subscription approved — but allow setup wizard
  if (account && !account.subscriptionActive && !pathname.startsWith('/setup')) return <Navigate to="/pending" replace />;
  if (roles && user && !roles.includes(user.role)) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
