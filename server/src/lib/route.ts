import type { FastifyInstance, FastifyRequest } from 'fastify';
import { authenticate } from './auth.js';

/** `{ success: true, data }` envelope used by every endpoint. */
export const ok = <T>(data: T) => ({ success: true as const, data });

/** Registers a plugin whose routes all require a valid bearer token. */
export function authed(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);
}

export type Req<B = any, Q = any, P = any> = FastifyRequest<{ Body: B; Querystring: Q; Params: P }>;
