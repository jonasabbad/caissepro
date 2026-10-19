import { http } from './http';

export const scanApi = {
  /** Everything CaissePro knows about a scanned code (products, devices, learned box barcode, IMEI identification). */
  async lookup(code) {
    const { data } = await http.get(`/scan/${encodeURIComponent(code)}`);
    return data.data;
  },
  async linkModelBarcode(payload) {
    const { data } = await http.put('/scan/model-barcodes', payload);
    return data.data.modelBarcode;
  },
};
