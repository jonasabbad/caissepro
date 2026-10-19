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
    server: {
      port: 5173,
      ...(phone ? { host: true, ...(cert ? { https: cert } : {}) } : {}),
      proxy: { '/api': 'http://localhost:3001', '/uploads': 'http://localhost:3001' },
    },
  };
});
