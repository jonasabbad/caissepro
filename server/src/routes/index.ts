import type { FastifyInstance } from 'fastify';
import authRoutes from './auth.js';
import referenceRoutes from './reference.js';
import storesRoutes from './stores.js';
import settingsRoutes from './settings.js';
import subscriptionRoutes from './subscriptions.js';
import platformRoutes from './platform.js';
import productRoutes from './products.js';
import inventoryRoutes from './inventory.js';

/** Every API module, mounted under /api/v1. Each module registers its own auth hook. */
export async function routes(app: FastifyInstance) {
  app.get('/health', async () => ({ success: true, data: { status: 'ok' } }));
  await app.register(authRoutes);
  await app.register(referenceRoutes);
  await app.register(storesRoutes);
  await app.register(settingsRoutes);
  await app.register(subscriptionRoutes);
  await app.register(platformRoutes);
  await app.register(productRoutes);
  await app.register(inventoryRoutes);
}
