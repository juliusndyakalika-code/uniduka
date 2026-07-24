import axios from 'axios';
import { API_BASE } from '../config';
import { useAuthStore } from '../store/authStore';

export const api = axios.create({ baseURL: API_BASE });

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

    // ── Token expired — attempt silent refresh ────────────────────────────────
    if (status === 401 && !original._retry) {
      const storedRefresh = lsGet('ud_refresh');

      // No refresh token stored → hard logout immediately
      if (!storedRefresh) {
        useAuthStore.getState().logout();
        return Promise.reject(err);
      }

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
        const resp = await axios.post(`${API_BASE}/auth/refresh`, { refreshToken: storedRefresh });
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
