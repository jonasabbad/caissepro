import { onBeforeUnmount, onMounted } from 'vue';

/**
 * Hand-held barcode scanners act as keyboards: they "type" the code very fast and press Enter.
 * This listens on the whole page and calls `onScan(code)` for such bursts, so scanning works even when no field
 * is focused. Keystrokes inside text fields are left to the field itself (fields handle Enter on their own).
 */
export function useBarcodeScanner(onScan, { minLength = 4, maxGapMs = 50 } = {}) {
  let buffer = '';
  let last = 0;
  const isField = (el) => el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

  function onKeydown(e) {
    if (e.ctrlKey || e.metaKey || e.altKey || isField(e.target)) return;
    const now = performance.now();
    if (now - last > maxGapMs) buffer = '';
    last = now;
    if (e.key === 'Enter') {
      if (buffer.length >= minLength) {
        e.preventDefault();
        const code = buffer;
        buffer = '';
        onScan(code);
      }
      buffer = '';
      return;
    }
    if (e.key.length === 1) buffer += e.key;
  }
  onMounted(() => window.addEventListener('keydown', onKeydown, true));
  onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown, true));
}
