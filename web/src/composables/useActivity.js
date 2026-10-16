import { computed } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { ACTIVITIES, DEFAULT_ACTIVITY } from '@/config/activities';

export function useActivity() {
  const auth = useAuthStore();
  const activityType = computed(() => auth.activityType || DEFAULT_ACTIVITY);
  const config = computed(() => ACTIVITIES[activityType.value] || ACTIVITIES[DEFAULT_ACTIVITY]);
  return {
    activityType,
    config,
    hasModule: (m) => config.value.modules.includes(m),
    hasWidget: (w) => config.value.dashboardWidgets.includes(w),
    hasNavItem: (n) => config.value.navItems.includes(n),
    productsLabelKey: computed(() => (activityType.value === 'phone_seller' ? 'nav.products' : 'nav.productsGeneric')),
    getActivityLabel: (lang = 'fr') => (lang === 'ar' ? config.value.labelAr : config.value.label),
    getActivityDescription: (lang = 'fr') => (lang === 'ar' ? config.value.descriptionAr : config.value.description),
  };
}
