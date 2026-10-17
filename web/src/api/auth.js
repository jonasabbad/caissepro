import { i18n } from '@/i18n';
import { http, publicHttp, apiErrorMessage } from './http';

function mapSession(data) {
  const u = data.user;
  return {
    user: {
      id: u.id,
      email: u.email,
      firstName: u.firstName || '',
      lastName: u.lastName || '',
      roles: u.roles || [],
      tenantId: u.tenantId || '',
      currentStoreId: u.currentStoreId,
    },
    tokens: {
      accessToken: data.tokens.accessToken,
      refreshToken: data.tokens.refreshToken || '',
      expiresIn: data.tokens.expiresIn || 3600,
    },
  };
}

export const authApi = {
  async login({ email, password, tenantSlug }) {
    try {
      const { data } = await publicHttp.post('/auth/login', { email, password, tenantSlug });
      if (!data.success || !data.data?.tokens?.accessToken) {
        return { success: false, error: { code: 'invalid_response', message: data.message || i18n.global.t('common.loginError') } };
      }
      return { success: true, data: mapSession(data.data) };
    } catch (e) {
      return { success: false, error: { code: 'auth_error', message: apiErrorMessage(e, i18n.global.t('common.loginError')) } };
    }
  },
  async logout() {
    try {
      await http.post('/auth/logout');
    } catch {
      /* ignore */
    }
  },
  async getProfile() {
    const { data } = await http.get('/auth/me');
    return data;
  },
  async lock() {
    await http.post('/auth/lock');
  },
  async unlock(password) {
    await http.post('/auth/unlock', { password });
  },
  async refreshToken(refreshToken) {
    const { data } = await http.post('/auth/refresh', { refreshToken });
    return data;
  },
  async stopImpersonation() {
    try {
      const { data } = await http.post('/auth/impersonation/stop');
      if (!data.success || !data.data?.tokens?.accessToken) {
        return { success: false, error: { code: 'invalid_response', message: data.message || i18n.global.t('common.stopImpersonationError') } };
      }
      return { success: true, data: mapSession(data.data) };
    } catch (e) {
      return { success: false, error: { code: 'auth_error', message: apiErrorMessage(e, i18n.global.t('common.stopImpersonationError')) } };
    }
  },
};
