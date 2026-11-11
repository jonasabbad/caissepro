<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  ArrowPathIcon,
  ArrowsPointingInIcon,
  ArrowsPointingOutIcon,
  ComputerDesktopIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
  MinusIcon,
  PlusIcon,
  ShoppingCartIcon,
  TrashIcon,
  VideoCameraSlashIcon,
  XMarkIcon,
} from '@heroicons/vue/24/outline';
import { useBarcodeCamera } from '@/composables/useBarcodeCamera';
import { useCartStore } from '@/stores/cart';
import { productsApi } from '@/api/products';
import { formatCurrency } from '@/utils/format';
import { lineFigures } from '@/utils/posScan';
import CartLinePrice from '@/components/pos/CartLinePrice.vue';

/**
 * Phone cashier (the POS on a phone): the camera stays on while you scan one product after another; the last scanned
 * product stays in view (selling price, cost and stock kept apart), the whole cart below it, the running total and
 * Checkout always at the bottom. Everything is the POS's own cart: same lines, prices, stock limits and totals.
 * Scanned / typed codes go to the page (`code`), which looks them up exactly and adds them through the POS steps; it
 * reports back through `feedback` ({ type: 'success' | 'error', text, at, lineId }).
 */
// fromScanner: opened from CaissePro Scanner, which can be switched back to sending scans to a computer (`scanner`).
const props = defineProps({ open: Boolean, feedback: { type: Object, default: null }, fromScanner: Boolean });
const emit = defineEmits(['close', 'code', 'pick', 'checkout', 'scanner']);
const { t } = useI18n();
const cart = useCartStore();

const video = ref(null);
const { status, error, start, stop } = useBarcodeCamera(video, (code) => emit('code', code), { continuous: true });

// ── Camera size: big to aim, small to see more of the cart (remembered on this phone) ──
const COMPACT_KEY = 'pos_scan_camera_compact';
const compact = ref(readCompact());
function readCompact() {
  try {
    return localStorage.getItem(COMPACT_KEY) === '1';
  } catch {
    return false;
  }
}
function toggleCompact() {
  compact.value = !compact.value;
  try {
    localStorage.setItem(COMPACT_KEY, compact.value ? '1' : '0');
  } catch {
    /* kept for this visit only */
  }
}

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

// ── Last scanned product: follows its live cart line (quantity, edited price, total) ──
const lastLineId = ref(null);
const pulse = ref(0); // re-plays the highlight when the same product is scanned again
watch(
  () => props.feedback,
  (f) => {
    if (f?.type === 'success' && f.lineId) {
      lastLineId.value = f.lineId;
      pulse.value = f.at;
    }
  },
);
const lastLine = computed(() => cart.items.find((i) => i.productId === lastLineId.value) ?? null);
const fig = computed(() => lineFigures(lastLine.value, cart.items));
const lastCode = computed(() => {
  const p = lastLine.value?.product;
  return lastLine.value?.soldUnit?.imei || p?.barcode || p?.sku || '';
});
const stockTone = computed(() => {
  const f = fig.value;
  if (!f || lastLine.value?.soldUnit) return 'text-gray-900';
  return f.left <= 0 ? 'text-danger-700' : f.left <= 3 ? 'text-warning-700' : 'text-success-700';
});
const errorFeedback = computed(() => (props.feedback?.type === 'error' ? props.feedback : null));
const successText = computed(() => (props.feedback?.type === 'success' ? props.feedback.text : ''));

const cameraProblem = computed(() => status.value === 'error');
watch(
  () => props.open,
  async (o) => {
    if (o) {
      query.value = '';
      lastLineId.value = null;
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
const shownQty = (item) => (item.saleMode === 'pack' ? item.quantity / (item.packSize || 1) : item.quantity);
const signed = (n) => formatCurrency(n, 'DH', n > 0 ? '+' : '');
function close() {
  stop();
  emit('close');
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-[45] flex items-stretch justify-center bg-black/50 sm:items-center sm:p-4" @click.self="close">
      <section
        class="flex h-[100dvh] w-full flex-col overflow-hidden bg-gray-50 sm:h-[min(56rem,94dvh)] sm:max-w-lg sm:rounded-2xl sm:shadow-2xl"
        role="dialog"
        aria-modal="true"
        :aria-label="t('pos.scanSheet.title')"
      >
        <!-- Header -->
        <header class="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-gray-100 bg-white px-3" style="padding-top: env(safe-area-inset-top)">
          <h2 class="min-w-0 truncate ps-1 text-base font-semibold text-gray-900">{{ t('pos.scanSheet.title') }}</h2>
          <div class="flex shrink-0 items-center">
            <button
              v-if="fromScanner"
              type="button"
              class="inline-flex h-9 items-center gap-1.5 rounded-full border border-gray-200 px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50"
              :title="t('pos.scanSheet.backToScannerHint')"
              @click="emit('scanner')"
            >
              <ComputerDesktopIcon class="h-4 w-4" /> {{ t('pos.scanSheet.backToScanner') }}
            </button>
            <button
              type="button"
              class="inline-flex h-11 w-11 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
              :aria-label="compact ? t('pos.scanSheet.cameraBigger') : t('pos.scanSheet.cameraSmaller')"
              :title="compact ? t('pos.scanSheet.cameraBigger') : t('pos.scanSheet.cameraSmaller')"
              :aria-pressed="compact"
              @click="toggleCompact"
            >
              <ArrowsPointingOutIcon v-if="compact" class="h-5 w-5" />
              <ArrowsPointingInIcon v-else class="h-5 w-5" />
            </button>
            <button type="button" class="-me-1 inline-flex h-11 w-11 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100" :aria-label="t('common.close')" @click="close">
              <XMarkIcon class="h-6 w-6" />
            </button>
          </div>
        </header>

        <!-- Camera: stays on, always in view -->
        <div
          dir="ltr"
          :class="[
            'relative shrink-0 bg-black transition-[height] duration-200 ease-out motion-reduce:transition-none',
            compact ? 'h-24' : 'h-[24dvh] min-h-[9rem] sm:h-52',
          ]"
        >
          <video ref="video" class="h-full w-full object-cover" muted playsinline />
          <div
            v-if="status === 'scanning'"
            :class="['pointer-events-none absolute top-1/2 -translate-y-1/2 rounded-xl border-2 border-white/80', compact ? 'inset-x-6 h-14' : 'inset-x-10 h-24']"
          >
            <div class="absolute inset-x-2 top-1/2 h-0.5 bg-danger-500/80" />
          </div>
          <div v-if="status === 'starting'" class="absolute inset-0 flex items-center justify-center text-sm text-white/80" dir="auto">
            <ArrowPathIcon class="me-2 h-5 w-5 animate-spin" /> {{ t('scan.starting') }}
          </div>
          <div v-if="cameraProblem" class="absolute inset-0 flex flex-col items-center justify-center gap-1.5 p-3 text-center text-sm text-white" role="alert">
            <VideoCameraSlashIcon v-if="!compact" class="h-7 w-7 text-white/70" />
            <p dir="auto">{{ t(`scan.errors.${error}`) }}</p>
            <p class="text-xs text-white/70" dir="auto">{{ t('pos.scanSheet.useSearch') }}</p>
            <button v-if="error !== 'insecure'" type="button" class="btn-secondary btn-sm" @click="start">{{ t('common.retry') }}</button>
          </div>
          <p v-if="status === 'scanning' && !compact" class="pointer-events-none absolute inset-x-0 bottom-2 text-center text-xs text-white/80" dir="auto">{{ t('pos.scanSheet.aim') }}</p>
        </div>

        <!-- Unknown / invalid code, out of stock… -->
        <div aria-live="assertive" class="shrink-0">
          <div v-if="errorFeedback" :key="errorFeedback.at" class="flex items-start gap-2 bg-danger-50 px-4 py-2.5 text-sm font-medium text-danger-700">
            <ExclamationTriangleIcon class="mt-0.5 h-5 w-5 shrink-0" />
            <span class="min-w-0 break-words">{{ errorFeedback.text }}</span>
          </div>
        </div>
        <p class="sr-only" aria-live="polite">{{ successText }}</p>

        <!-- Scrolls under the camera: last scanned product, search, cart -->
        <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <!-- Last scanned product -->
          <Transition name="scan-card">
            <article v-if="lastLine && fig" :key="pulse" class="mx-3 mt-3 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm" :aria-label="t('pos.scanSheet.lastScanned')">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="text-[11px] font-medium uppercase tracking-wide text-gray-500">{{ t('pos.scanSheet.lastScanned') }}</p>
                  <p class="mt-0.5 text-base font-semibold leading-snug text-gray-900">{{ lastLine.product.name }}</p>
                  <p v-if="lastCode" class="truncate font-mono text-xs text-gray-500" dir="ltr">{{ lastCode }}</p>
                </div>
                <div class="shrink-0 rounded-xl bg-gray-900 px-3 py-1.5 text-center text-white">
                  <p class="text-[10px] font-medium uppercase tracking-wide text-white/70">{{ t('pos.scanSheet.inCart') }}</p>
                  <p class="text-xl font-bold leading-tight tabular-nums">× {{ fig.quantity }}</p>
                </div>
              </div>

              <dl class="mt-3 grid grid-cols-2 gap-2">
                <!-- Selling price: blue -->
                <div class="rounded-xl border border-primary-200 bg-primary-50 px-3 py-2">
                  <dt class="text-xs font-semibold text-primary-700">
                    {{ fig.perBox ? t('pos.scanSheet.sellingPriceBox', { n: fig.perBox }) : t('pos.scanSheet.sellingPrice') }}
                  </dt>
                  <dd class="mt-0.5 text-xl font-bold tabular-nums text-primary-900">{{ formatCurrency(fig.sellingPrice) }}</dd>
                </div>
                <!-- Cost: orange, never mistaken for the price -->
                <div class="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2">
                  <dt class="text-xs font-semibold text-orange-700">{{ fig.perBox ? t('pos.scanSheet.costBox', { n: fig.perBox }) : t('pos.scanSheet.cost') }}</dt>
                  <dd class="mt-0.5 text-xl font-bold tabular-nums text-orange-800">{{ formatCurrency(fig.cost) }}</dd>
                </div>
              </dl>

              <!-- Stock: its own card -->
              <div class="mt-2 flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                <p class="text-xs font-semibold text-gray-600">{{ t('pos.scanSheet.stock') }}</p>
                <p v-if="lastLine.soldUnit" class="text-sm font-semibold text-gray-900">{{ t('pos.scanSheet.device') }}</p>
                <p v-else class="text-end text-sm">
                  <span class="font-semibold text-gray-900">{{ t('pos.scanSheet.inStock', { n: fig.stock }) }}</span>
                  <span :class="['block text-xs font-medium', stockTone]">{{ t('pos.scanSheet.stockLeft', { n: fig.left }) }}</span>
                </p>
              </div>

              <!-- This line: price for this sale (editable), total, profit -->
              <div class="mt-2 flex items-end justify-between gap-3 border-t border-gray-100 pt-2">
                <CartLinePrice :item="lastLine" />
                <div class="shrink-0 text-end">
                  <p class="text-lg font-bold tabular-nums text-gray-900">{{ formatCurrency(fig.total) }}</p>
                  <p :class="['text-xs font-medium tabular-nums', fig.profit >= 0 ? 'text-success-700' : 'text-danger-700']">{{ t('pos.profit') }} {{ signed(fig.profit) }}</p>
                </div>
              </div>
            </article>
          </Transition>

          <!-- Manual search -->
          <div class="relative px-3 pt-3">
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
                  class="input h-11 bg-white ps-10 text-base"
                  :placeholder="t('pos.scanSheet.searchPlaceholder')"
                />
              </div>
            </form>
            <ul
              v-if="query.trim().length >= 2"
              class="absolute inset-x-3 top-full z-10 mt-1 max-h-64 overflow-y-auto rounded-xl border border-gray-200 bg-white py-1 shadow-lg"
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
                    <span class="block text-sm font-semibold text-primary-700">{{ formatCurrency(Number(p.retailPrice)) }}</span>
                    <span :class="['block text-xs', Number(p.stockQuantity) > 0 ? 'text-gray-500' : 'text-danger-600']">{{ t('scan.stock', { n: p.stockQuantity }) }}</span>
                  </span>
                </button>
              </li>
            </ul>
          </div>

          <!-- Cart -->
          <div v-if="cart.isEmpty" class="flex flex-col items-center justify-center gap-1 px-6 py-10 text-center text-gray-400">
            <ShoppingCartIcon class="h-10 w-10" />
            <p class="text-sm font-medium">{{ t('pos.scanSheet.empty') }}</p>
          </div>
          <section v-else class="mx-3 my-3 overflow-hidden rounded-2xl border border-gray-200 bg-white" :aria-label="t('pos.cart')">
            <h3 class="border-b border-gray-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{{ t('pos.scanSheet.cartTitle', { n: cart.itemCount }) }}</h3>
            <ul class="divide-y divide-gray-100">
              <li
                v-for="item in lines"
                :key="item.productId"
                :class="['px-3 py-3 transition-colors duration-300 motion-reduce:transition-none', item.productId === lastLineId && 'bg-primary-50/40']"
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0 flex-1">
                    <p class="text-sm font-medium leading-snug text-gray-900">{{ item.product.name }}</p>
                    <CartLinePrice :item="item" />
                  </div>
                  <div class="shrink-0 text-end">
                    <p class="text-base font-bold tabular-nums text-gray-900">{{ formatCurrency(item.total) }}</p>
                    <p :class="['text-xs tabular-nums', item.profit >= 0 ? 'text-success-600' : 'text-danger-600']">{{ signed(item.profit) }}</p>
                  </div>
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
                    <span class="w-10 text-center text-base font-semibold tabular-nums" aria-live="polite">{{ shownQty(item) }}</span>
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
          </section>
        </div>

        <!-- Totals + checkout, always in view -->
        <footer class="shrink-0 border-t border-gray-200 bg-white px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2.5 shadow-[0_-4px_12px_-6px_rgb(0_0_0/0.15)]">
          <dl class="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs text-gray-600">
            <div class="flex gap-1"><dt>{{ t('pos.subtotal') }}</dt><dd class="font-semibold tabular-nums text-gray-900">{{ formatCurrency(cart.subtotal) }}</dd></div>
            <div v-if="cart.taxAmount > 0" class="flex gap-1"><dt>{{ t('pos.tax') }}</dt><dd class="font-semibold tabular-nums text-gray-900">{{ formatCurrency(cart.taxAmount) }}</dd></div>
            <div v-if="cart.discountAmount > 0" class="flex gap-1"><dt>{{ t('pos.discount') }}</dt><dd class="font-semibold tabular-nums text-gray-900">−{{ formatCurrency(cart.discountAmount) }}</dd></div>
            <div v-if="cart.hasTradeIn" class="flex gap-1"><dt>{{ t('pos.tradeInDeduction') }}</dt><dd class="font-semibold tabular-nums text-gray-900">−{{ formatCurrency(cart.totalTradeInValue) }}</dd></div>
            <div class="flex gap-1">
              <dt>{{ t('pos.profit') }}</dt>
              <dd :class="['font-semibold tabular-nums', cart.totalProfit >= 0 ? 'text-success-700' : 'text-danger-700']">{{ signed(cart.totalProfit) }}</dd>
            </div>
          </dl>
          <div class="mt-2 flex items-center gap-3">
            <div class="min-w-0 flex-1">
              <p class="text-[11px] font-medium uppercase tracking-wide text-gray-500">{{ t('pos.total') }} · {{ t('pos.scanSheet.items', { n: cart.itemCount }) }}</p>
              <!-- What the payment will ask for (the POS's own amount due) -->
              <p class="truncate text-3xl font-bold leading-tight tabular-nums text-gray-900" aria-live="polite">{{ formatCurrency(cart.hasTradeIn ? cart.totalAfterTradeIn : cart.total) }}</p>
            </div>
            <button type="button" class="btn-primary h-12 shrink-0 px-6 text-base" :disabled="cart.isEmpty" @click="emit('checkout')">{{ t('pos.checkout') }}</button>
          </div>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.scan-card-enter-active {
  transition:
    opacity 180ms ease-out,
    transform 180ms ease-out;
}
.scan-card-enter-from {
  opacity: 0;
  transform: translateY(4px);
}
.scan-card-leave-active {
  display: none;
}
@media (prefers-reduced-motion: reduce) {
  .scan-card-enter-active {
    transition: none;
  }
}
</style>
