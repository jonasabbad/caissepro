import { readFileSync } from 'node:fs';
import { buildApp } from './app.js';
import { backfillCodes } from './lib/codes.js';
import { runDataMigrations } from './lib/dataMigrations.js';

const port = Number(process.env.API_PORT || 3001);

// HTTPS (production, serving web/dist) when a certificate is configured: needed for the phone scanner's camera on the local network.
const { HTTPS_CERT_FILE: certFile, HTTPS_KEY_FILE: keyFile } = process.env;
const https = certFile && keyFile ? { cert: readFileSync(certFile), key: readFileSync(keyFile) } : undefined;
const app = await buildApp({ logger: true, https });
const migrated = await runDataMigrations();
if (Object.keys(migrated).length) app.log.info(migrated, 'Applied data migrations');
const filled = await backfillCodes();
if (filled.products || filled.repairs) app.log.info(filled, 'Added missing product barcodes and repair tracking tokens');
await app.listen({ port, host: '0.0.0.0' });
