import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import pg from 'pg';

/**
 * Brings up the throwaway Postgres the integration tests run against, and
 * migrates it, before any test file loads.
 *
 * The project forbids mock modes, and the production database is deliberately
 * unreachable from the host, so the tests need a real database of their own.
 * Starting it here rather than in a README step means `npm test` is still one
 * command.
 *
 * Set TEST_DATABASE_URL to point at an existing instance — a CI service
 * container, say — and this skips Docker entirely and just migrates.
 */

const COMPOSE_FILE = join(__dirname, '..', '..', 'docker-compose.test.yml');
const DEFAULT_URL = 'postgresql://test:test@127.0.0.1:55432/mazza_test';

function databaseUrl(): string {
  return process.env['TEST_DATABASE_URL'] ?? DEFAULT_URL;
}

function compose(...args: string[]): void {
  execFileSync('docker', ['compose', '-f', COMPOSE_FILE, ...args], {
    stdio: 'inherit',
  });
}

/** Resolves once the server accepts a connection, or throws after ~30s. */
async function waitForPostgres(url: string): Promise<void> {
  const deadline = Date.now() + 30_000;
  let lastError: unknown;

  while (Date.now() < deadline) {
    const client = new pg.Client({ connectionString: url });
    try {
      await client.connect();
      await client.end();
      return;
    } catch (err) {
      lastError = err;
      await client.end().catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  throw new Error(
    `Test database never became reachable at ${url}: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

export async function setup(): Promise<void> {
  const url = databaseUrl();
  const external = process.env['TEST_DATABASE_URL'] !== undefined;

  if (!external) {
    try {
      compose('up', '-d', '--wait');
    } catch {
      throw new Error(
        'Could not start the test database. The backend integration tests run ' +
          'against real Postgres — start Docker, or point TEST_DATABASE_URL at ' +
          'an instance yourself.',
      );
    }
  }

  await waitForPostgres(url);

  // The migrator reads DATABASE_URL, and so does the app under test.
  process.env['DATABASE_URL'] = url;

  const { runMigrations } = await import('../src/db/migrate');
  await runMigrations();
}

export async function teardown(): Promise<void> {
  // Locally the container is left running: the next run reuses it and starts
  // in about a second. CI gets a clean stop so the job does not leak state.
  if (process.env['CI'] && process.env['TEST_DATABASE_URL'] === undefined) {
    compose('down', '-v');
  }
}
