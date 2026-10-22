<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/vue/20/solid';

/** Numbered pager (1 … 4 5 6 … 20) with previous / next and an optional page-size picker. */
const props = defineProps({
  page: { type: Number, required: true },
  totalPages: { type: Number, required: true },
  total: { type: Number, default: 0 },
  pageSize: { type: Number, default: 0 },
  pageSizes: { type: Array, default: () => [] },
});
const emit = defineEmits(['update:page', 'update:pageSize']);
const { t } = useI18n();

/** Pages to show around the current one; null marks a gap. */
const items = computed(() => {
  const n = props.totalPages;
  const c = props.page;
  if (n <= 7) return Array.from({ length: n }, (_, i) => i + 1);
  const set = new Set([1, n, c - 1, c, c + 1]);
  if (c <= 3) [2, 3, 4].forEach((x) => set.add(x));
  if (c >= n - 2) [n - 3, n - 2, n - 1].forEach((x) => set.add(x));
  const pages = [...set].filter((x) => x >= 1 && x <= n).sort((a, b) => a - b);
  const out = [];
  pages.forEach((x, i) => {
    if (i && x - pages[i - 1] > 1) out.push(null);
    out.push(x);
  });
  return out;
});
const from = computed(() => (props.total ? (props.page - 1) * props.pageSize + 1 : 0));
const to = computed(() => Math.min(props.total, props.page * props.pageSize));
const go = (p) => p >= 1 && p <= props.totalPages && p !== props.page && emit('update:page', p);
const btn = 'inline-flex h-8 min-w-8 items-center justify-center rounded-lg border px-1.5 text-sm sm:h-9 sm:min-w-9 sm:px-2 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40';
</script>

<template>
  <div class="flex flex-wrap items-center justify-between gap-3">
    <div class="flex items-center gap-3 text-sm text-gray-500">
      <span v-if="pageSize && total">{{ t('common.rangeOf', { from, to, total }) }}</span>
      <label v-if="pageSizes.length" class="flex items-center gap-1.5">
        <span class="hidden sm:inline">{{ t('common.perPage') }}</span>
        <select
          class="rounded-lg border border-gray-200 bg-white py-1 ps-2 pe-7 text-sm text-gray-700 focus:border-black focus:ring-black"
          :value="pageSize"
          :aria-label="t('common.perPage')"
          @change="emit('update:pageSize', Number($event.target.value))"
        >
          <option v-for="s in pageSizes" :key="s" :value="s">{{ s }}</option>
        </select>
      </label>
    </div>
    <nav v-if="totalPages > 1" class="flex max-w-full items-center gap-0.5 sm:gap-1" :aria-label="t('common.pagination')">
      <button type="button" :class="[btn, 'border-gray-200 bg-white text-gray-700 hover:border-gray-400']" :disabled="page <= 1" :aria-label="t('common.previous')" @click="go(page - 1)">
        <ChevronLeftIcon class="h-5 w-5 rtl:rotate-180" /><span class="hidden xl:inline pe-1">{{ t('common.previous') }}</span>
      </button>
      <template v-for="(p, i) in items" :key="p ?? `gap-${i}`">
        <span v-if="p === null" class="px-0.5 text-gray-400 sm:px-1">…</span>
        <button
          v-else
          type="button"
          :class="[btn, p === page ? 'border-black bg-black text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400']"
          :aria-current="p === page ? 'page' : undefined"
          @click="go(p)"
        >
          {{ p }}
        </button>
      </template>
      <button type="button" :class="[btn, 'border-gray-200 bg-white text-gray-700 hover:border-gray-400']" :disabled="page >= totalPages" :aria-label="t('common.next')" @click="go(page + 1)">
        <span class="hidden xl:inline ps-1">{{ t('common.next') }}</span><ChevronRightIcon class="h-5 w-5 rtl:rotate-180" />
      </button>
    </nav>
  </div>
</template>
