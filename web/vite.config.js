import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

/**
 * `vite --mode phone` (npm run dev:phone): served on the local network over HTTPS, so a phone can open the scanner
 * page with its camera (browsers only allow the camera on https or localhost). With SSL_CERT_FILE / SSL_KEY_FILE
 * (e.g. made with mkcert) that certificate is used; otherwise a self-signed one, which the phone asks to accept once.
 */
export default defineConfig(({ mode }) => {
  const phone = mode === 'phone';
  const cert = process.env.SSL_CERT_FILE && process.env.SSL_KEY_FILE ? { cert: readFileSync(process.env.SSL_CERT_FILE), key: readFileSync(process.env.SSL_KEY_FILE) } : null;
  return {
    plugins: [vue(), ...(phone && !cert ? [basicSsl({ name: 'caissepro-local' })] : [])],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    build: {
      rollupOptions: {
        output: {
          // The framework and the icons are shared by every screen: two files cached for a long time, instead of
          // dozens of tiny files fetched (and re-checked) one by one. Heavy libraries (charts, PDF, camera) stay in
          // their own files, loaded only by the screens that use them.
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (/[\/]node_modules[\/]@heroicons[\/]/.test(id)) return 'icons';
            if (/[\/]node_modules[\/](vue|@vue|vue-router|pinia|@tanstack|vue-i18n|@intlify|axios)[\/]/.test(id)) return 'vendor';
            return undefined;
          },
        },
      },
    },
    server: {
      port: 5173,
      ...(phone ? { host: true, ...(cert ? { https: cert } : {}) } : {}),
      proxy: { '/api': 'http://localhost:3001', '/uploads': 'http://localhost:3001' },
    },
  };
});
