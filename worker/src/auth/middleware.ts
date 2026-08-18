/**
 * The auth gate (#76).
 *
 * New invariant: **no `/api` route without auth.** This is the single place
 * that holds it, mounted across `/api/v1/*` rather than per-router, so a route
 * added later inherits it instead of remembering it. `tests/auth-middleware.spec.ts`
 * enumerates every route and proves the 401 rather than trusting this comment.
 *
 * It fails closed. With no issuer configured there is nothing to verify
 * against, and the only safe answer to "I cannot check this" is to refuse —
 * a missing binding must never read as permission.
 */
import type { Context, Next } from 'hono';
import { verifyJwt, type VerifiedClaims } from './jwt.js';
import { provisionUser, type ProvisionedUser } from './provision.js';
import { getDb } from '../db/client.js';
import type { Env } from '../env.js';

/** Reachable without a token: a health check cannot carry one. */
const PUBLIC_PATHS = new Set(['/api/v1/health']);

/**
 * JWKS cached per isolate.
 *
 * Fetching the key set on every request would add a network round trip to
 * every API call. An isolate is short-lived, so this is a cache with a
 * natural bound rather than something needing eviction — and key rotation is
 * picked up as isolates recycle.
 */
let jwksCache: { url: string; keys: { keys: JsonWebKey[] }; fetchedAt: number } | null = null;
const JWKS_TTL_MS = 10 * 60 * 1000;

/**
 * The conventional JWKS location for an issuer.
 *
 * The trailing slash matters: Auth0's `iss` is `https://tenant.auth0.com/`
 * *with* one, and naive concatenation produces a double slash that 404s. Most
 * servers forgive it; relying on that is how a cold isolate fails at 3am.
 */
function defaultJwksUrl(issuer: string): string {
  return `${issuer.replace(/\/+$/, '')}/.well-known/jwks.json`;
}

async function loadJwks(url: string, now: number): Promise<{ keys: JsonWebKey[] }> {
  if (jwksCache && jwksCache.url === url && now - jwksCache.fetchedAt < JWKS_TTL_MS) {
    return jwksCache.keys;
  }

  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(`JWKS fetch failed: ${response.status}`);
  }

  const keys = (await response.json()) as { keys: JsonWebKey[] };
  jwksCache = { url, keys, fetchedAt: now };
  return keys;
}

declare module 'hono' {
  interface ContextVariableMap {
    claims: VerifiedClaims;
    user: ProvisionedUser;
  }
}

export { defaultJwksUrl };

export function requireAuth() {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    if (PUBLIC_PATHS.has(new URL(c.req.url).pathname)) return next();

    const header = c.req.header('Authorization') ?? '';
    if (!header.startsWith('Bearer ')) {
      return c.json({ data: null, error: 'Unauthorized' }, 401);
    }

    const issuer = c.env.AUTH_ISSUER;
    const audience = c.env.AUTH_AUDIENCE;
    const jwksUrl = c.env.AUTH_JWKS_URL;

    try {
      // Configuration is checked inside the try so a missing binding takes the
      // same path as a bad token: refused, and refused without explaining why.
      // The issuer is required; the audience is not. Some providers do not
      // issue an `aud` claim and bind the token to the client through a
      // per-client key set instead — see VerifyOptions.audience.
      if (!issuer) {
        throw new Error('Auth is not configured');
      }

      /*
       * A pinned key set wins over fetching one.
       *
       * Real configuration rather than a test hook: a deployment that would
       * rather not make an outbound call on a cold isolate can set it, and it
       * is how the suite supplies its own keys. Rotation costs a redeploy,
       * which is the trade being made by setting it.
       */
      const keys = c.env.AUTH_JWKS
        ? (JSON.parse(c.env.AUTH_JWKS) as { keys: JsonWebKey[] })
        : await loadJwks(jwksUrl ?? defaultJwksUrl(issuer), Date.now());

      const claims = await verifyJwt(header.slice('Bearer '.length), {
        issuer,
        ...(audience ? { audience } : {}),
        ...(c.env.AUTH_EMAIL_CLAIM ? { emailClaim: c.env.AUTH_EMAIL_CLAIM } : {}),
        jwks: keys,
      });

      /*
       * Provisioned on the way through rather than at a sign-up endpoint,
       * because there is no sign-up endpoint: a verified token is the only
       * evidence a user exists (#76).
       *
       * This costs one SELECT on every authenticated request, and an INSERT
       * exactly once per person ever. Against the 50-query invocation budget
       * that is affordable; against the alternative — a separate registration
       * step that can be skipped, fail, or be replayed — it is simpler and has
       * fewer states.
       */
      c.set('claims', claims);
      c.set('user', await provisionUser(getDb(c.env.DB), claims));
      return next();
    } catch {
      /*
       * One answer for every failure.
       *
       * "Expired" versus "bad signature" versus "not configured" tells an
       * attacker which half of the problem to work on, and the client cannot
       * act on the difference in any case — it retries or it signs in again.
       */
      return c.json({ data: null, error: 'Unauthorized' }, 401);
    }
  };
}
