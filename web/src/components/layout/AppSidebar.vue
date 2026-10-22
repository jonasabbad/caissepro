<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { ArrowRightOnRectangleIcon, ChevronDoubleLeftIcon, ChevronDoubleRightIcon, Cog6ToothIcon, XMarkIcon } from '@heroicons/vue/24/outline';
import { useAuthStore } from '@/stores/auth';
import { useSidebar } from '@/composables/useSidebar';
import { LOCALES, LOCALE_NAMES } from '@/i18n';

/**
 * Application sidebar: brand, grouped navigation, settings / language / account. It only displays what the layout
 * gives it: `items` is the layout's navigation, already filtered by activity, role, plan and seller mode.
 * - Computers: docked; collapsible to an icon rail (with tooltips), remembered on the device.
 * - Phones and tablets: a drawer opened from the header's menu button.
 */
const props = defineProps({
  items: { type: Array, required: true },
  open: { type: Boolean, default: false },
  storeTitle: { type: String, default: '' },
  isActive: { type: Function, required: true },
});
const emit = defineEmits(['close', 'logout']);
const { t, locale } = useI18n();
const auth = useAuthStore();
const { collapsed, toggle } = useSidebar();

// The rail exists on computers only; the phone / tablet drawer is always full width.
const desktopQuery = typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)') : null;
const isDesktop = ref(!!desktopQuery?.matches);
const onMedia = (e) => (isDesktop.value = e.matches);
onMounted(() => desktopQuery?.addEventListener('change', onMedia));
onBeforeUnmount(() => desktopQuery?.removeEventListener('change', onMedia));
const rail = computed(() => collapsed.value && isDesktop.value);

// Sections, in order. Every navigation id belongs to one; an empty section is not shown.
const SECTIONS = [
  { key: null, ids: ['dashboard'] },
  { key: 'sales', ids: ['pos', 'scan', 'cashDrawer', 'transactions', 'invoices', 'customers', 'repairs', 'appointments', 'services', 'tables', 'kitchen', 'menu'] },
  { key: 'inventory', ids: ['products', 'soldUnits', 'categories', 'inventoryMovements'] },
  { key: 'purchasing', ids: ['suppliers', 'supplierOrders', 'supplierInvoices'] },
  { key: 'finance', ids: ['debts', 'expenses', 'reports'] },
  { key: 'management', ids: ['users', 'employees'] },
];
const groups = computed(() => {
  const placed = new Set(SECTIONS.flatMap((s) => s.ids));
  const out = SECTIONS.map((s) => ({ key: s.key, items: s.ids.map((id) => props.items.find((i) => i.id === id)).filter(Boolean) }));
  // Anything added to the navigation later without a section still shows (at the end).
  const rest = props.items.filter((i) => !placed.has(i.id));
  if (rest.length) out.push({ key: 'other', items: rest });
  return out.filter((g) => g.items.length);
});

const initial = computed(() => (props.storeTitle || 'C').trim().charAt(0).toUpperCase());
const userName = computed(() => [auth.currentUser?.firstName, auth.currentUser?.lastName].filter(Boolean).join(' ') || auth.currentUser?.email || '');
const userInitials = computed(() => `${auth.currentUser?.firstName?.[0] ?? ''}${auth.currentUser?.lastName?.[0] ?? ''}`.toUpperCase() || '?');
const roleLabel = computed(() => {
  const role = auth.currentUser?.roles?.[0];
  return role ? t(`roles.${role}`) : '';
});

// Tooltips on the rail (shown beside the item, outside the scrolling menu).
const tip = ref(null);
function showTip(e, text) {
  if (!rail.value) return;
  const r = e.currentTarget.getBoundingClientRect();
  const rtl = document.documentElement.dir === 'rtl';
  tip.value = { text, top: r.top + r.height / 2, ...(rtl ? { right: window.innerWidth - r.left + 10 } : { left: r.right + 10 }) };
}
const hideTip = () => (tip.value = null);
</script>

<template>
  <aside
    :class="[
      'app-sidebar print:hidden',
      rail && 'is-rail',
      open ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full lg:translate-x-0 rtl:lg:translate-x-0',
    ]"
    :aria-label="t('nav.mainMenu')"
  >
    <!-- Brand -->
    <div :class="['flex h-16 shrink-0 items-center gap-3 border-b border-white/[0.06]', rail ? 'justify-center px-0' : 'px-4']">
      <div class="brand-mark" aria-hidden="true">{{ initial }}</div>
      <div v-if="!rail" class="min-w-0 flex-1">
        <p class="truncate text-[15px] font-semibold leading-tight text-white">{{ storeTitle }}</p>
        <p class="truncate text-[11px] font-medium leading-tight text-slate-400">{{ t('app.name') }}</p>
      </div>
      <button v-if="!isDesktop" type="button" class="sidebar-icon-btn" :aria-label="t('common.close')" @click="emit('close')">
        <XMarkIcon class="h-5 w-5" />
      </button>
      <button v-else-if="!rail" type="button" class="sidebar-icon-btn" :aria-label="t('nav.collapse')" :title="t('nav.collapse')" aria-expanded="true" @click="toggle">
        <ChevronDoubleLeftIcon class="h-4 w-4 rtl:-scale-x-100" />
      </button>
    </div>

    <!-- Navigation -->
    <nav class="sidebar-nav px-3 py-3" @scroll="hideTip">
      <div v-for="(g, gi) in groups" :key="g.key ?? 'top'" :class="gi > 0 && 'mt-5'">
        <template v-if="g.key">
          <p v-if="!rail" class="sidebar-section">{{ t(`nav.groups.${g.key}`) }}</p>
          <div v-else class="mx-auto mb-2 h-px w-6 bg-white/10" aria-hidden="true" />
        </template>
        <ul class="space-y-0.5">
          <li v-for="item in g.items" :key="item.href" :class="item.mobileOnly && 'lg:hidden'">
            <RouterLink
              :to="item.href"
              :class="['sidebar-item', isActive(item.href) && 'is-active', rail && 'justify-center px-0']"
              :aria-current="isActive(item.href) ? 'page' : undefined"
              :aria-label="rail ? item.name : undefined"
              @click="emit('close')"
              @mouseenter="showTip($event, item.name)"
              @mouseleave="hideTip"
              @focus="showTip($event, item.name)"
              @blur="hideTip"
            >
              <component :is="item.icon" class="sidebar-item-icon" aria-hidden="true" />
              <span v-if="!rail" class="truncate">{{ item.name }}</span>
            </RouterLink>
          </li>
        </ul>
      </div>
    </nav>

    <!-- Settings, language, account -->
    <div class="shrink-0 space-y-1 border-t border-white/[0.06] p-3">
      <RouterLink
        v-if="!auth.sellerMode"
        to="/app/settings"
        :class="['sidebar-item', isActive('/app/settings') && 'is-active', rail && 'justify-center px-0']"
        :aria-label="rail ? t('nav.settings') : undefined"
        @click="emit('close')"
        @mouseenter="showTip($event, t('nav.settings'))"
        @mouseleave="hideTip"
        @focus="showTip($event, t('nav.settings'))"
        @blur="hideTip"
      >
        <Cog6ToothIcon class="sidebar-item-icon" aria-hidden="true" />
        <span v-if="!rail">{{ t('nav.settings') }}</span>
      </RouterLink>

      <div :class="['flex gap-1 rounded-lg bg-white/[0.04] p-1', rail && 'flex-col']" role="group" :aria-label="t('nav.language')">
        <button
          v-for="l in LOCALES"
          :key="l"
          type="button"
          :lang="l"
          :title="LOCALE_NAMES[l]"
          :aria-pressed="locale === l"
          :class="['flex-1 rounded-md py-1 text-xs font-semibold transition-colors', locale === l ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:bg-white/10 hover:text-white']"
          @click="auth.setLanguage(l)"
        >
          {{ l === 'ar' ? 'ع' : l.toUpperCase() }}
        </button>
      </div>

      <div :class="['mt-2 flex items-center gap-3 rounded-lg p-2', rail ? 'flex-col' : 'bg-white/[0.04]']">
        <div class="avatar" :title="rail ? `${userName} · ${roleLabel}` : undefined">{{ userInitials }}</div>
        <div v-if="!rail" class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium text-white">{{ userName }}</p>
          <p class="truncate text-xs text-slate-400">{{ roleLabel }}</p>
        </div>
        <button
          v-if="!auth.sellerMode"
          type="button"
          class="sidebar-icon-btn hover:!bg-red-500/15 hover:!text-red-300"
          :aria-label="t('nav.logout')"
          :title="t('nav.logout')"
          @click="emit('logout')"
        >
          <ArrowRightOnRectangleIcon class="h-5 w-5 rtl:-scale-x-100" />
        </button>
      </div>

      <button
        v-if="rail"
        type="button"
        class="sidebar-item mt-1 justify-center px-0 text-slate-500"
        :aria-label="t('nav.expand')"
        aria-expanded="false"
        @click="(toggle(), hideTip())"
        @mouseenter="showTip($event, t('nav.expand'))"
        @mouseleave="hideTip"
      >
        <ChevronDoubleRightIcon class="sidebar-item-icon rtl:-scale-x-100" aria-hidden="true" />
      </button>
    </div>
  </aside>

  <Teleport to="body">
    <div
      v-if="tip && rail"
      class="pointer-events-none fixed z-[60] -translate-y-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg ring-1 ring-white/10"
      :style="{ top: `${tip.top}px`, ...(tip.left != null ? { left: `${tip.left}px` } : { right: `${tip.right}px` }) }"
      role="tooltip"
    >
      {{ tip.text }}
    </div>
  </Teleport>
</template>

<style scoped>
.app-sidebar {
  position: fixed;
  inset-block: 0;
  inset-inline-start: 0;
  z-index: 50;
  display: flex;
  width: 17.5rem;
  flex-direction: column;
  /* Navy ink with a faint blue glow at the top: the existing dark theme, a little deeper. */
  background:
    radial-gradient(120% 60% at 0% 0%, rgb(var(--c-brand-600) / 0.12), transparent 60%),
    rgb(var(--c-ink));
  border-inline-end: 1px solid rgb(255 255 255 / 0.06);
  color: #fff;
  transition:
    transform 0.3s cubic-bezier(0.4, 0, 0.2, 1),
    width 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}
/* Computers: docked at the page's offset (256 px, or the 72 px rail); the phone / tablet drawer is 280 px. */
@media (min-width: 1024px) {
  .app-sidebar {
    width: 16rem;
  }
  .app-sidebar.is-rail {
    width: 4.5rem;
  }
}
.brand-mark {
  display: grid;
  height: 2.25rem;
  width: 2.25rem;
  flex-shrink: 0;
  place-items: center;
  border-radius: 0.625rem;
  background: linear-gradient(135deg, rgb(var(--c-brand-400)), rgb(var(--c-brand-700)));
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.25),
    0 4px 12px -2px rgb(var(--c-brand-600) / 0.5);
  font-size: 1rem;
  font-weight: 700;
  color: #fff;
}
.sidebar-section {
  margin-bottom: 0.375rem;
  padding-inline: 0.75rem;
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgb(148 163 184 / 0.7);
}
.sidebar-item {
  position: relative;
  display: flex;
  height: 2.25rem;
  align-items: center;
  gap: 0.75rem;
  border-radius: 0.5rem;
  padding-inline: 0.75rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: rgb(203 213 225 / 0.85);
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
  outline: none;
}
.sidebar-item:hover {
  background-color: rgb(255 255 255 / 0.05);
  color: #fff;
}
.sidebar-item:focus-visible {
  box-shadow: 0 0 0 2px rgb(var(--c-brand-400) / 0.7);
}
.sidebar-item-icon {
  height: 1.25rem;
  width: 1.25rem;
  flex-shrink: 0;
  color: rgb(148 163 184);
  transition: color 0.15s ease;
}
.sidebar-item:hover .sidebar-item-icon {
  color: #fff;
}
/* Active: soft blue tint, a slim accent bar on the leading edge, blue icon. */
.sidebar-item.is-active {
  background: linear-gradient(90deg, rgb(var(--c-brand-500) / 0.18), rgb(var(--c-brand-500) / 0.06));
  color: #fff;
  font-weight: 600;
}
:global([dir='rtl']) .sidebar-item.is-active {
  background: linear-gradient(270deg, rgb(var(--c-brand-500) / 0.18), rgb(var(--c-brand-500) / 0.06));
}
.sidebar-item.is-active::before {
  content: '';
  position: absolute;
  inset-block: 0.5rem;
  inset-inline-start: -0.75rem;
  width: 3px;
  border-start-end-radius: 3px;
  border-end-end-radius: 3px;
  background-color: rgb(var(--c-brand-400));
  box-shadow: 0 0 10px rgb(var(--c-brand-400) / 0.6);
}
.sidebar-item.is-active .sidebar-item-icon {
  color: rgb(var(--c-brand-300));
}
.sidebar-icon-btn {
  display: inline-grid;
  height: 2rem;
  width: 2rem;
  flex-shrink: 0;
  place-items: center;
  border-radius: 0.5rem;
  color: rgb(148 163 184);
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}
.sidebar-icon-btn:hover {
  background-color: rgb(255 255 255 / 0.08);
  color: #fff;
}
.avatar {
  display: grid;
  height: 2rem;
  width: 2rem;
  flex-shrink: 0;
  place-items: center;
  border-radius: 9999px;
  background: rgb(var(--c-brand-500) / 0.2);
  font-size: 0.75rem;
  font-weight: 600;
  color: rgb(var(--c-brand-200));
  box-shadow: inset 0 0 0 1px rgb(var(--c-brand-400) / 0.3);
}
@media (prefers-reduced-motion: reduce) {
  .app-sidebar,
  .sidebar-item,
  .sidebar-item-icon {
    transition: none;
  }
}
</style>
