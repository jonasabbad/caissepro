import type { FastifyInstance } from 'fastify';
import { catalog, catalogFor } from '../lib/catalog.js';
import { authed, ok, type Req } from '../lib/route.js';

const publicDevice = ({ deviceType: _t, ...d }: (typeof catalog)[number]) => d;

/** Built-in device catalogue (brands → models → storage / colours) used by the phone entry form. */
export default async function catalogRoutes(app: FastifyInstance) {
  authed(app);

  app.get('/phone-seller/catalog/brands', async (req: Req<unknown, { deviceType?: string }>) => {
    const brands = [...new Set(catalogFor(req.query.deviceType).map((d) => d.brand))].sort((a, b) => a.localeCompare(b));
    return ok({ brands });
  });

  app.get('/phone-seller/catalog/models', async (req: Req<unknown, { brand?: string; deviceType?: string }>) => {
    const brand = (req.query.brand ?? '').toLowerCase();
    const models = catalogFor(req.query.deviceType)
      .filter((d) => d.brand.toLowerCase() === brand)
      .map((d) => d.model);
    return ok({ models });
  });

  app.get('/phone-seller/catalog/device', async (req: Req<unknown, { brand?: string; model?: string; deviceType?: string }>) => {
    const brand = (req.query.brand ?? '').toLowerCase();
    const model = (req.query.model ?? '').toLowerCase();
    const device = catalogFor(req.query.deviceType).find((d) => d.brand.toLowerCase() === brand && d.model.toLowerCase() === model);
    if (!device || (!device.year && device.storageOptions.length === 0)) {
      return ok({ device: null, storageOptions: [], ramOptions: [], colors: [], basePrice: 0 });
    }
    return ok({
      device: publicDevice(device),
      storageOptions: device.storageOptions,
      ramOptions: device.ramOptions,
      colors: device.colors,
      basePrice: device.basePrice,
    });
  });

  app.get('/phone-seller/catalog/search', async (req: Req<unknown, { q?: string }>) => {
    const terms = (req.query.q ?? '').toLowerCase().split(/\s+/).filter(Boolean);
    const devices = catalog
      .filter((d) => terms.every((t) => `${d.brand} ${d.model}`.toLowerCase().includes(t)))
      .slice(0, 30)
      .map(publicDevice);
    return ok({ devices });
  });

  app.get('/phone-seller/catalog/all', async () => ok({ devices: catalogFor('phone').map(publicDevice) }));
}
