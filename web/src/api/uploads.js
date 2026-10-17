import { http } from './http';

export const uploadsApi = {
  /** Uploads a `data:image/...` URL (already resized) and returns the stored file's URL. */
  async image(dataUrl) {
    const { data } = await http.post('/uploads/images', { dataUrl });
    return data.data.url;
  },
};
