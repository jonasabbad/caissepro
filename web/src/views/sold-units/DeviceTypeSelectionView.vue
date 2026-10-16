<script setup>
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import {
  ArrowLeftIcon,
  ChevronRightIcon,
  ComputerDesktopIcon,
  DevicePhoneMobileIcon,
  DeviceTabletIcon,
  ClockIcon,
} from '@heroicons/vue/24/outline';

const { t } = useI18n();
const router = useRouter();

const TYPES = [
  { id: 'phone', icon: DevicePhoneMobileIcon, tileBg: 'bg-blue-50', iconColor: 'text-blue-600' },
  { id: 'tablet', icon: DeviceTabletIcon, tileBg: 'bg-purple-50', iconColor: 'text-purple-600' },
  { id: 'laptop', icon: ComputerDesktopIcon, tileBg: 'bg-gray-200', iconColor: 'text-gray-700' },
  { id: 'macbook', icon: ComputerDesktopIcon, tileBg: 'bg-gray-100', iconColor: 'text-gray-600' },
  { id: 'watch', icon: ClockIcon, tileBg: 'bg-rose-50', iconColor: 'text-rose-600' },
];

const choose = (type) => router.push({ path: '/app/sold-units/form', query: { type } });
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center gap-4">
      <RouterLink to="/app/sold-units" class="rounded-lg p-2 transition-colors duration-150 hover:bg-gray-100"><ArrowLeftIcon class="h-5 w-5" /></RouterLink>
      <div>
        <h1 class="text-2xl font-bold text-gray-900">{{ t('soldUnits.add') }}</h1>
        <p class="text-sm text-gray-500">{{ t('soldUnits.selectDeviceType') }}</p>
      </div>
    </div>
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <button
        v-for="type in TYPES"
        :key="type.id"
        type="button"
        class="group flex flex-col items-start rounded-xl border border-gray-200 bg-white p-6 text-start transition-colors duration-150 hover:border-gray-300 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
        @click="choose(type.id)"
      >
        <div class="mb-4 flex w-full items-center justify-between">
          <span :class="['flex h-12 w-12 items-center justify-center rounded-lg', type.tileBg]">
            <component :is="type.icon" :class="['h-6 w-6', type.iconColor]" aria-hidden="true" />
          </span>
          <ChevronRightIcon class="h-5 w-5 text-gray-300 transition-colors duration-150 group-hover:text-gray-600 rtl:rotate-180" aria-hidden="true" />
        </div>
        <h3 class="text-base font-semibold text-gray-900">{{ t(`soldUnits.deviceTypes.${type.id}.name`) }}</h3>
        <p class="mt-1 text-sm text-gray-500">{{ t(`soldUnits.deviceTypes.${type.id}.description`) }}</p>
      </button>
    </div>
  </div>
</template>
