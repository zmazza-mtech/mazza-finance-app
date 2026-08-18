/**
 * Brings every test database up to the current schema before any test runs.
 *
 * The migrations are read in Node by `vitest.config.ts` and applied here,
 * inside the worker, so the suite exercises exactly what `wrangler d1
 * migrations apply` produces — including seed rows. A schema assembled by
 * hand in a test helper would let a broken migration pass.
 */
import { applyD1Migrations, env } from 'cloudflare:test';

declare module 'cloudflare:test' {
  interface ProvidedEnv {
    DB: D1Database;
    ENCRYPTION_KEY: string;
    TEST_MIGRATIONS: D1Migration[];
  }
}

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
