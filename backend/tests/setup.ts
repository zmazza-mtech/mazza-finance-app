// Test environment setup — sets required env vars before any modules load
process.env.CORS_ORIGIN = 'https://localhost';
// The integration tests talk to the real Postgres that globalSetup starts.
// TEST_DATABASE_URL overrides it for CI service containers.
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://test:test@127.0.0.1:55432/mazza_test';
process.env.SIMPLEFIN_ACCESS_URL = 'https://testuser:testpass@beta-bridge.simplefin.org/simplefin';
