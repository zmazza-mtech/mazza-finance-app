/**
 * The auth middleware and JIT provisioning (#76).
 *
 * The new invariant is **no `/api` route without auth**, and the acceptance
 * criterion says to prove it by enumerating routes rather than by inspection.
 * That is what the first block does: it walks the mounted Hono routes and
 * asserts every one of them 401s unauthenticated. A route added later without
 * auth fails this test rather than shipping.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { SELF, env } from 'cloudflare:test';
import { getDb } from '../src/db/client.js';
import { MAZZA_HOUSEHOLD_ID } from '../src/db/household.js';
import { provisionUser } from '../src/auth/provision.js';
import { API_ROUTES } from '../src/api/routes.js';
import { AUTH_HEADERS } from './helpers/auth.js';
import { defaultJwksUrl } from '../src/auth/middleware.js';

beforeEach(async () => {
  await env.DB.exec('DELETE FROM household_memberships');
  await env.DB.exec('DELETE FROM users');
});

describe('no /api route without auth', () => {
  it('enumerates more than one route, so an empty list cannot pass this suite', () => {
    // A guard on the guard: if API_ROUTES ever came back empty the loop below
    // would pass vacuously, which is the failure mode of every
    // enumerate-and-assert test.
    expect(API_ROUTES.length).toBeGreaterThan(10);
  });

  it.each(API_ROUTES)('$method $path answers 401 with no token', async ({ method, path }) => {
    const res = await SELF.fetch(`https://example.com${path}`, {
      method,
      ...(method === 'GET' || method === 'DELETE'
        ? {}
        : { headers: { 'content-type': 'application/json' }, body: '{}' }),
    });
    expect(res.status).toBe(401);
  });

  it('answers 401 with the envelope, not an empty body', async () => {
    const res = await SELF.fetch('https://example.com/api/v1/accounts');
    expect(await res.json()).toEqual({ data: null, error: 'Unauthorized' });
  });

  it('leaves /api/v1/health reachable, because a health check cannot hold a token', async () => {
    const res = await SELF.fetch('https://example.com/api/v1/health');
    expect(res.status).toBe(200);
  });

  it('rejects a bearer token that is not a JWT at all', async () => {
    const res = await SELF.fetch('https://example.com/api/v1/accounts', {
      headers: { Authorization: 'Bearer not-a-token' },
    });
    expect(res.status).toBe(401);
  });

  it('rejects an Authorization header that is not Bearer', async () => {
    const res = await SELF.fetch('https://example.com/api/v1/accounts', {
      headers: { Authorization: `Basic ${btoa('mazza:hunter2')}` },
    });
    expect(res.status).toBe(401);
  });

  it('says nothing about why a token failed', async () => {
    // "expired" versus "bad signature" tells an attacker which half to work
    // on. The client cannot act on the difference either way.
    const res = await SELF.fetch('https://example.com/api/v1/accounts', {
      headers: { Authorization: 'Bearer a.b.c' },
    });
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Unauthorized');
  });
});

describe('the derived JWKS location', () => {
  it("does not double the slash on an issuer that ends in one", async () => {
    // Auth0's iss is `https://tenant.auth0.com/`. Naive concatenation gives
    // `//.well-known/jwks.json`, which 404s. Most servers forgive it; relying
    // on that is how a cold isolate fails at 3am.
    expect(defaultJwksUrl('https://mazza.us.auth0.com/')).toBe(
      'https://mazza.us.auth0.com/.well-known/jwks.json',
    );
  });

  it('handles an issuer without a trailing slash the same way', () => {
    expect(defaultJwksUrl('https://issuer.example.com')).toBe(
      'https://issuer.example.com/.well-known/jwks.json',
    );
  });
});

describe('JIT provisioning', () => {
  it('creates one user and one membership on first sign-in', async () => {
    const db = getDb(env.DB);
    await provisionUser(db, { sub: 'user_abc123', email: 'mrs@example.com', exp: 0 });

    const users = await env.DB.prepare(
      'SELECT id, auth_subject, email FROM users',
    ).all<{ id: string; auth_subject: string; email: string }>();
    expect(users.results).toHaveLength(1);
    expect(users.results[0]).toMatchObject({
      auth_subject: 'user_abc123',
      email: 'mrs@example.com',
    });

    const memberships = await env.DB.prepare(
      'SELECT household_id, role FROM household_memberships',
    ).all<{ household_id: string; role: string }>();
    expect(memberships.results).toHaveLength(1);
    expect(memberships.results[0]!.household_id).toBe(MAZZA_HOUSEHOLD_ID);
  });

  it('creates nothing new on the second sign-in of the same subject', async () => {
    const db = getDb(env.DB);
    const claims = { sub: 'user_abc123', email: 'mrs@example.com', exp: 0 };
    await provisionUser(db, claims);
    await provisionUser(db, claims);

    const users = await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>();
    const memberships = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM household_memberships',
    ).first<{ n: number }>();
    expect(users?.n).toBe(1);
    expect(memberships?.n).toBe(1);
  });

  it('returns the same user id both times, so nothing downstream forks', async () => {
    const db = getDb(env.DB);
    const claims = { sub: 'user_abc123', email: 'mrs@example.com', exp: 0 };
    const first = await provisionUser(db, claims);
    const second = await provisionUser(db, claims);
    expect(second.id).toBe(first.id);
  });

  it('follows a changed email rather than creating a second user', async () => {
    // The subject is the identity; the email is a mutable attribute of it.
    // Matching on email would fork the account when someone changes it.
    const db = getDb(env.DB);
    await provisionUser(db, { sub: 'user_abc123', email: 'old@example.com', exp: 0 });
    await provisionUser(db, { sub: 'user_abc123', email: 'new@example.com', exp: 0 });

    const rows = await env.DB.prepare('SELECT email FROM users').all<{ email: string }>();
    expect(rows.results).toHaveLength(1);
    expect(rows.results[0]!.email).toBe('new@example.com');
  });

  it('gives a second person their own user row in the same household', async () => {
    const db = getDb(env.DB);
    await provisionUser(db, { sub: 'user_abc123', email: 'mrs@example.com', exp: 0 });
    await provisionUser(db, { sub: 'user_xyz789', email: 'mr@example.com', exp: 0 });

    const users = await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>();
    const memberships = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM household_memberships WHERE household_id = ?',
    ).bind(MAZZA_HOUSEHOLD_ID).first<{ n: number }>();
    expect(users?.n).toBe(2);
    expect(memberships?.n).toBe(2);
  });

  it('makes the first person the owner and the second a member', async () => {
    const db = getDb(env.DB);
    const first = await provisionUser(db, { sub: 'user_abc123', email: 'a@example.com', exp: 0 });
    const second = await provisionUser(db, { sub: 'user_xyz789', email: 'b@example.com', exp: 0 });

    const owner = await env.DB.prepare(
      'SELECT role FROM household_memberships WHERE user_id = ?',
    ).bind(first.id).first<{ role: string }>();
    const member = await env.DB.prepare(
      'SELECT role FROM household_memberships WHERE user_id = ?',
    ).bind(second.id).first<{ role: string }>();

    expect(owner?.role).toBe('owner');
    expect(member?.role).toBe('member');
  });
});

describe('a valid token', () => {
  it('reaches the route', async () => {
    const res = await SELF.fetch('https://example.com/api/v1/accounts', {
      headers: AUTH_HEADERS,
    });
    expect(res.status).toBe(200);
  });

  it('provisions the user on the way through, without a separate sign-up step', async () => {
    await SELF.fetch('https://example.com/api/v1/accounts', { headers: AUTH_HEADERS });

    const row = await env.DB.prepare('SELECT auth_subject FROM users').first<{
      auth_subject: string;
    }>();
    expect(row?.auth_subject).toBe('user_abc123');
  });

  it('provisions once across many requests', async () => {
    for (let i = 0; i < 3; i++) {
      await SELF.fetch('https://example.com/api/v1/accounts', { headers: AUTH_HEADERS });
    }

    const users = await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>();
    const memberships = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM household_memberships',
    ).first<{ n: number }>();
    expect(users?.n).toBe(1);
    expect(memberships?.n).toBe(1);
  });
});
