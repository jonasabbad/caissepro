import axios from 'axios';
import { http } from './http';
import { translateErrorResponse } from '@/utils/serverMessages';
import { localizeReferenceData } from '@/utils/referenceData';

/** Signed-in screen: pair a phone as a barcode scanner and receive its scans. */
export const scannerApi = {
  async pair(replaces) {
    const { data } = await http.post('/scanner/pairings', { replaces: replaces || null });
    return data.data;
  },
  async get(id) {
    const { data } = await http.get(`/scanner/pairings/${id}`);
    return data.data.pairing;
  },
  async unpair(id) {
    await http.delete(`/scanner/pairings/${id}`);
  },
  /** Long poll: the scans after `after` (waits up to 25 s for the next one). */
  async events(id, after, boot, signal) {
    const { data } = await http.get(`/scanner/pairings/${id}/events`, { params: { after, boot }, signal, timeout: 40_000 });
    return data.data;
  },
};

/**
 * The paired phone: no sign-in, only the pairing token from the QR code (sent in a header, never in the URL the
 * server sees). It can look codes up and send them to the paired screen, nothing else.
 */
export function phoneScannerApi(token) {
  const client = axios.create({ baseURL: '/api/v1', headers: { 'Content-Type': 'application/json', 'x-scanner-token': token }, timeout: 20_000 });
  client.interceptors.response.use(
    (r) => {
      localizeReferenceData(r.data);
      return r;
    },
    (error) => {
      translateErrorResponse(error?.response?.data);
      return Promise.reject(error);
    },
  );
  return {
    async session() {
      const { data } = await client.get('/scanner/phone/session');
      return data.data;
    },
    async scan(code, send) {
      const { data } = await client.post('/scanner/phone/scan', { code, send });
      return data.data;
    },
    async disconnect() {
      await client.post('/scanner/phone/disconnect');
    },
  };
}
