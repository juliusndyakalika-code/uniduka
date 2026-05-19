import { create } from 'zustand';

interface ShopMeta { id: string; tradingName: string; businessType: string; }
interface User { id: string; email: string; fullName: string; role: string; }
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
  setAuth: (token: string, user: User, account: Account, shopId?: string) => void;
  setShopId: (shopId: string, token?: string) => void;
  setShops: (shops: ShopMeta[]) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token:           localStorage.getItem('ud_token'),
  user:            JSON.parse(localStorage.getItem('ud_user') || 'null'),
  account:         JSON.parse(localStorage.getItem('ud_account') || 'null'),
  shopId:          localStorage.getItem('ud_shop'),
  shops:           [],
  isAuthenticated: !!localStorage.getItem('ud_token'),

  setAuth: (token, user, account, shopId) => {
    localStorage.setItem('ud_token', token);
    localStorage.setItem('ud_user', JSON.stringify(user));
    localStorage.setItem('ud_account', JSON.stringify(account));
    if (shopId) localStorage.setItem('ud_shop', shopId);
    set({ token, user, account, shopId: shopId || null, isAuthenticated: true });
  },

  setShopId: (shopId, token) => {
    localStorage.setItem('ud_shop', shopId);
    if (token) localStorage.setItem('ud_token', token);
    set({ shopId, ...(token && { token }) });
  },

  setShops: (shops) => set({ shops }),

  logout: () => {
    ['ud_token', 'ud_refresh', 'ud_user', 'ud_account', 'ud_shop'].forEach(k => localStorage.removeItem(k));
    set({ token: null, user: null, account: null, shopId: null, shops: [], isAuthenticated: false });
  },
}));
