<script setup>
// "?" opens the shortcut sheet; "g" then h/p/c/t (within 1 s) jumps to a page.
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { XMarkIcon } from '@heroicons/vue/24/outline';

const { t } = useI18n();
const router = useRouter();
const isOpen = ref(false);

const groups = computed(() => [
  {
    category: t('shortcuts.navigation'),
    items: [
      { keys: ['⌘', 'K'], description: t('shortcuts.globalSearch') },
      { keys: ['G', 'H'], description: t('shortcuts.goDashboard') },
      { keys: ['G', 'P'], description: t('shortcuts.goProducts') },
      { keys: ['G', 'C'], description: t('shortcuts.goPos') },
      { keys: ['G', 'T'], description: t('shortcuts.goTransactions') },
    ],
  },
  {
    category: t('shortcuts.pos'),
    items: [
      { keys: ['F2'], description: t('shortcuts.validatePayment') },
      { keys: ['Echap'], description: t('shortcuts.closeModal') },
      { keys: ['↑', '↓'], description: t('shortcuts.navigateResults') },
      { keys: [t('common.enterKey')], description: t('shortcuts.selectProduct') },
    ],
  },
  {
    category: t('shortcuts.general'),
    items: [
      { keys: ['?'], description: t('shortcuts.showShortcuts') },
      { keys: ['Echap'], description: t('shortcuts.closeModals') },
    ],
  },
]);

const isTyping = (target) => target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;

function onKeydown(e) {
  if (isTyping(e.target)) return;
  if (e.key === '?') {
    e.preventDefault();
    isOpen.value = !isOpen.value;
  }
  if (e.key === 'Escape' && isOpen.value) isOpen.value = false;
  if (e.key === 'g' && !e.metaKey && !e.ctrlKey) {
    const second = (ev) => {
      window.removeEventListener('keydown', second);
      if (isTyping(ev.target)) return;
      const target = { h: '/app/dashboard', p: '/app/products', c: '/app/pos', t: '/app/transactions' }[ev.key];
      if (target) router.push(target);
    };
    setTimeout(() => {
      window.addEventListener('keydown', second, { once: true });
      setTimeout(() => window.removeEventListener('keydown', second), 1000);
    }, 0);
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onUnmounted(() => window.removeEventListener('keydown', onKeydown));

defineExpose({ open: () => (isOpen.value = true) });
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition ease-out duration-200"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition ease-in duration-150"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div v-if="isOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" @click.self="isOpen = false">
        <div class="max-h-[80vh] w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-xl">
          <div class="flex items-center justify-between border-b border-gray-100 px-6 py-4">
            <h2 class="text-lg font-bold text-gray-900">{{ t('shortcuts.title') }}</h2>
            <button class="rounded-lg p-1 transition-colors hover:bg-gray-100" @click="isOpen = false">
              <XMarkIcon class="h-5 w-5 text-gray-500" />
            </button>
          </div>
          <div class="max-h-[60vh] space-y-6 overflow-y-auto p-6">
            <div v-for="g in groups" :key="g.category">
              <h3 class="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">{{ g.category }}</h3>
              <div class="space-y-2">
                <div v-for="item in g.items" :key="item.description" class="flex items-center justify-between">
                  <span class="text-gray-700">{{ item.description }}</span>
                  <div class="flex items-center gap-1">
                    <kbd
                      v-for="k in item.keys"
                      :key="k"
                      class="min-w-[1.75rem] rounded border border-gray-200 bg-gray-100 px-2 py-1 text-center text-xs font-medium text-gray-700"
                    >
                      {{ k }}
                    </kbd>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
