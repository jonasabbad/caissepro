import { ref, watch } from 'vue';

/** Sidebar collapsed to an icon rail on computers (remembered on this device). */
const KEY = 'caissepro_sidebar_collapsed';
const read = () => {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
};
const collapsed = ref(read());
watch(collapsed, (v) => {
  try {
    localStorage.setItem(KEY, v ? '1' : '0');
  } catch {
    /* private mode: this visit only */
  }
});

export function useSidebar() {
  return { collapsed, toggle: () => (collapsed.value = !collapsed.value) };
}
