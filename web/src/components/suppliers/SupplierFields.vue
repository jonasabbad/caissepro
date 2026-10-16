<script setup>
import { useI18n } from 'vue-i18n';
import CitySelect from '@/components/ui/CitySelect.vue';

const form = defineModel({ type: Object, required: true });
const { t } = useI18n();
</script>

<template>
  <div class="space-y-4">
    <div>
      <label class="label">{{ t('suppliers.name') }} *</label>
      <input v-model="form.name" type="text" class="input" required />
    </div>
    <div>
      <label class="label">{{ t('suppliers.contactName') }}</label>
      <input v-model="form.contactName" type="text" class="input" />
    </div>
    <div class="grid grid-cols-2 gap-4">
      <div>
        <label class="label">{{ t('suppliers.phone') }}</label>
        <input v-model="form.phone" type="tel" class="input" />
      </div>
      <div>
        <label class="label">{{ t('suppliers.email') }}</label>
        <input v-model="form.email" type="email" class="input" />
      </div>
    </div>
    <div>
      <label class="label">{{ t('suppliers.address') }}</label>
      <input v-model="form.address" type="text" class="input" />
    </div>
    <div>
      <label class="label">{{ t('suppliers.city') }}</label>
      <CitySelect v-model="form.city" />
    </div>
  </div>
</template>
