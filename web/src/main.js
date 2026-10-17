import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { VueQueryPlugin } from '@tanstack/vue-query';
import '@fontsource-variable/inter';
import '@fontsource/noto-sans-arabic/400.css';
import '@fontsource/noto-sans-arabic/500.css';
import '@fontsource/noto-sans-arabic/600.css';
import '@fontsource/noto-sans-arabic/700.css';
import './styles/main.css';
import App from './App.vue';
import { router } from './router';
import { i18n, ltr } from './i18n';
import { queryClient } from './queryClient';


const app = createApp(App);
app.use(createPinia());
app.use(VueQueryPlugin, { queryClient });
app.use(router);
app.use(i18n);
// Keeps signed numbers, codes and amounts in left-to-right order inside Arabic text.
app.config.globalProperties.$ltr = ltr;
app.mount('#app');
