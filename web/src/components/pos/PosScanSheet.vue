<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ArrowPathIcon, CheckCircleIcon, ExclamationTriangleIcon, MagnifyingGlassIcon, MinusIcon, PlusIcon, ShoppingCartIcon, TrashIcon, VideoCameraSlashIcon, XMarkIcon } from '@heroicons/vue/24/outline';
import { useBarcodeCamera } from '@/composables/useBarcodeCamera';
import { useCartStore } from '@/stores/cart';
import { productsApi } from '@/api/products';
import { formatCurrency } from '@/utils/format';
import CartLinePrice from '@/components/pos/CartLinePrice.vue';

/**
 * Phone cashier: scan products one after the other with the camera (the camera stays on), see each line and the
 * running total, fix a quantity or a price, then go to checkout. A product search replaces the camera when there is
 * none or it is refused. Scanned / typed codes go to the page (`code`), which looks them up exactly and adds them;
 * it reports back through `feedback` ({ type: 'success' | 'error', text, at }).
 */
const props = defineProps({ open: Boolean, feedback: { type: Object, default: null } });
const emit = defineEmits(['close', 'code', 'pick', 'checkout']);
const { t } = useI18n();
const cart = useCartStore();

const video = ref(null);
const { status, error, start, stop } = useBarcodeCamera(video, (code) => emit('code', code), { continuous: true });

// ── Manual search (fallback without camera, or for products without a barcode) ──
const query = ref('');
const results = ref([]);
const searching = ref(false);
const searchInput = ref(null);
let searchTimer = null;
let searchSeq = 0;
watch(query, (q) => {
  clearTimeout(searchTimer);
  const text = q.trim();
  if (text.length < 2) {
    results.value = [];
    searching.value = false;
    return;
  }
  searching.value = true;
  searchTimer = setTimeout(async () => {
    const seq = ++searchSeq;
    try {
      const found = (await productsApi.getAll({ query: text, limit: 8 })).products ?? [];
      if (seq === searchSeq) results.value = found;
    } catch {
      if (seq === searchSeq) results.value = [];
    } finally {
      if (seq === searchSeq) searching.value = false;
    }
  }, 250);
});
function pick(p) {
  emit('pick', p);
  query.value = '';
  results.value = [];
}
// Enter: a product whose barcode / SKU is exactly what was typed, else the code is looked up like a scan.
function submitSearch() {
  const text = query.value.trim();
  if (!text) return;
  const exact = results.value.find((p) => p.barcode === text || p.sku === text);
  if (exact) return pick(exact);
  if (results.value.length === 1) return pick(results.value[0]);
  emit('code', text);
  query.value = '';
}

const cameraProblem = computed(() => status.value === 'error');
watch(
  () => props.open,
  async (o) => {
    if (o) {
      query.value = '';
      await nextTick();
      start();
    } else stop();
  },
  { immediate: true },
);
// Without a camera the search field takes over.
watch(cameraProblem, async (bad) => {
  if (bad && props.open) {
    await nextTick();
    searchInput.value?.focus();
  }
});
onBeforeUnmount(() => clearTimeout(searchTimer));

const lines = computed(() => [...cart.items].reverse()); // last scanned first
function close() {
  stop();
  emit('close');
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-[45] flex items-stretch justify-center bg-black/50 sm:items-center sm:p-4" @click.self="close">
      <section
        class="flex h-[100dvh] w-full flex-col overflow-hidden bg-white sm:h-[min(52rem,92dvh)] sm:max-w-lg sm:rounded-2xl sm:shadow-2xl"
        role="dialog"
        aria-modal="true"
        :aria-label="t('pos.scanSheet.title')"
      >
        <!-- Header -->
        <header class="flex h-14 shrink-0 items-center justify-between border-b border-gray-100 px-4">
          <h2 class="text-base font-semibold text-gray-900">{{ t('pos.scanSheet.title') }}</h2>
          <button type="button" class="-me-2 inline-flex h-11 w-11 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100" :aria-label="t('common.close')" @click="close">
            <XMarkIcon class="h-6 w-6" />
          </button>
        </header>

        <!-- Camera -->
        <div dir="ltr" class="relative h-[30dvh] min-h-[10rem] shrink-0 bg-black sm:h-56">
          <video ref="video" class="h-full w-full object-cover" muted playsinline />
          <div v-if="status === 'scanning'" class="pointer-events-none absolute inset-x-10 top-1/2 h-24 -translate-y-1/2 rounded-xl border-2 border-white/80">
            <div class="absolute inset-x-2 top-1/2 h-0.5 bg-danger-500/80" />
          </div>
          <div v-if="status === 'starting'" class="absolute inset-0 flex items-center justify-center text-sm text-white/80" dir="auto">
            <ArrowPathIcon class="me-2 h-5 w-5 animate-spin" /> {{ t('scan.starting') }}
          </div>
          <div v-if="cameraProblem" class="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-sm text-white" role="alert">
            <VideoCameraSlashIcon class="h-8 w-8 text-white/70" />
            <p dir="auto">{{ t(`scan.errors.${error}`) }}</p>
            <p class="text-xs text-white/70" dir="auto">{{ t('pos.scanSheet.useSearch') }}</p>
            <button v-if="error !== 'insecure'" type="button" class="btn-secondary btn-sm" @click="start">{{ t('common.retry') }}</button>
          </div>
          <p v-if="status === 'scanning'" class="pointer-events-none absolute inset-x-0 bottom-2 text-center text-xs text-white/80" dir="auto">{{ t('pos.scanSheet.aim') }}</p>
        </div>

        <!-- Last scan -->
        <div aria-live="polite" class="shrink-0">
          <div
            v-if="feedback"
            :key="feedback.at"
            :class="[
              'flex items-start gap-2 px-4 py-2.5 text-sm font-medium',
              feedback.type === 'success' ? 'bg-success-50 text-success-800' : 'bg-danger-50 text-danger-700',
            ]"
          >
            <CheckCircleIcon v-if="feedback.type === 'success'" class="mt-0.5 h-5 w-5 shrink-0" />
            <ExclamationTriangleIcon v-else class="mt-0.5 h-5 w-5 shrink-0" />
            <span class="min-w-0 break-words">{{ feedback.text }}</span>
          </div>
        </div>

        <!-- Manual search -->
        <div class="relative shrink-0 border-b border-gray-100 px-4 py-3">
          <form role="search" @submit.prevent="submitSearch">
            <label for="pos-scan-search" class="sr-only">{{ t('pos.scanSheet.searchLabel') }}</label>
            <div class="relative">
              <MagnifyingGlassIcon class="pointer-events-none absolute start-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <input
                id="pos-scan-search"
                ref="searchInput"
                v-model="query"
                type="search"
                enterkeyhint="search"
                autocomplete="off"
                class="input h-11 ps-10 text-base"
                :placeholder="t('pos.scanSheet.searchPlaceholder')"
              />
            </div>
          </form>
          <ul
            v-if="query.trim().length >= 2"
            class="absolute inset-x-4 top-full z-10 mt-1 max-h-64 overflow-y-auto rounded-xl border border-gray-200 bg-white py-1 shadow-lg"
            role="listbox"
            :aria-label="t('pos.scanSheet.searchLabel')"
          >
            <li v-if="searching" class="px-3 py-3 text-sm text-gray-500">{{ t('common.loading') }}</li>
            <li v-else-if="!results.length" class="px-3 py-3 text-sm text-gray-500">{{ t('pos.scanSheet.noResults') }}</li>
            <li v-for="p in searching ? [] : results" :key="p.id" role="option" :aria-selected="false">
              <button type="button" class="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-start hover:bg-gray-50 active:bg-gray-100" @click="pick(p)">
                <span class="min-w-0">
                  <span class="block truncate text-sm font-medium text-gray-900">{{ p.name }}</span>
                  <span class="block truncate text-xs text-gray-500" dir="ltr">{{ p.barcode || p.sku }}</span>
                </span>
                <span class="shrink-0 text-end">
                  <span class="block text-sm font-semibold text-gray-900">{{ formatCurrency(Number(p.retailPrice)) }}</span>
                  <span :class="['block text-xs', Number(p.stockQuantity) > 0 ? 'text-gray-500' : 'text-danger-600']">{{ t('scan.stock', { n: p.stockQuantity }) }}</span>
                </span>
              </button>
            </li>
          </ul>
        </div>

        <!-- Cart lines -->
        <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div v-if="cart.isEmpty" class="flex h-full flex-col items-center justify-center gap-1 px-6 py-8 text-center text-gray-400">
            <ShoppingCartIcon class="h-10 w-10" />
            <p class="text-sm font-medium">{{ t('pos.scanSheet.empty') }}</p>
          </div>
          <ul v-else class="divide-y divide-gray-100">
            <li v-for="item in lines" :key="item.productId" class="px-4 py-3">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-medium leading-snug text-gray-900">{{ item.product.name }}</p>
                  <CartLinePrice :item="item" />
                </div>
                <p class="shrink-0 text-base font-bold text-gray-900">{{ formatCurrency(item.total) }}</p>
              </div>
              <div class="mt-2 flex items-center justify-between">
                <div v-if="!item.soldUnit" class="flex items-center gap-1">
                  <button
                    type="button"
                    class="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white active:bg-gray-100"
                    :aria-label="t('pos.scanSheet.less', { name: item.product.name })"
                    @click="cart.updateItemQuantity(item.productId, item.quantity - 1)"
                  >
                    <MinusIcon class="h-4 w-4" />
                  </button>
                  <span class="w-10 text-center text-base font-semibold tabular-nums" aria-live="polite">{{ item.saleMode === 'pack' ? item.quantity / (item.packSize || 1) : item.quantity }}</span>
                  <button
                    type="button"
                    class="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white active:bg-gray-100"
                    :aria-label="t('pos.scanSheet.more', { name: item.product.name })"
                    @click="cart.updateItemQuantity(item.productId, item.quantity + 1)"
                  >
                    <PlusIcon class="h-4 w-4" />
                  </button>
                </div>
                <span v-else class="text-xs text-gray-500">{{ t('pos.uniqueItem') }}</span>
                <button
                  type="button"
                  class="inline-flex h-10 w-10 items-center justify-center rounded-lg text-gray-400 hover:text-danger-600 active:bg-gray-100"
                  :aria-label="t('pos.scanSheet.remove', { name: item.product.name })"
                  @click="cart.removeItem(item.productId)"
                >
                  <TrashIcon class="h-5 w-5" />
                </button>
              </div>
            </li>
          </ul>
        </div>

        <!-- Total + checkout, always in view -->
        <footer class="shrink-0 border-t border-gray-200 bg-white px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-4px_12px_-6px_rgb(0_0_0/0.15)]">
          <div class="mb-3 flex items-end justify-between gap-3">
            <div>
              <p class="text-xs font-medium uppercase tracking-wide text-gray-500">{{ t('pos.total') }}</p>
              <p class="text-xs text-gray-500">{{ t('pos.scanSheet.items', { n: cart.itemCount }) }}</p>
            </div>
            <p class="text-3xl font-bold tabular-nums text-gray-900" aria-live="polite">{{ formatCurrency(cart.total) }}</p>
          </div>
          <button type="button" class="btn-primary h-12 w-full text-base" :disabled="cart.isEmpty" @click="emit('checkout')">{{ t('pos.checkout') }}</button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>
