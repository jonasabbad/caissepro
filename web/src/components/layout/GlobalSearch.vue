<script setup>
// ⌘K / Ctrl+K command palette: quick links under 2 chars, otherwise a debounced search across
// phones (sold units), products and customers. Behaviour spec: docs/analysis/global-search-spec.md
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import {
  MagnifyingGlassIcon,
  XMarkIcon,
  HomeIcon,
  ShoppingCartIcon,
  CubeIcon,
  UsersIcon,
  DocumentTextIcon,
  DevicePhoneMobileIcon,
} from '@heroicons/vue/24/outline';
import { productsApi } from '@/api/products';
import { customersApi } from '@/api/customers';
import { soldUnitsApi } from '@/api/soldUnits';

const { t } = useI18n();
const router = useRouter();

const TYPE_STYLE = {
  unit: { bg: 'bg-purple-100', fg: 'text-purple-600' },
  product: { bg: 'bg-blue-100', fg: 'text-blue-600' },
  customer: { bg: 'bg-green-100', fg: 'text-green-600' },
};

const isOpen = ref(false);
const query = ref('');
const results = ref([]);
const isLoading = ref(false);
const selectedIndex = ref(0);
const searchInputRef = ref(null);

const quickLinks = [
  { key: 'dashboard', label: () => t('nav.dashboard'), href: '/app/dashboard', icon: HomeIcon },
  { key: 'pos', label: () => t('search.newSale'), href: '/app/pos', icon: ShoppingCartIcon },
  { key: 'products', label: () => t('nav.productsGeneric'), href: '/app/products', icon: CubeIcon },
  { key: 'customers', label: () => t('nav.customers'), href: '/app/customers', icon: UsersIcon },
  { key: 'transactions', label: () => t('nav.transactions'), href: '/app/transactions', icon: DocumentTextIcon },
];

let debounceTimer = null;
watch(query, (q) => {
  if (debounceTimer) clearTimeout(debounceTimer);
  if (q.length < 2) {
    results.value = [];
    return;
  }
  debounceTimer = setTimeout(async () => {
    isLoading.value = true;
    try {
      const [products, customers, units] = await Promise.all([
        productsApi.getAll({ query: q, limit: 5 }),
        customersApi.getAll({ query: q, limit: 5 }),
        soldUnitsApi.getAll({ query: q, limit: 5 }),
      ]);
      const list = [];
      for (const u of units.units) {
        const ident = u.imei || u.serialNumber || u.ref;
        list.push({
          type: 'unit',
          id: u.id,
          name: `${u.brand} ${u.model}`,
          subtitle: [ident, u.soldAt ? t('search.sold') : t('search.inStock')].filter(Boolean).join(' · '),
          href: `/app/sold-units?q=${encodeURIComponent(ident)}&stock=all`,
          icon: DevicePhoneMobileIcon,
        });
      }
      for (const p of products.products) {
        list.push({ type: 'product', id: p.id, name: p.name, subtitle: p.sku, href: `/app/products/${p.id}/edit`, icon: CubeIcon });
      }
      for (const c of customers.customers) {
        list.push({
          type: 'customer',
          id: c.id,
          name: `${c.firstName} ${c.lastName}`,
          subtitle: c.phone,
          href: `/app/customers/${c.id}`,
          icon: UsersIcon,
        });
      }
      results.value = list;
      selectedIndex.value = 0;
    } catch (e) {
      console.error('Search error:', e);
    } finally {
      isLoading.value = false;
    }
  }, 300);
});

function go(href) {
  router.push(href);
  isOpen.value = false;
  query.value = '';
}

function onKeydown(e) {
  if (!isOpen.value) {
    if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      isOpen.value = true;
    }
    return;
  }
  switch (e.key) {
    case 'Escape':
      isOpen.value = false;
      break;
    case 'ArrowDown': {
      e.preventDefault();
      const max = query.value.length >= 2 ? results.value.length - 1 : quickLinks.length - 1;
      selectedIndex.value = Math.min(selectedIndex.value + 1, max);
      break;
    }
    case 'ArrowUp':
      e.preventDefault();
      selectedIndex.value = Math.max(selectedIndex.value - 1, 0);
      break;
    case 'Enter':
      e.preventDefault();
      if (query.value.length >= 2 && results.value[selectedIndex.value]) go(results.value[selectedIndex.value].href);
      else if (quickLinks[selectedIndex.value]) go(quickLinks[selectedIndex.value].href);
      break;
  }
}

onMounted(() => document.addEventListener('keydown', onKeydown));
onUnmounted(() => document.removeEventListener('keydown', onKeydown));

watch(isOpen, (open) => {
  if (!open) return;
  query.value = '';
  results.value = [];
  selectedIndex.value = 0;
  nextTick(() => searchInputRef.value?.focus());
});
</script>

<template>
  <button
    class="flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-500 transition-colors hover:bg-gray-200"
    @click="isOpen = true"
  >
    <MagnifyingGlassIcon class="h-4 w-4" />
    <span class="hidden sm:inline">{{ t('search.button') }}</span>
    <kbd class="hidden items-center gap-1 rounded border border-gray-200 bg-white px-2 py-0.5 text-xs sm:inline-flex">
      <span class="text-xs">⌘</span>K
    </kbd>
  </button>

  <Teleport to="body">
    <div
      v-if="isOpen"
      class="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-20 backdrop-blur-sm"
      @click.self="isOpen = false"
    >
      <div class="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div class="flex items-center gap-3 border-b border-gray-100 p-4">
          <MagnifyingGlassIcon class="h-5 w-5 text-gray-400" />
          <input
            ref="searchInputRef"
            v-model="query"
            type="text"
            :placeholder="t('search.placeholder')"
            class="flex-1 border-none bg-transparent text-lg placeholder-gray-400 shadow-none outline-none focus:border-none focus:shadow-none focus:outline-none focus:ring-0"
          />
          <button class="rounded p-1 hover:bg-gray-100" @click="isOpen = false">
            <XMarkIcon class="h-5 w-5 text-gray-400" />
          </button>
        </div>

        <div class="max-h-96 overflow-y-auto">
          <div v-if="query.length < 2" class="p-2">
            <p class="px-3 py-2 text-xs font-medium uppercase text-gray-400">{{ t('search.quickNav') }}</p>
            <button
              v-for="(link, i) in quickLinks"
              :key="link.href"
              :class="[
                'flex w-full items-center gap-3 rounded-lg px-3 py-2 transition-colors',
                selectedIndex === i ? 'bg-primary-50 text-primary-700' : 'hover:bg-gray-50',
              ]"
              @click="go(link.href)"
            >
              <component :is="link.icon" class="h-5 w-5" />
              <span class="font-medium">{{ link.label() }}</span>
            </button>
          </div>

          <div v-else-if="results.length" class="p-2">
            <button
              v-for="(r, i) in results"
              :key="`${r.type}-${r.id}`"
              :class="[
                'flex w-full items-center gap-3 rounded-lg px-3 py-2 transition-colors',
                selectedIndex === i ? 'bg-primary-50 text-primary-700' : 'hover:bg-gray-50',
              ]"
              @click="go(r.href)"
            >
              <div :class="['flex h-8 w-8 items-center justify-center rounded-lg', TYPE_STYLE[r.type]?.bg || 'bg-gray-100']">
                <component :is="r.icon" :class="['h-4 w-4', TYPE_STYLE[r.type]?.fg || 'text-gray-600']" />
              </div>
              <div class="min-w-0 text-start">
                <p class="truncate font-medium">{{ r.name }}</p>
                <p class="truncate text-sm text-gray-500">{{ r.subtitle }}</p>
              </div>
              <span class="ms-auto shrink-0 text-xs capitalize text-gray-400">{{ t(`search.types.${r.type}`) }}</span>
            </button>
          </div>

          <div v-else-if="query.length >= 2 && !isLoading" class="p-8 text-center text-gray-500">
            <p>{{ t('search.noResults', { query }) }}</p>
          </div>

          <div v-else-if="isLoading" class="p-8 text-center">
            <div class="mx-auto h-6 w-6 animate-spin rounded-full border-b-2 border-black"></div>
          </div>
        </div>

        <div class="flex items-center justify-between border-t border-gray-100 bg-gray-50 px-4 py-3 text-xs text-gray-500">
          <div class="flex gap-4">
            <span><kbd class="rounded border bg-white px-1.5 py-0.5">↑↓</kbd> {{ t('search.navigate') }}</span>
            <span><kbd class="rounded border bg-white px-1.5 py-0.5">↵</kbd> {{ t('search.open') }}</span>
          </div>
          <span><kbd class="rounded border bg-white px-1.5 py-0.5">Esc</kbd> {{ t('search.close') }}</span>
        </div>
      </div>
    </div>
  </Teleport>
</template>
