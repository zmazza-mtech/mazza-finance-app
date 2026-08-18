/**
 * A real signed token for the suite.
 *
 * Every router test authenticates, because #76 made "no `/api` route without
 * auth" an invariant. The token is genuinely signed by the fixed test key and
 * genuinely verified by the middleware against the `AUTH_JWKS` binding in
 * `vitest.config.ts` — the same code path production uses, with no bypass. A
 * test that skips the gate stops testing the thing that ships.
 */
import { signJwt } from './jwt.js';

export const TEST_ISSUER = 'https://issuer.example.com';
export const TEST_AUDIENCE = 'mazza-finance';

/**
 * Expiry is computed from the real clock rather than the fixture's fixed
 * date, so the suite does not start failing at a particular time of day.
 */
const token = await signJwt({
  iss: TEST_ISSUER,
  aud: TEST_AUDIENCE,
  exp: Math.floor(Date.now() / 1000) + 86_400,
  nbf: Math.floor(Date.now() / 1000) - 60,
});

export const AUTH_HEADERS: Record<string, string> = { Authorization: `Bearer ${token}` };

/** Merges the bearer token into whatever headers a request already carries. */
export function authed(init: RequestInit = {}): RequestInit {
  return { ...init, headers: { ...AUTH_HEADERS, ...(init.headers as Record<string, string>) } };
}
