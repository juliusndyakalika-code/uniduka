import axios from 'axios';
import { API_BASE } from '../config';
import { useAuthStore } from '../store/authStore';

// withCredentials so the refresh cookie travels. It is httpOnly, so this is
// the only way the browser can send it and no script can read it.
export const api = axios.create({ baseURL: API_BASE, withCredentials: true });

api.interceptors.request.use((config) => {
  let token: string | null = null;
  try { token = localStorage.getItem('ud_token'); } catch {}
  if (!token) token = useAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Silent token refresh — retry the original request with a new access token.
// Uses a queue so concurrent 401s don't each trigger a separate refresh.
let isRefreshing = false;
let refreshQueue: Array<{ resolve: (token: string) => void; reject: (err: unknown) => void }> = [];

function flushQueue(err: unknown, token: string | null) {
  refreshQueue.forEach(({ resolve, reject }) => err ? reject(err) : resolve(token!));
  refreshQueue = [];
}

function lsGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function lsSet(key: string, val: string) {
  try { localStorage.setItem(key, val); } catch {}
}

/**
 * Requests where a 401 is an answer about the credentials, not about the
 * session. For these "unauthorised" means "wrong password" or "wrong code",
 * and there is no session to refresh.
 *
 * Without this list a failed sign-in went through the refresh path, the
 * refresh failed too (there was no session yet), and the person typing a
 * wrong password was told "Session expired. Please sign in again", the
 * refresh endpoint's message instead of their own.
 */
const CREDENTIAL_ROUTES = [
  '/auth/login', '/auth/refresh', '/auth/register',
  '/auth/password/forgot', '/auth/password/reset', '/auth/2fa',
];
const isCredentialRoute = (url?: string) =>
  !!url && CREDENTIAL_ROUTES.some(r => url === r || url.startsWith(r + '/') || url.endsWith(r));

api.interceptors.response.use(
  (r) => r,
  async (err) => {
    const status  = err.response?.status;
    const code    = err.response?.data?.code;
    const original = err.config as typeof err.config & { _retry?: boolean };

    // ── Subscription expired ──────────────────────────────────────────────────
    if (status === 402 && (code === 'SUBSCRIPTION_EXPIRED' || code === 'SUBSCRIPTION_INACTIVE')) {
      window.location.href = '/expired';
      return Promise.reject(err);
    }

    // A suspension is an admin's decision, so it goes to the screen with the
    // support contacts rather than the renew button. It used to arrive with no
    // code at all, which matched nothing here and left the caller stranded on
    // whatever screen it was on with a silent failure.
    if (status === 402 && code === 'ACCOUNT_SUSPENDED') {
      window.location.href = '/pending';
      return Promise.reject(err);
    }

    // ── Token expired — attempt silent refresh ────────────────────────────────
    if (status === 401 && !original._retry && !isCredentialRoute(original.url)) {
      // No local check for a stored refresh token any more: it lives in an
      // httpOnly cookie that script cannot see. Whether one exists is the
      // server's answer to give, and a failed refresh is what tells us.

      // If another request is already refreshing, queue this one
      if (isRefreshing) {
        return new Promise<string>((resolve, reject) => {
          refreshQueue.push({ resolve, reject });
        }).then(newToken => {
          original.headers.Authorization = `Bearer ${newToken}`;
          original._retry = true;
          return api(original);
        });
      }

      original._retry = true;
      isRefreshing    = true;

      try {
        // The cookie is the credential; there is nothing to put in the body.
        const resp = await axios.post(`${API_BASE}/auth/refresh`, {}, { withCredentials: true });
        const newToken: string = resp.data.data.accessToken;

        lsSet('ud_token', newToken);
        useAuthStore.setState({ token: newToken });

        flushQueue(null, newToken);
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      } catch (refreshErr) {
        flushQueue(refreshErr, null);
        useAuthStore.getState().logout();
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(err);
  },
);

export default api;
