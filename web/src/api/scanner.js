import axios from 'axios';
import { http } from './http';
import { translateErrorResponse } from '@/utils/serverMessages';
import { localizeReferenceData } from '@/utils/referenceData';

/** Signed-in computer: receive phone scans, authorize and manage phones. */
export const scannerApi = {
  /** This browser as a receiving computer (`id` kept by the browser; created when missing or unknown). */
  async registerScreen(id, name) {
    const { data } = await http.post('/scanner/screens', { id: id || null, name });
    return data.data;
  },
  async renameScreen(id, name) {
    const { data } = await http.patch(`/scanner/screens/${id}`, { name });
    return data.data.screen;
  },
  /** Long poll: the events after `after` (waits up to 25 s for the next one). */
  async events(screenId, after, boot, signal) {
    const { data } = await http.get(`/scanner/screens/${screenId}/events`, { params: { after, boot }, signal, timeout: 40_000 });
    return data.data;
  },
  /** One-time QR code (10 minutes) to authorize a new phone that will send to `screenId`. */
  async pair(screenId) {
    const { data } = await http.post('/scanner/pairings', { screenId: screenId || null });
    return data.data;
  },
  async pairing(id) {
    const { data } = await http.get(`/scanner/pairings/${id}`);
    return data.data;
  },
  async devices() {
    const { data } = await http.get('/scanner/devices');
    return data.data;
  },
  async updateDevice(id, patch) {
    const { data } = await http.patch(`/scanner/devices/${id}`, patch);
    return data.data.device;
  },
  async revokeDevice(id) {
    await http.delete(`/scanner/devices/${id}`);
  },
};

function phoneClient(headers) {
  const client = axios.create({ baseURL: '/api/v1', headers: { 'Content-Type': 'application/json', ...headers }, timeout: 20_000 });
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
  return client;
}

/** Exchanges a one-time QR code for this phone's own secret (returned once, kept by the phone). */
export async function claimPhone(code, name) {
  const { data } = await phoneClient({}).post('/scanner/device/claim', { code, name, userAgent: navigator.userAgent.slice(0, 300) });
  return data.data;
}

/**
 * An authorized phone: no sign-in, only its device secret (sent in a header). It can look codes up, choose the
 * computer its scans go to and send them there, nothing else.
 */
export function phoneScannerApi(token) {
  const client = phoneClient({ 'x-scanner-device': token });
  return {
    async session() {
      const { data } = await client.get('/scanner/device/session');
      return data.data;
    },
    async scan(code, send) {
      const { data } = await client.post('/scanner/device/scan', { code, send });
      return data.data;
    },
    async setTarget(screenId) {
      const { data } = await client.patch('/scanner/device', { screenId });
      return data.data.device;
    },
    async disconnect() {
      await client.post('/scanner/device/disconnect');
    },
  };
}
