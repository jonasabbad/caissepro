import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

// Unit tests for the web app's logic (cart, scanning, prices). They run in Node: no browser, no server, no database.
export default defineConfig({
  plugins: [vue()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    include: ['src/**/*.test.js'],
    setupFiles: ['./test/setup.js'],
  },
});
