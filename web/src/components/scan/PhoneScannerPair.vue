<script setup>
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { DevicePhoneMobileIcon, XMarkIcon } from '@heroicons/vue/24/outline';
import { usePhoneScanner } from '@/composables/usePhoneScanner';
import ScannerDevicesManager from './ScannerDevicesManager.vue';

/**
 * Header button "Phone": the phones that scan for this business (authorize one with a one-time QR code, rename,
 * choose where each one sends its scans, revoke). The dot shows that this computer is receiving scans.
 */
const { t } = useI18n();
const { state } = usePhoneScanner();
const open = ref(false);
</script>

<template>
  <button
    type="button"
    class="relative hidden items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 lg:flex"
    :title="t('scan.pair.button')"
    :aria-label="t('scan.pair.button')"
    @click="open = true"
  >
    <DevicePhoneMobileIcon class="h-5 w-5" />
    <span class="hidden xl:inline">{{ t('scan.pair.short') }}</span>
    <span v-if="state.screen" class="absolute -end-1 -top-1 h-2.5 w-2.5 rounded-full ring-2 ring-white" :class="state.online ? 'bg-success-500' : 'bg-warning-500'" />
  </button>

  <Teleport to="body">
    <div v-if="open" class="modal-overlay" @click.self="open = false">
      <div class="modal-content max-w-lg" role="dialog" :aria-label="t('scan.pair.title')">
        <div class="modal-header">
          <h3 class="text-lg font-bold text-gray-900">{{ t('scan.pair.title') }}</h3>
          <button class="rounded p-1 hover:bg-gray-100" :aria-label="t('common.close')" @click="open = false"><XMarkIcon class="h-5 w-5" /></button>
        </div>
        <div class="modal-body">
          <ScannerDevicesManager />
        </div>
        <div class="modal-footer">
          <RouterLink to="/app/settings?tab=scanners" class="btn-secondary" @click="open = false">{{ t('scan.devices.inSettings') }}</RouterLink>
          <button class="btn-primary" @click="open = false">{{ t('common.close') }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
