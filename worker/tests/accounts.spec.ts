/**
 * The accounts router, ported from Express (#68).
 *
 * Behaviour is asserted against the Express original — same paths, same
 * status codes, same `{ data, error }` envelope — plus the thing Express
 * could not express at all: every read and write is scoped to a household,
 * and another household's account is indistinguishable from one that does not
 * exist.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { SELF, env } from 'cloudflare:test';
import { MAZZA_HOUSEHOLD_ID } from '../src/db/household.js';
import { authed } from './helpers/auth.js';

const OTHER_HOUSEHOLD = '8e2a1f77-0c44-4f6e-9b3a-1d5c6e7f8a90';
const BASE = 'https://example.com/api/v1/accounts';

async function api(path: string, init?: RequestInit) {
  const res = await SELF.fetch(`https://example.com/api/v1${path}`, authed(init));
  return { res, body: (await res.json()) as { data: any; error: any } };
}

function post(path: string, body: unknown) {
  return api(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function patch(path: string, body: unknown) {
  return api(path, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** An account belonging to a household the request will never be scoped to. */
async function seedForeignAccount(id: string) {
  await env.DB.prepare(
    'INSERT OR IGNORE INTO households (id, name, created_at) VALUES (?, ?, ?)',
  )
    .bind(OTHER_HOUSEHOLD, 'Other', '2026-08-17T00:00:00.000Z')
    .run();
  await env.DB.prepare(
    `INSERT INTO accounts (id, household_id, simplefin_id, institution, name, type, currency, is_active, include_in_view, created_at, updated_at)
     VALUES (?, ?, NULL, 'Foreign Bank', 'Their Checking', 'checking', 'USD', 1, 1, '2026-08-17T00:00:00.000Z', '2026-08-17T00:00:00.000Z')`,
  )
    .bind(id, OTHER_HOUSEHOLD)
    .run();
}

beforeEach(async () => {
  await env.DB.exec('DELETE FROM accounts');
});

describe('POST /accounts', () => {
  it('creates a manual account and answers 201 with the row', async () => {
    const { res, body } = await post('/accounts', {
      institution: 'Ally',
      name: 'Savings',
      type: 'savings',
    });

    expect(res.status).toBe(201);
    expect(body.error).toBeNull();
    expect(body.data).toMatchObject({
      institution: 'Ally',
      name: 'Savings',
      type: 'savings',
      simplefinId: null,
      isActive: true,
      includeInView: true,
      currency: 'USD',
    });
    expect(body.data.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('files the new account under the request household', async () => {
    const { body } = await post('/accounts', {
      institution: 'Ally',
      name: 'Savings',
      type: 'savings',
    });

    const row = await env.DB.prepare('SELECT household_id FROM accounts WHERE id = ?')
      .bind(body.data.id)
      .first<{ household_id: string }>();
    expect(row?.household_id).toBe(MAZZA_HOUSEHOLD_ID);
  });

  it('rejects an unknown account type with 400 and writes nothing', async () => {
    const { res, body } = await post('/accounts', {
      institution: 'Ally',
      name: 'Brokerage',
      type: 'brokerage',
    });

    expect(res.status).toBe(400);
    expect(body.data).toBeNull();
    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM accounts').first<{ n: number }>();
    expect(count?.n).toBe(0);
  });

  it('rejects a missing name with 400', async () => {
    const { res } = await post('/accounts', { institution: 'Ally', type: 'checking' });
    expect(res.status).toBe(400);
  });
});

describe('GET /accounts', () => {
  it('lists accounts ordered by institution then name', async () => {
    await post('/accounts', { institution: 'Chase', name: 'Checking', type: 'checking' });
    await post('/accounts', { institution: 'Ally', name: 'Savings', type: 'savings' });
    await post('/accounts', { institution: 'Ally', name: 'Bills', type: 'checking' });

    const { res, body } = await api('/accounts');
    expect(res.status).toBe(200);
    expect(body.data.map((a: any) => `${a.institution}/${a.name}`)).toEqual([
      'Ally/Bills',
      'Ally/Savings',
      'Chase/Checking',
    ]);
  });

  it('returns an empty list rather than 404 when the household has no accounts', async () => {
    const { res, body } = await api('/accounts');
    expect(res.status).toBe(200);
    expect(body).toEqual({ data: [], error: null });
  });

  it('never lists another household account', async () => {
    await seedForeignAccount('11111111-1111-4111-8111-111111111111');
    await post('/accounts', { institution: 'Ally', name: 'Ours', type: 'checking' });

    const { body } = await api('/accounts');
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe('Ours');
  });
});

describe('GET /accounts/:id', () => {
  it('returns the account', async () => {
    const created = await post('/accounts', {
      institution: 'Ally',
      name: 'Savings',
      type: 'savings',
    });

    const { res, body } = await api(`/accounts/${created.body.data.id}`);
    expect(res.status).toBe(200);
    expect(body.data.name).toBe('Savings');
  });

  it('answers 400 for an id that is not a uuid', async () => {
    const { res, body } = await api('/accounts/not-a-uuid');
    expect(res.status).toBe(400);
    expect(body.error).toBe('Invalid account id');
  });

  it('answers 404 for an account that does not exist', async () => {
    const { res, body } = await api('/accounts/22222222-2222-4222-8222-222222222222');
    expect(res.status).toBe(404);
    expect(body.error).toBe('Account not found');
  });

  it('answers 404 — not 200 — for another household account', async () => {
    // Indistinguishable from absent on purpose. A 403 would confirm the row
    // exists, which is itself a leak across the tenancy boundary.
    const id = '33333333-3333-4333-8333-333333333333';
    await seedForeignAccount(id);

    const { res, body } = await api(`/accounts/${id}`);
    expect(res.status).toBe(404);
    expect(body.error).toBe('Account not found');
  });
});

describe('PATCH /accounts/:id', () => {
  async function create() {
    const { body } = await post('/accounts', {
      institution: 'Ally',
      name: 'Savings',
      type: 'savings',
    });
    return body.data.id as string;
  }

  it('updates includeInView', async () => {
    const id = await create();
    const { res, body } = await patch(`/accounts/${id}`, { includeInView: false });
    expect(res.status).toBe(200);
    expect(body.data.includeInView).toBe(false);
  });

  it('updates isActive and lastBalance together', async () => {
    const id = await create();
    const { body } = await patch(`/accounts/${id}`, { isActive: false, lastBalance: '-42.10' });
    expect(body.data.isActive).toBe(false);
    // Money crosses the wire as the decimal string it was stored as.
    expect(body.data.lastBalance).toBe('-42.10');
  });

  it('rejects a balance that is not a decimal amount', async () => {
    const id = await create();
    const { res } = await patch(`/accounts/${id}`, { lastBalance: '12.345' });
    expect(res.status).toBe(400);
  });

  it('rejects an empty body with 400 rather than a no-op 200', async () => {
    const id = await create();
    const { res, body } = await patch(`/accounts/${id}`, {});
    expect(res.status).toBe(400);
    expect(body.error).toBe('No fields to update');
  });

  it('answers 404 for another household account and leaves it untouched', async () => {
    const id = '44444444-4444-4444-8444-444444444444';
    await seedForeignAccount(id);

    const { res } = await patch(`/accounts/${id}`, { includeInView: false });
    expect(res.status).toBe(404);

    const row = await env.DB.prepare('SELECT include_in_view FROM accounts WHERE id = ?')
      .bind(id)
      .first<{ include_in_view: number }>();
    expect(row?.include_in_view).toBe(1);
  });
});
