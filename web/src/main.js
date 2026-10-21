import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { VueQueryPlugin } from '@tanstack/vue-query';
import '@fontsource-variable/inter';
import '@fontsource/ibm-plex-sans-arabic/400.css';
import '@fontsource/ibm-plex-sans-arabic/500.css';
import '@fontsource/ibm-plex-sans-arabic/600.css';
import '@fontsource/ibm-plex-sans-arabic/700.css';
import './styles/main.css';
import App from './App.vue';
import { router } from './router';
import { i18n, initialLocale, ltr } from './i18n';
import { queryClient } from './queryClient';
import { captureInstallPrompt } from './composables/useScannerApp';

// CaissePro Scanner: keep the browser's install prompt for the scanner page (it can fire before that page loads).
captureInstallPrompt();

const app = createApp(App);
app.use(createPinia());
app.use(VueQueryPlugin, { queryClient });
app.use(router);
app.use(i18n);
// Keeps signed numbers, codes and amounts in left-to-right order inside Arabic text.
app.config.globalProperties.$ltr = ltr;
// The saved language is loaded first, so the interface does not flash in French.
initialLocale()
  .catch(() => undefined)
  .finally(() => app.mount('#app'));
