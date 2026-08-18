/**
 * The Drizzle handle for a request.
 *
 * Built per request rather than once at module scope: a Worker isolate is
 * reused across requests and across D1 bindings in tests, and a cached client
 * would outlive the binding it was built from.
 */
import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema.js';

export type Db = ReturnType<typeof getDb>;

export function getDb(d1: D1Database) {
  return drizzle(d1, { schema });
}
