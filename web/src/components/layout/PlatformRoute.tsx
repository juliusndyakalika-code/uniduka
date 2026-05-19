import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

function tokenExpired(token: string | null): boolean {
  if (!token) return true;
  try {
    const { exp } = JSON.parse(atob(token.split('.')[1]));
    return exp * 1000 < Date.now();
  } catch { return true; }
}

export default function PlatformRoute() {
  const { isAuthenticated, token, user } = useAuthStore();
  if (!isAuthenticated || tokenExpired(token)) return <Navigate to="/login" replace />;
  if (user?.role !== 'PLATFORM_ADMIN') return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
