import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authed, ok, type Req } from '../lib/route.js';
import { saveImage } from '../lib/uploads.js';

const imageSchema = z.object({ dataUrl: z.string().min(1) });

export default async function uploadRoutes(app: FastifyInstance) {
  authed(app);

  /** Stores an already-resized image (the browser compresses it first) and returns its URL. */
  app.post('/uploads/images', async (req: Req<z.infer<typeof imageSchema>>) => {
    const { dataUrl } = imageSchema.parse(req.body);
    return ok({ url: await saveImage(req.auth.tenantId, dataUrl) });
  });
}
