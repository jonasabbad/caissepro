import { onMounted, ref } from 'vue';

/**
 * Barcode-scanner friendly input: scanners type the code then press Enter.
 * The input re-focuses after every scan so the next item can be scanned straight away.
 */
export function useScanInput(onScan) {
  const query = ref('');
  const inputRef = ref(null);
  const isProcessing = ref(false);
  const focus = () => inputRef.value?.focus();

  onMounted(focus);

  async function submit() {
    const code = query.value.trim();
    if (!code || isProcessing.value) return;
    isProcessing.value = true;
    try {
      await onScan(code);
    } finally {
      query.value = '';
      isProcessing.value = false;
      focus();
    }
  }

  return { query, inputRef, isProcessing, submit, focus };
}
