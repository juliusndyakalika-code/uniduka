import { create } from 'zustand';

interface ShopMeta { id: string; tradingName: string; businessType: string; }
interface User { id: string; email?: string | null; phone?: string | null; fullName: string; role: string; }
interface Account {
  id: string; legalName: string; plan: string;
  subscriptionActive: boolean;
  subscriptionExpiresAt: string | null;
  daysRemaining: number | null;
}

interface AuthState {
  token: string | null;
  user: User | null;
  account: Account | null;
  shopId: string | null;
  shops: ShopMeta[];
  isAuthenticated: boolean;
  setAuth: (token: string, user: User, account: Account, shopId?: string, refreshToken?: string) => void;
  setShopId: (shopId: string, token?: string) => void;
  setShops: (shops: ShopMeta[]) => void;
  logout: () => void;
}

// Safe localStorage helpers — Firefox strict/private mode can throw SecurityError
function lsGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function lsSet(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* persisting failed; in-memory state still updates */ }
}
function lsRemove(key: string): void {
  try { localStorage.removeItem(key); } catch {}
}
function lsParse<T>(key: string): T | null {
  try { return JSON.parse(lsGet(key) || 'null') as T; } catch { return null; }
}

export const useAuthStore = create<AuthState>((set) => ({
  token:           lsGet('ud_token'),
  user:            lsParse<User>('ud_user'),
  account:         lsParse<Account>('ud_account'),
  shopId:          lsGet('ud_shop'),
  shops:           [],
  isAuthenticated: !!lsGet('ud_token'),

  setAuth: (token, user, account, shopId, refreshToken) => {
    lsSet('ud_token', token);
    lsSet('ud_user', JSON.stringify(user));
    lsSet('ud_account', JSON.stringify(account));
    if (shopId) lsSet('ud_shop', shopId);
    if (refreshToken) lsSet('ud_refresh', refreshToken);
    set({ token, user, account, shopId: shopId || null, isAuthenticated: true });
  },

  setShopId: (shopId, token) => {
    lsSet('ud_shop', shopId);
    if (token) lsSet('ud_token', token);
    set({ shopId, ...(token && { token }) });
  },

  setShops: (shops) => set({ shops }),

  logout: () => {
    ['ud_token', 'ud_refresh', 'ud_user', 'ud_account', 'ud_shop'].forEach(lsRemove);
    set({ token: null, user: null, account: null, shopId: null, shops: [], isAuthenticated: false });
  },
}));
