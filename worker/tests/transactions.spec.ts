/**
 * Transactions — ported from Express (#68), household-scoped.
 *
 * Two of these tests exist because of the D1 free tier rather than the
 * Express original: `batch-categorize` and `backfill-categories` issued one
 * UPDATE per row in a loop, and the free tier allows 50 queries per Worker
 * invocation (#95). A correction across 60 matching rows would have failed
 * partway through, having already written some of them.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { SELF, env } from 'cloudflare:test';
import { MAZZA_HOUSEHOLD_ID } from '../src/db/household.js';

const OTHER_HOUSEHOLD = '8e2a1f77-0c44-4f6e-9b3a-1d5c6e7f8a90';
const OUR_ACCOUNT = '55555555-5555-4555-8555-555555555555';
const THEIR_ACCOUNT = '66666666-6666-4666-8666-666666666666';

async function api(path: string, init?: RequestInit) {
  const res = await SELF.fetch(`https://example.com/api/v1${path}`, init);
  const text = await res.text();
  return { res, body: text ? (JSON.parse(text) as { data: any; error: any }) : null };
}

const json = (method: string, body: unknown) => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

async function seedAccount(id: string, householdId: string) {
  await env.DB.prepare(
    'INSERT OR IGNORE INTO households (id, name, created_at) VALUES (?, ?, ?)',
  )
    .bind(householdId, 'H', '2026-08-17T00:00:00.000Z')
    .run();
  await env.DB.prepare(
    `INSERT INTO accounts (id, household_id, simplefin_id, institution, name, type, currency, is_active, include_in_view, created_at, updated_at)
     VALUES (?, ?, NULL, 'Bank', 'Checking', 'checking', 'USD', 1, 1, '2026-08-17T00:00:00.000Z', '2026-08-17T00:00:00.000Z')`,
  )
    .bind(id, householdId)
    .run();
}

async function seedTransaction(opts: {
  id: string;
  householdId: string;
  accountId: string;
  date?: string;
  description?: string;
  amount?: string;
  type?: 'actual' | 'manual';
  category?: string | null;
  categorySource?: 'auto' | 'user';
}) {
  await env.DB.prepare(
    `INSERT INTO transactions (id, household_id, simplefin_id, account_id, date, description, amount, type, status, category, category_source, created_at, updated_at)
     VALUES (?, ?, NULL, ?, ?, ?, ?, ?, 'posted', ?, ?, '2026-08-17T00:00:00.000Z', '2026-08-17T00:00:00.000Z')`,
  )
    .bind(
      opts.id,
      opts.householdId,
      opts.accountId,
      opts.date ?? '2026-08-15',
      opts.description ?? 'Whole Foods',
      opts.amount ?? '-84.21',
      opts.type ?? 'actual',
      opts.category ?? null,
      opts.categorySource ?? 'auto',
    )
    .run();
}

beforeEach(async () => {
  await env.DB.exec('DELETE FROM transactions');
  await env.DB.exec('DELETE FROM accounts');
  await seedAccount(OUR_ACCOUNT, MAZZA_HOUSEHOLD_ID);
  await seedAccount(THEIR_ACCOUNT, OTHER_HOUSEHOLD);
});

describe('GET /transactions', () => {
  it('returns the household rows, newest first by default', async () => {
    await seedTransaction({ id: 'a1111111-1111-4111-8111-111111111111', householdId: MAZZA_HOUSEHOLD_ID, accountId: OUR_ACCOUNT, date: '2026-08-10' });
    await seedTransaction({ id: 'a2222222-2222-4222-8222-222222222222', householdId: MAZZA_HOUSEHOLD_ID, accountId: OUR_ACCOUNT, date: '2026-08-20' });

    const { res, body } = await api('/transactions');
    expect(res.status).toBe(200);
    expect(body!.data.map((t: any) => t.date)).toEqual(['2026-08-20', '2026-08-10']);
  });

  it('never returns another household rows', async () => {
    await seedTransaction({ id: 'a3333333-3333-4333-8333-333333333333', householdId: MAZZA_HOUSEHOLD_ID, accountId: OUR_ACCOUNT, description: 'Ours' });
    await seedTransaction({ id: 'a4444444-4444-4444-8444-444444444444', householdId: OTHER_HOUSEHOLD, accountId: THEIR_ACCOUNT, description: 'Theirs' });

    const { body } = await api('/transactions');
    expect(body!.data.map((t: any) => t.description)).toEqual(['Ours']);
  });

  it('filters by date range and sorts ascending on request', async () => {
    for (const [id, date] of [
      ['a5555555-5555-4555-8555-555555555555', '2026-08-01'],
      ['a6666666-6666-4666-8666-666666666666', '2026-08-15'],
      ['a7777777-7777-4777-8777-777777777777', '2026-08-30'],
    ] as const) {
      await seedTransaction({ id, householdId: MAZZA_HOUSEHOLD_ID, accountId: OUR_ACCOUNT, date });
    }

    const { body } = await api('/transactions?startDate=2026-08-10&endDate=2026-08-20&sortDir=asc');
    expect(body!.data.map((t: any) => t.date)).toEqual(['2026-08-15']);
  });

  it('rejects an accountId that is not a uuid with 400', async () => {
    const { res } = await api('/transactions?accountId=nope');
    expect(res.status).toBe(400);
  });

  it('scopes an accountId filter to the household, returning nothing for a foreign account', async () => {
    await seedTransaction({ id: 'a8888888-8888-4888-8888-888888888888', householdId: OTHER_HOUSEHOLD, accountId: THEIR_ACCOUNT });

    const { res, body } = await api(`/transactions?accountId=${THEIR_ACCOUNT}`);
    expect(res.status).toBe(200);
    expect(body!.data).toEqual([]);
  });
});

describe('POST /transactions', () => {
  it('creates a manual entry and derives a category from the description', async () => {
    const { res, body } = await api(
      '/transactions',
      json('POST', {
        accountId: OUR_ACCOUNT,
        date: '2026-08-15',
        description: 'WHOLE FOODS MARKET',
        amount: '-84.21',
      }),
    );

    expect(res.status).toBe(201);
    expect(body!.data).toMatchObject({ type: 'manual', status: 'posted', category: 'Groceries' });
  });

  it('honours an explicit category over the guess', async () => {
    const { body } = await api(
      '/transactions',
      json('POST', {
        accountId: OUR_ACCOUNT,
        date: '2026-08-15',
        description: 'WHOLE FOODS MARKET',
        amount: '-84.21',
        category: 'Dining',
      }),
    );
    expect(body!.data.category).toBe('Dining');
  });

  it('files the row under the request household', async () => {
    const { body } = await api(
      '/transactions',
      json('POST', {
        accountId: OUR_ACCOUNT,
        date: '2026-08-15',
        description: 'Coffee',
        amount: '-4.50',
      }),
    );
    const row = await env.DB.prepare('SELECT household_id FROM transactions WHERE id = ?')
      .bind(body!.data.id)
      .first<{ household_id: string }>();
    expect(row?.household_id).toBe(MAZZA_HOUSEHOLD_ID);
  });

  it('refuses to post into another household account', async () => {
    // Without this the account id is an open door: the row would be created
    // under our household but pointed at their account.
    const { res } = await api(
      '/transactions',
      json('POST', {
        accountId: THEIR_ACCOUNT,
        date: '2026-08-15',
        description: 'Coffee',
        amount: '-4.50',
      }),
    );
    expect(res.status).toBe(404);

    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM transactions').first<{ n: number }>();
    expect(count?.n).toBe(0);
  });

  it('rejects an amount that is not a decimal string', async () => {
    const { res } = await api(
      '/transactions',
      json('POST', {
        accountId: OUR_ACCOUNT,
        date: '2026-08-15',
        description: 'Coffee',
        amount: 4.5,
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe('PATCH /transactions/:id', () => {
  const ID = 'b1111111-1111-4111-8111-111111111111';

  it('marks a corrected category as user-set', async () => {
    await seedTransaction({ id: ID, householdId: MAZZA_HOUSEHOLD_ID, accountId: OUR_ACCOUNT, category: 'Groceries' });

    const { res, body } = await api(`/transactions/${ID}`, json('PATCH', { category: 'Dining' }));
    expect(res.status).toBe(200);
    expect(body!.data.category).toBe('Dining');
    expect(body!.data.categorySource).toBe('user');
  });

  it('marks a deliberately cleared category as user-set', async () => {
    await seedTransaction({ id: ID, householdId: MAZZA_HOUSEHOLD_ID, accountId: OUR_ACCOUNT, category: 'Groceries' });

    const { body } = await api(`/transactions/${ID}`, json('PATCH', { category: null }));
    expect(body!.data.category).toBeNull();
    expect(body!.data.categorySource).toBe('user');
  });

  it('refuses to edit the amount of a bank transaction', async () => {
    await seedTransaction({ id: ID, householdId: MAZZA_HOUSEHOLD_ID, accountId: OUR_ACCOUNT, type: 'actual' });

    const { res, body } = await api(`/transactions/${ID}`, json('PATCH', { amount: '-1.00' }));
    expect(res.status).toBe(403);
    expect(body!.error).toBe('Only category can be edited on bank transactions');
  });

  it('allows the amount of a manual entry to be edited', async () => {
    await seedTransaction({ id: ID, householdId: MAZZA_HOUSEHOLD_ID, accountId: OUR_ACCOUNT, type: 'manual' });

    const { body } = await api(`/transactions/${ID}`, json('PATCH', { amount: '-1.00' }));
    expect(body!.data.amount).toBe('-1.00');
  });

  it('answers 404 for another household row and leaves it untouched', async () => {
    const theirs = 'b2222222-2222-4222-8222-222222222222';
    await seedTransaction({ id: theirs, householdId: OTHER_HOUSEHOLD, accountId: THEIR_ACCOUNT, category: 'Groceries' });

    const { res } = await api(`/transactions/${theirs}`, json('PATCH', { category: 'Dining' }));
    expect(res.status).toBe(404);

    const row = await env.DB.prepare('SELECT category FROM transactions WHERE id = ?')
      .bind(theirs)
      .first<{ category: string }>();
    expect(row?.category).toBe('Groceries');
  });

  it('rejects an empty body with 400', async () => {
    await seedTransaction({ id: ID, householdId: MAZZA_HOUSEHOLD_ID, accountId: OUR_ACCOUNT });
    const { res, body } = await api(`/transactions/${ID}`, json('PATCH', {}));
    expect(res.status).toBe(400);
    expect(body!.error).toBe('No fields to update');
  });
});

describe('DELETE /transactions/:id', () => {
  it('deletes a manual entry and answers 204', async () => {
    const id = 'c1111111-1111-4111-8111-111111111111';
    await seedTransaction({ id, householdId: MAZZA_HOUSEHOLD_ID, accountId: OUR_ACCOUNT, type: 'manual' });

    const { res } = await api(`/transactions/${id}`, { method: 'DELETE' });
    expect(res.status).toBe(204);

    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM transactions').first<{ n: number }>();
    expect(count?.n).toBe(0);
  });

  it('refuses to delete a bank transaction', async () => {
    const id = 'c2222222-2222-4222-8222-222222222222';
    await seedTransaction({ id, householdId: MAZZA_HOUSEHOLD_ID, accountId: OUR_ACCOUNT, type: 'actual' });

    const { res, body } = await api(`/transactions/${id}`, { method: 'DELETE' });
    expect(res.status).toBe(403);
    expect(body!.error).toBe('Only manual transactions can be deleted');
  });

  it('answers 404 for another household row and leaves it in place', async () => {
    const theirs = 'c3333333-3333-4333-8333-333333333333';
    await seedTransaction({ id: theirs, householdId: OTHER_HOUSEHOLD, accountId: THEIR_ACCOUNT, type: 'manual' });

    const { res } = await api(`/transactions/${theirs}`, { method: 'DELETE' });
    expect(res.status).toBe(404);

    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM transactions').first<{ n: number }>();
    expect(count?.n).toBe(1);
  });
});

describe('POST /transactions/batch-categorize', () => {
  it('categorizes every row whose normalized description matches', async () => {
    await seedTransaction({ id: 'd1111111-1111-4111-8111-111111111111', householdId: MAZZA_HOUSEHOLD_ID, accountId: OUR_ACCOUNT, description: 'DBT CRD 0407 27105864 TSTDRIP KITCHEN' });
    await seedTransaction({ id: 'd2222222-2222-4222-8222-222222222222', householdId: MAZZA_HOUSEHOLD_ID, accountId: OUR_ACCOUNT, description: 'DBT CRD 0937 31882140 TSTDRIP KITCHEN' });

    const { res, body } = await api(
      '/transactions/batch-categorize',
      json('POST', { description: 'DBT CRD 0407 27105864 TSTDRIP KITCHEN', category: 'Dining' }),
    );

    expect(res.status).toBe(200);
    expect(body!.data).toEqual({ updated: 2 });

    const rows = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM transactions WHERE category = 'Dining' AND category_source = 'user'",
    ).first<{ n: number }>();
    expect(rows?.n).toBe(2);
  });

  it('leaves another household matching rows alone', async () => {
    await seedTransaction({ id: 'd3333333-3333-4333-8333-333333333333', householdId: OTHER_HOUSEHOLD, accountId: THEIR_ACCOUNT, description: 'TSTDRIP KITCHEN' });

    const { body } = await api(
      '/transactions/batch-categorize',
      json('POST', { description: 'TSTDRIP KITCHEN', category: 'Dining' }),
    );
    expect(body!.data).toEqual({ updated: 0 });

    const row = await env.DB.prepare('SELECT category FROM transactions WHERE id = ?')
      .bind('d3333333-3333-4333-8333-333333333333')
      .first<{ category: string | null }>();
    expect(row?.category).toBeNull();
  });

  it('corrects 60 matching rows in one request', async () => {
    // The Express version issued one UPDATE per row. D1 free tier allows 50
    // queries per Worker invocation (#95), so this exact request would have
    // failed partway through, having already written the first 48 or so.
    for (let i = 0; i < 60; i++) {
      await seedTransaction({
        id: `e${String(i).padStart(7, '0')}-1111-4111-8111-111111111111`,
        householdId: MAZZA_HOUSEHOLD_ID,
        accountId: OUR_ACCOUNT,
        // Real statement shape: a card suffix and a reference number that
        // differ per charge, which is exactly what normalizeDescription strips.
        description: `DBT CRD ${1000 + i} ${27105864 + i} TSTDRIP KITCHEN`,
      });
    }

    const { res, body } = await api(
      '/transactions/batch-categorize',
      json('POST', { description: 'DBT CRD 1000 27105864 TSTDRIP KITCHEN', category: 'Dining' }),
    );

    expect(res.status).toBe(200);
    expect(body!.data).toEqual({ updated: 60 });
  });

  it('rejects a category outside the enum', async () => {
    const { res } = await api(
      '/transactions/batch-categorize',
      json('POST', { description: 'x', category: 'Yachts' }),
    );
    expect(res.status).toBe(400);
  });
});

describe('POST /transactions/backfill-categories', () => {
  it('fills a row the user has never touched', async () => {
    await seedTransaction({ id: 'f1111111-1111-4111-8111-111111111111', householdId: MAZZA_HOUSEHOLD_ID, accountId: OUR_ACCOUNT, description: 'WHOLE FOODS MARKET', category: null, categorySource: 'auto' });

    const { res, body } = await api('/transactions/backfill-categories', { method: 'POST' });
    expect(res.status).toBe(200);
    expect(body!.data).toEqual({ updated: 1, total: 1 });
  });

  it('does not re-categorize a null the user chose', async () => {
    await seedTransaction({ id: 'f2222222-2222-4222-8222-222222222222', householdId: MAZZA_HOUSEHOLD_ID, accountId: OUR_ACCOUNT, description: 'WHOLE FOODS MARKET', category: null, categorySource: 'user' });

    const { body } = await api('/transactions/backfill-categories', { method: 'POST' });
    expect(body!.data).toEqual({ updated: 0, total: 1 });

    const row = await env.DB.prepare('SELECT category FROM transactions WHERE id = ?')
      .bind('f2222222-2222-4222-8222-222222222222')
      .first<{ category: string | null }>();
    expect(row?.category).toBeNull();
  });

  it('never touches another household uncategorized rows', async () => {
    await seedTransaction({ id: 'f3333333-3333-4333-8333-333333333333', householdId: OTHER_HOUSEHOLD, accountId: THEIR_ACCOUNT, description: 'WHOLE FOODS MARKET', category: null });

    const { body } = await api('/transactions/backfill-categories', { method: 'POST' });
    expect(body!.data).toEqual({ updated: 0, total: 0 });
  });

  it('backfills 60 rows in one request', async () => {
    // Same free-tier query ceiling as the batch correction above.
    for (let i = 0; i < 60; i++) {
      await seedTransaction({
        id: `a${String(i).padStart(7, '0')}-2222-4222-8222-222222222222`,
        householdId: MAZZA_HOUSEHOLD_ID,
        accountId: OUR_ACCOUNT,
        description: i % 2 === 0 ? 'WHOLE FOODS MARKET' : 'SHELL OIL',
        category: null,
      });
    }

    const { res, body } = await api('/transactions/backfill-categories', { method: 'POST' });
    expect(res.status).toBe(200);
    expect(body!.data.total).toBe(60);
    expect(body!.data.updated).toBe(60);
  });
});
