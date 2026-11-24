import type { FastifyInstance } from 'fastify';
import { catalog, catalogFor } from '../lib/catalog.js';
import { brandsFor, modelsFor, nameKey } from '../lib/deviceNames.js';
import { authed, ok, type Req } from '../lib/route.js';

const publicDevice = ({ deviceType: _t, ...d }: (typeof catalog)[number]) => d;

/**
 * Device catalogue used by the device forms: built-in brands → models → storage / colours, plus the brands and models
 * this business entered itself (see lib/deviceNames.ts).
 */
export default async function catalogRoutes(app: FastifyInstance) {
  authed(app);

  app.get('/phone-seller/catalog/brands', async (req: Req<unknown, { deviceType?: string }>) =>
    ok({ brands: await brandsFor(req.auth.tenantId, req.query.deviceType || undefined) }),
  );

  app.get('/phone-seller/catalog/models', async (req: Req<unknown, { brand?: string; deviceType?: string }>) =>
    ok({ models: await modelsFor(req.auth.tenantId, req.query.brand ?? '', req.query.deviceType || undefined) }),
  );

  app.get('/phone-seller/catalog/device', async (req: Req<unknown, { brand?: string; model?: string; deviceType?: string }>) => {
    const brand = nameKey(req.query.brand ?? '');
    const model = nameKey(req.query.model ?? '');
    const device = catalogFor(req.query.deviceType).find((d) => nameKey(d.brand) === brand && nameKey(d.model) === model);
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
