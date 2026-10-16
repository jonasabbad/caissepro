import type { FastifyInstance } from 'fastify';
import authRoutes from './auth.js';
import referenceRoutes from './reference.js';
import storesRoutes from './stores.js';
import settingsRoutes from './settings.js';
import subscriptionRoutes from './subscriptions.js';
import platformRoutes from './platform.js';
import productRoutes from './products.js';
import inventoryRoutes from './inventory.js';
import catalogRoutes from './catalog.js';
import soldUnitRoutes from './soldUnits.js';
import customerRoutes from './customers.js';
import supplierRoutes from './suppliers.js';
import supplierOrderRoutes from './supplierOrders.js';
import checkoutRoutes from './checkout.js';
import transactionRoutes from './transactions.js';
import reservationRoutes from './reservations.js';
import employeeRoutes from './employees.js';
import repairRoutes from './repairs.js';

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
  await app.register(catalogRoutes);
  await app.register(soldUnitRoutes);
  await app.register(customerRoutes);
  await app.register(supplierRoutes);
  await app.register(supplierOrderRoutes);
  await app.register(checkoutRoutes);
  await app.register(transactionRoutes);
  await app.register(reservationRoutes);
  await app.register(employeeRoutes);
  await app.register(repairRoutes);
}
