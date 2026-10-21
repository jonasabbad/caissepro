import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { ZodError } from 'zod';
import { HttpError } from './lib/errors.js';
import { routes } from './routes/index.js';
import { UPLOAD_DIR } from './lib/uploads.js';
import { mkdirSync } from 'node:fs';

export async function buildApp(opts: { logger?: boolean; https?: { key: Buffer; cert: Buffer } } = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logger ?? false, bodyLimit: 10 * 1024 * 1024, ...(opts.https ? { https: opts.https } : {}) }) as unknown as FastifyInstance;

  // Clients may POST action endpoints (submit, lock…) with a JSON content type and no body; treat that as {}.
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    const text = typeof body === 'string' ? body : body.toString();
    if (!text.trim()) return done(null, {});
    try {
      done(null, JSON.parse(text));
    } catch {
      const err = new Error('Invalid JSON body') as Error & { statusCode: number };
      err.statusCode = 400;
      done(err, undefined);
    }
  });

  await app.register(cors, { origin: true, credentials: true, exposedHeaders: ['x-cash-drawer', 'content-disposition'] });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof HttpError) return reply.status(err.statusCode).send(err.toJSON());
    if (err instanceof ZodError) {
      const errors: Record<string, string> = {};
      for (const issue of err.issues) errors[issue.path.join('.') || '_'] = issue.message;
      const first = err.issues[0];
      return reply.status(400).send({
        success: false,
        message: first ? `${first.path.join('.')}: ${first.message}` : 'Données invalides',
        error: 'Bad Request',
        statusCode: 400,
        errors,
      });
    }
    const status = (err as any).statusCode ?? 500;
    if (status >= 500) app.log.error(err);
    return reply.status(status).send({
      success: false,
      message: status >= 500 ? 'Internal server error' : (err as Error).message,
      error: status >= 500 ? 'Internal Server Error' : 'Error',
      statusCode: status,
    });
  });

  await app.register(routes, { prefix: '/api/v1' });

  // Uploaded product images. File names are random UUIDs, so they can be cached forever.
  mkdirSync(UPLOAD_DIR, { recursive: true });
  await app.register(fastifyStatic, {
    root: UPLOAD_DIR,
    prefix: '/uploads/',
    decorateReply: false,
    index: false,
    maxAge: '365d',
    immutable: true,
  });

  // Serve the built SPA in production (web/dist), with history-API fallback.
  const webDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/dist');
  if (existsSync(webDist)) {
    // Built files under /assets/ have a content hash in their name: browsers keep them for a year without asking
    // again. Everything else (index.html, manifest, service worker, icons) is checked on each visit, so a new
    // version shows up at once.
    await app.register(fastifyStatic, {
      root: webDist,
      wildcard: false,
      cacheControl: false,
      setHeaders: (res, filePath) => {
        res.setHeader('Cache-Control', /[\\/]assets[\\/]/.test(filePath) ? 'public, max-age=31536000, immutable' : 'no-cache');
      },
    });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/') || req.url.startsWith('/uploads/')) {
        return reply.status(404).send({ success: false, message: `Cannot ${req.method} ${req.url}`, error: 'Not Found', statusCode: 404 });
      }
      return reply.sendFile('index.html');
    });
  }

  return app;
}
