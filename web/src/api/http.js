import axios from 'axios';
import { useAuthStore } from '@/stores/auth';

/** Authenticated API client: adds the bearer token and handles 401/403 globally. */
export const http = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  responseType: 'json',
});

/** Unauthenticated client (login, public endpoints). */
export const publicHttp = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

http.interceptors.request.use((config) => {
  const token = useAuthStore().getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

function cashDrawerPaired() {
  try {
    return localStorage.getItem('cash_drawer_paired') === '1';
  } catch {
    return false;
  }
}

http.interceptors.response.use(
  (response) => {
    // The server flags responses that should pop the cash drawer (cash sales).
    if (response.headers?.['x-cash-drawer'] === 'open' && cashDrawerPaired()) {
      import('@/services/cashDrawer')
        .then((m) => m.popCashDrawerIfConfigured())
        .catch(() => undefined);
    }
    return response;
  },
  async (error) => {
    const auth = useAuthStore();
    const status = error.response?.status;
    if (status === 401) {
      auth.clearAuth();
      window.location.href = '/login';
      return Promise.reject(error);
    }
    if (status === 403) {
      const code = error.response?.data?.error;
      if (code === 'SUBSCRIPTION_BLOCKED') {
        const { useSubscriptionStore } = await import('@/stores/subscription');
        useSubscriptionStore().setBlocked(true);
      } else if (code === 'SELLER_MODE') {
        auth.updateUser({ sellerMode: true });
        auth.notifyLocked();
      } else if ((error.config?.url || '').includes('/superadmin/')) {
        auth.clearAuth();
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);

/** Extracts a readable message from an API error. */
export function apiErrorMessage(error, fallback = 'Une erreur est survenue') {
  const data = error?.response?.data;
  return data?.error?.message || data?.message || error?.message || fallback;
}
