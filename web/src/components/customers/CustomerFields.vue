<script setup>
import { useI18n } from 'vue-i18n';
import CitySelect from '@/components/ui/CitySelect.vue';

const form = defineModel({ type: Object, required: true });
defineProps({ detailed: Boolean });
const { t } = useI18n();
</script>

<template>
  <div class="space-y-4">
    <div class="grid grid-cols-2 gap-4">
      <div>
        <label class="label">{{ t('customers.firstName') }} <span class="text-danger-600">*</span></label>
        <input v-model="form.firstName" type="text" class="input" required :placeholder="detailed ? t('customers.firstNamePlaceholder') : ''" />
      </div>
      <div>
        <label class="label">{{ t('customers.lastName') }}</label>
        <input v-model="form.lastName" type="text" class="input" :placeholder="detailed ? t('customers.lastNamePlaceholder') : ''" />
      </div>
    </div>
    <div class="grid grid-cols-2 gap-4">
      <div>
        <label class="label">{{ t('customers.phone') }}</label>
        <input v-model="form.phone" type="tel" class="input" :placeholder="detailed ? '06 12 34 56 78' : ''" />
      </div>
      <div>
        <label class="label">{{ t('customers.email') }}</label>
        <input v-model="form.email" type="email" class="input" :placeholder="detailed ? 'email@example.com' : ''" />
      </div>
    </div>
    <div class="grid grid-cols-2 gap-4">
      <div>
        <label class="label">{{ t('customers.cin') }}</label>
        <input v-model="form.cin" type="text" class="input" placeholder="BE123456" />
        <p v-if="detailed" class="mt-1 text-xs text-gray-500">{{ t('customers.cinHelp') }}</p>
      </div>
      <div>
        <label class="label">{{ t('customers.ice') }}</label>
        <input v-model="form.ice" type="text" class="input" placeholder="001234567000089" />
        <p v-if="detailed" class="mt-1 text-xs text-gray-500">{{ t('customers.iceHelp') }}</p>
      </div>
    </div>
    <div>
      <label class="label">{{ t('customers.address') }}</label>
      <input v-model="form.address" type="text" class="input" :placeholder="detailed ? t('customers.addressPlaceholder') : ''" />
    </div>
    <div>
      <label class="label">{{ t('customers.city') }}</label>
      <CitySelect v-model="form.city" :placeholder="t('customers.selectCity')" />
    </div>
    <div>
      <label class="label">{{ t('customers.notes') }}</label>
      <textarea v-model="form.notes" class="input" :rows="detailed ? 4 : 3" :placeholder="t('customers.notesPlaceholder')" />
      <p v-if="detailed" class="mt-1 text-xs text-gray-500">{{ t('customers.notesHelp') }}</p>
    </div>
  </div>
</template>
