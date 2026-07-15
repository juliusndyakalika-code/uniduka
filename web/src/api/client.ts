import axios from 'axios';
import { API_BASE } from '../config';
import { useAuthStore } from '../store/authStore';

export const api = axios.create({ baseURL: API_BASE });

api.interceptors.request.use((config) => {
  let token: string | null = null;
  try { token = localStorage.getItem('ud_token'); } catch {}
  // Fallback to Zustand in-memory token when localStorage is blocked (Firefox strict/private mode)
  if (!token) token = useAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    const status = err.response?.status;
    const code   = err.response?.data?.code;
    if (status === 401) {
      useAuthStore.getState().logout();
    }
    if (status === 402 && (code === 'SUBSCRIPTION_EXPIRED' || code === 'SUBSCRIPTION_INACTIVE')) {
      window.location.href = '/expired';
    }
    return Promise.reject(err);
  }
);

export default api;
