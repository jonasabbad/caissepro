import { buildApp } from './app.js';
import { backfillCodes } from './lib/codes.js';
import { runDataMigrations } from './lib/dataMigrations.js';

const port = Number(process.env.API_PORT || 3001);

const app = await buildApp({ logger: true });
const migrated = await runDataMigrations();
if (Object.keys(migrated).length) app.log.info(migrated, 'Applied data migrations');
const filled = await backfillCodes();
if (filled.products || filled.repairs) app.log.info(filled, 'Added missing product barcodes and repair tracking tokens');
await app.listen({ port, host: '0.0.0.0' });
