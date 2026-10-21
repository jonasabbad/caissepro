import './env.js';
import { readFileSync } from 'node:fs';
import { buildApp } from './app.js';
import { backfillCodes } from './lib/codes.js';
import { runDataMigrations } from './lib/dataMigrations.js';
import { bootstrapFirstAdmin, seedReferenceData, seedTacReference } from './lib/bootstrap.js';

// PORT is set by hosts such as Hostinger; API_PORT locally.
const port = Number(process.env.PORT || process.env.API_PORT || 3001);

// HTTPS (production, serving web/dist) when a certificate is configured: needed for the phone scanner's camera on the local network.
const { HTTPS_CERT_FILE: certFile, HTTPS_KEY_FILE: keyFile } = process.env;
const https = certFile && keyFile ? { cert: readFileSync(certFile), key: readFileSync(keyFile) } : undefined;
const app = await buildApp({ logger: true, https });
await seedReferenceData();
const admin = await bootstrapFirstAdmin();
if (admin) app.log.info(`Created the first account: ${admin}`);
const tacs = await seedTacReference();
if (tacs) app.log.info(`Loaded ${tacs} reference phone models (TAC)`);
const migrated = await runDataMigrations();
if (Object.keys(migrated).length) app.log.info(migrated, 'Applied data migrations');
const filled = await backfillCodes();
if (filled.products || filled.repairs) app.log.info(filled, 'Added missing product barcodes and repair tracking tokens');
await app.listen({ port, host: '0.0.0.0' });
