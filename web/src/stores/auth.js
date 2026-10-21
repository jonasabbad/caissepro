import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { authApi } from '@/api/auth';
import { ACTIVITIES, DEFAULT_ACTIVITY } from '@/config/activities';
import { useCartStore } from './cart';
import { settingsApi } from '@/api/misc';
import { currentLocale, i18n, setLocale } from '@/i18n';
import { queryClient } from '@/queryClient';

const TOKENS_KEY = 'auth_tokens';
const IMPERSONATING_KEY = 'auth_impersonating';

const freezeRoles = (u) => {
  if (u && Array.isArray(u.roles)) u.roles = Object.freeze([...u.roles]);
  return u;
};

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null);
  const tokens = ref(null);
  const loading = ref(false);
  const initialized = ref(false);
  const isImpersonating = ref(false);
  const lockNotice = ref(false);
  let initPromise = null;
  let lockNoticeTimer;
  // A language picked while signed out (e.g. on the login page) is saved to the account at the next sign-in.
  let localeChosenSignedOut = false;

  /** Switches the interface language, remembers it on this device and saves it to the signed-in user. */
  async function setLanguage(l) {
    const before = currentLocale();
    await setLocale(l);
    // Data fetched in the previous language (category names...) is fetched again.
    if (currentLocale() !== before) queryClient.invalidateQueries();
    if (!user.value || !tokens.value?.accessToken) {
      localeChosenSignedOut = true;
      return;
    }
    if (user.value.locale === currentLocale()) return;
    user.value = { ...user.value, locale: currentLocale() };
    await settingsApi.updateProfile({ locale: currentLocale() }).catch(() => undefined);
  }
  /** After sign-in or session restore: the account's language wins, unless one was just picked on the login page. */
  async function applyUserLanguage() {
    if (!user.value) return;
    if (localeChosenSignedOut) {
      localeChosenSignedOut = false;
      return setLanguage(currentLocale());
    }
    if (user.value.locale && user.value.locale !== currentLocale()) await setLocale(user.value.locale);
  }

  const isAuthenticated = computed(() => !!user.value && !!tokens.value?.accessToken);
  const currentUser = computed(() => user.value);
  const tenantId = computed(() => user.value?.tenantId);
  const currentStoreId = computed(() => user.value?.currentStoreId);
  const storeName = computed(() => user.value?.storeName || '');
  const legalStatus = computed(() => user.value?.legalStatus || null);
  const isAutoEntrepreneur = computed(() => legalStatus.value === 'auto_entrepreneur');
  const activityType = computed(() => user.value?.activityType || DEFAULT_ACTIVITY);
  const activityConfig = computed(() => ACTIVITIES[activityType.value] || ACTIVITIES[DEFAULT_ACTIVITY]);
  const sellerMode = computed(() => !!user.value?.sellerMode);

  const hasModule = (code) => !!user.value?.enabledModules?.includes(code);

  function notifyLocked() {
    lockNotice.value = true;
    clearTimeout(lockNoticeTimer);
    lockNoticeTimer = setTimeout(() => (lockNotice.value = false), 4000);
  }

  function updateUser(patch) {
    if (user.value) user.value = freezeRoles({ ...user.value, ...patch });
  }

  async function lock() {
    await authApi.lock();
    updateUser({ sellerMode: true });
  }

  async function unlock(password) {
    await authApi.unlock(password);
    updateUser({ sellerMode: false });
  }

  function clearAuth() {
    user.value = null;
    tokens.value = null;
    isImpersonating.value = false;
    initialized.value = true;
    for (const k of [TOKENS_KEY, IMPERSONATING_KEY, 'auth_user', 'auth_original', 'auth_impersonation_swap']) {
      localStorage.removeItem(k);
    }
    useCartStore().setSelectedEmployee(null);
  }

  /** Restores the session from localStorage once per page load. */
  async function initializeAuth() {
    if (initialized.value) return;
    if (initPromise) return initPromise;
    initPromise = (async () => {
      const stored = localStorage.getItem(TOKENS_KEY);
      if (!stored) {
        clearAuth();
        return;
      }
      try {
        tokens.value = JSON.parse(stored);
        if (localStorage.getItem(IMPERSONATING_KEY) === 'true') isImpersonating.value = true;
        const profile = await authApi.getProfile();
        if (!profile.success || !profile.data?.user) {
          clearAuth();
          return;
        }
        user.value = freezeRoles(profile.data.user);
        await applyUserLanguage();
      } catch {
        clearAuth();
      } finally {
        initialized.value = true;
        initPromise = null;
      }
    })();
    return initPromise;
  }

  async function login(email, password, tenantSlug) {
    loading.value = true;
    try {
      const res = await authApi.login({ email, password, tenantSlug });
      if (res.success && res.data) {
        user.value = freezeRoles(res.data.user);
        tokens.value = res.data.tokens;
        localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens.value));
        const profile = await authApi.getProfile().catch(() => null);
        if (profile?.data?.user) user.value = freezeRoles(profile.data.user);
        await applyUserLanguage();
        initialized.value = true;
        return { success: true };
      }
      return { success: false, error: res.error?.message || i18n.global.t('common.loginError') };
    } catch (e) {
      return { success: false, error: e.message || i18n.global.t('common.loginError') };
    } finally {
      loading.value = false;
    }
  }

  async function logout() {
    try {
      await authApi.logout();
    } finally {
      clearAuth();
    }
  }

  function startImpersonation(nextUser, nextTokens) {
    user.value = freezeRoles(nextUser);
    tokens.value = nextTokens;
    isImpersonating.value = true;
    localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens.value));
    localStorage.setItem(IMPERSONATING_KEY, 'true');
  }

  async function stopImpersonation() {
    if (!isImpersonating.value) return false;
    try {
      const res = await authApi.stopImpersonation();
      if (!res.success || !res.data) {
        clearAuth();
        return false;
      }
      user.value = freezeRoles(res.data.user);
      tokens.value = res.data.tokens;
      isImpersonating.value = false;
      localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens.value));
      localStorage.removeItem(IMPERSONATING_KEY);
      return true;
    } catch {
      clearAuth();
      return false;
    }
  }

  const getAccessToken = () => tokens.value?.accessToken;

  return {
    user,
    tokens,
    loading,
    initialized,
    isAuthenticated,
    currentUser,
    tenantId,
    currentStoreId,
    storeName,
    legalStatus,
    isAutoEntrepreneur,
    activityType,
    activityConfig,
    sellerMode,
    hasModule,
    lockNotice,
    notifyLocked,
    lock,
    unlock,
    initializeAuth,
    setLanguage,
    login,
    logout,
    clearAuth,
    updateUser,
    getAccessToken,
    isImpersonating,
    startImpersonation,
    stopImpersonation,
  };
});
