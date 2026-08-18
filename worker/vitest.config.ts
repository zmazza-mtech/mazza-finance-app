import {
  defineWorkersConfig,
  readD1Migrations,
} from '@cloudflare/vitest-pool-workers/config';

// Miniflare options are declared inline rather than read from wrangler.toml so
// tests never depend on the frontend build existing (the assets directory) or
// on a real D1 database_id.
export default defineWorkersConfig(async () => {
  // Read in Node, applied inside the worker by tests/apply-migrations.ts. The
  // suite therefore runs against the same schema `wrangler d1 migrations
  // apply` produces in production, seed rows included — a test database built
  // by hand would let a broken migration pass.
  //
  // Relative to the working directory rather than resolved with `node:path`:
  // this file is typechecked by the Workers tsconfig, and pulling @types/node
  // in for one join would also let worker source import Node built-ins that
  // do not exist in workerd.
  const migrations = await readD1Migrations('migrations');

  return {
    test: {
      include: ['tests/**/*.spec.ts'],
      setupFiles: ['./tests/apply-migrations.ts'],
      poolOptions: {
        workers: {
          main: './src/index.ts',
          miniflare: {
            compatibilityDate: '2025-09-06',
            d1Databases: ['DB'],
            bindings: {
              TEST_MIGRATIONS: migrations,
              // Auth configuration (#76). The middleware fails closed without
              // these, so the suite has to supply them exactly as production
              // will — the test keys are registered in tests/helpers/auth.ts.
              AUTH_ISSUER: 'https://issuer.example.com',
              AUTH_AUDIENCE: 'mazza-finance',
              // The public half of the fixed test keypair in
              // tests/helpers/jwt.ts. Pinning the key set is a real
              // configuration option, not a test hook — see AUTH_JWKS in env.ts.
              AUTH_JWKS: JSON.stringify({"keys": [{"alg": "RS256", "kty": "RSA", "n": "7sKovH73ctKr3_2veNc5Ks8VylR3OHj8f2vu83Nx7iyDPqGShYFrgPDDce1MIw0vXN9nYsXGvo1-Ds0Y0MiSXDfsOleRaWmGb-OOb7EhWgQPAWWhRvebmmVOVDXISGLUYTxCt_KG71dSpOz54lWJ9e2q24zRBWdSAno3YPzCy86JgWzoJz_ebZbnufCoC8-ZIcjr2N7aVbQXAn-ADBSuqcpVjRzmXq-B1U0hXhoHY9dvrjSma4nIs568EhCu6PjzOsGJ3rHc7QaYOxpvXotveEjRg828wmUjfhEChWw56EO0MT-0qGvf_qcryak8UDcUKQexaK9017CFIHNSrrX_lw", "e": "AQAB", "kid": "test-key-1", "use": "sig"}]}),
              // Test-only key; production key lives in Wrangler secrets.
              ENCRYPTION_KEY:
                '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f',
            },
          },
        },
      },
    },
  };
});
