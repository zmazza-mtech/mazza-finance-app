import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

// Miniflare options are declared inline rather than read from wrangler.toml so
// tests never depend on the frontend build existing (the assets directory) or
// on a real D1 database_id.
export default defineWorkersConfig({
  test: {
    include: ['tests/**/*.spec.ts'],
    poolOptions: {
      workers: {
        main: './src/index.ts',
        miniflare: {
          compatibilityDate: '2025-09-06',
          d1Databases: ['DB'],
          bindings: {
            // Test-only key; production key lives in Wrangler secrets.
            ENCRYPTION_KEY:
              '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f',
          },
        },
      },
    },
  },
});
