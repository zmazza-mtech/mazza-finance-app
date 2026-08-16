import { startStack } from './stack';

/**
 * Brings the E2E stack up before any spec runs, so `npm run e2e` is one command.
 *
 * Set E2E_SKIP_STACK=1 to drive an instance you started yourself — useful when
 * iterating on a spec, since it skips the build and the container start.
 */
export default function globalSetup(): void {
  if (process.env['E2E_SKIP_STACK']) return;

  try {
    startStack();
  } catch {
    throw new Error(
      'Could not start the E2E stack. The suite runs against a real backend and ' +
        'a real Postgres — start Docker, or start the stack yourself with ' +
        '`docker compose -f docker-compose.e2e.yml up` and set E2E_SKIP_STACK=1.',
    );
  }
}
