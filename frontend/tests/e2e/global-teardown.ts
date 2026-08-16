import { stopStack } from './stack';

/**
 * Takes the E2E stack down along with its volumes.
 *
 * Unlike the backend integration tests, which leave their container running so
 * the next run starts in about a second, this stops unconditionally. The
 * database is the thing under test here — leaving a seeded one behind is what
 * would make two consecutive runs disagree.
 */
export default function globalTeardown(): void {
  if (process.env['E2E_SKIP_STACK']) return;
  stopStack();
}
