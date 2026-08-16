import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Lifecycle for the throwaway stack the E2E suite drives.
 *
 * See `docker-compose.e2e.yml` for why it is a separate stack rather than the
 * one `docker compose up` starts.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const COMPOSE_FILE = join(HERE, '..', '..', '..', 'docker-compose.e2e.yml');

/** Where Caddy is published on the host. Must match the compose port mapping. */
export const BASE_URL = 'http://127.0.0.1:5599';

export const API_URL = `${BASE_URL}/api/v1`;

function compose(args: string[], timeoutMs: number): void {
  execFileSync('docker', ['compose', '-f', COMPOSE_FILE, ...args], {
    stdio: 'inherit',
    timeout: timeoutMs,
  });
}

/**
 * Brings the stack up from an empty database.
 *
 * `down -v` first, not just `up`: the acceptance criterion is that two
 * consecutive runs produce identical results, and a Postgres left over from an
 * aborted run would still hold that run's seeded account. Starting from nothing
 * is the only version of this that is true by construction rather than by
 * careful teardown.
 *
 * The frontend build runs to completion before the rest comes up. It exits when
 * the build finishes, and `up --wait` treats an exited service as a failure, so
 * it cannot be part of the same command.
 */
export function startStack(): void {
  stopStack();
  compose(['run', '--rm', '--build', 'frontend-build'], 15 * 60_000);
  compose(['up', '-d', '--wait', 'postgres', 'backend', 'caddy'], 10 * 60_000);
}

/** Tears the stack down along with its volumes. Safe to call when nothing is up. */
export function stopStack(): void {
  compose(['down', '-v', '--remove-orphans'], 5 * 60_000);
}
