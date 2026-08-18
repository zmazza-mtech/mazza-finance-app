/**
 * Recurring series and single-occurrence overrides — ported from Express
 * (#68), household-scoped, plus the uniqueness fix from #100.
 *
 * `detect` is the endpoint most exposed to the D1 free tier's 50-queries-per
 * -invocation ceiling (#95): the Express version advanced each paid series
 * with its own UPDATE, so a household with 50 series would have crossed it
 * during the very sweep that keeps the forecast populated.
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
  await env.DB.prepare('INSERT OR IGNORE INTO households (id, name, created_at) VALUES (?, ?, ?)')
    .bind(householdId, 'H', '2026-08-17T00:00:00.000Z')
    .run();
  await env.DB.prepare(
    `INSERT INTO accounts (id, household_id, simplefin_id, institution, name, type, currency, is_active, include_in_view, created_at, updated_at)
     VALUES (?, ?, NULL, 'Bank', 'Checking', 'checking', 'USD', 1, 1, '2026-08-17T00:00:00.000Z', '2026-08-17T00:00:00.000Z')`,
  )
    .bind(id, householdId)
    .run();
}

async function seedSeries(opts: {
  id: string;
  householdId: string;
  accountId: string;
  name?: string;
  amount?: string;
  frequency?: string;
  nextDate?: string;
  status?: string;
}) {
  await env.DB.prepare(
    `INSERT INTO recurring_transactions (id, household_id, account_id, name, amount, frequency, next_date, end_date, source, status, category, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 'manual', ?, NULL, '2026-08-17T00:00:00.000Z', '2026-08-17T00:00:00.000Z')`,
  )
    .bind(
      opts.id,
      opts.householdId,
      opts.accountId,
      opts.name ?? 'Rent',
      opts.amount ?? '-1200.00',
      opts.frequency ?? 'monthly',
      opts.nextDate ?? '2026-09-01',
      opts.status ?? 'active',
    )
    .run();
}

beforeEach(async () => {
  await env.DB.exec('DELETE FROM recurring_overrides');
  await env.DB.exec('DELETE FROM recurring_transactions');
  await env.DB.exec('DELETE FROM transactions');
  await env.DB.exec('DELETE FROM accounts');
  await seedAccount(OUR_ACCOUNT, MAZZA_HOUSEHOLD_ID);
  await seedAccount(THEIR_ACCOUNT, OTHER_HOUSEHOLD);
});

describe('GET /recurring', () => {
  it('lists the account series by name', async () => {
    await seedSeries({ id: 'a1111111-1111-4111-8111-111111111111', householdId: MAZZA_HOUSEHOLD_ID, accountId: OUR_ACCOUNT, name: 'Water' });
    await seedSeries({ id: 'a2222222-2222-4222-8222-222222222222', householdId: MAZZA_HOUSEHOLD_ID, accountId: OUR_ACCOUNT, name: 'Rent' });

    const { res, body } = await api(`/recurring?accountId=${OUR_ACCOUNT}`);
    expect(res.status).toBe(200);
    expect(body!.data.map((r: any) => r.name)).toEqual(['Rent', 'Water']);
  });

  it('answers 404 for another household account rather than listing it', async () => {
    await seedSeries({ id: 'a3333333-3333-4333-8333-333333333333', householdId: OTHER_HOUSEHOLD, accountId: THEIR_ACCOUNT });

    const { res, body } = await api(`/recurring?accountId=${THEIR_ACCOUNT}`);
    expect(res.status).toBe(404);
    expect(body!.error).toBe('Account not found');
  });

  it('rejects a missing accountId with 400', async () => {
    const { res } = await api('/recurring');
    expect(res.status).toBe(400);
  });
});

describe('POST /recurring', () => {
  it('creates an active series and categorizes it from the name', async () => {
    const { res, body } = await api(
      '/recurring',
      json('POST', {
        accountId: OUR_ACCOUNT,
        name: 'NETFLIX.COM',
        amount: '-15.99',
        frequency: 'monthly',
        nextDate: '2026-09-01',
      }),
    );

    expect(res.status).toBe(201);
    // Streaming is ranked into Entertainment ahead of Subscriptions on
    // purpose — see the keyword map's ordering comment.
    expect(body!.data).toMatchObject({ status: 'active', source: 'manual', category: 'Entertainment' });
  });

  it('refuses to create one against another household account', async () => {
    const { res } = await api(
      '/recurring',
      json('POST', {
        accountId: THEIR_ACCOUNT,
        name: 'Rent',
        amount: '-1200.00',
        frequency: 'monthly',
        nextDate: '2026-09-01',
      }),
    );
    expect(res.status).toBe(404);

    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM recurring_transactions').first<{ n: number }>();
    expect(count?.n).toBe(0);
  });

  it('rejects an unknown frequency with 400', async () => {
    const { res } = await api(
      '/recurring',
      json('POST', {
        accountId: OUR_ACCOUNT,
        name: 'Rent',
        amount: '-1200.00',
        frequency: 'fortnightly',
        nextDate: '2026-09-01',
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe('PATCH /recurring/:id', () => {
  const ID = 'b1111111-1111-4111-8111-111111111111';

  it('updates the series', async () => {
    await seedSeries({ id: ID, householdId: MAZZA_HOUSEHOLD_ID, accountId: OUR_ACCOUNT });
    const { res, body } = await api(`/recurring/${ID}`, json('PATCH', { amount: '-1300.00' }));
    expect(res.status).toBe(200);
    expect(body!.data.amount).toBe('-1300.00');
  });

  it('reactivates an ended series', async () => {
    await seedSeries({ id: ID, householdId: MAZZA_HOUSEHOLD_ID, accountId: OUR_ACCOUNT, status: 'ended' });
    const { body } = await api(`/recurring/${ID}`, json('PATCH', { status: 'active', nextDate: '2026-09-20' }));
    expect(body!.data.status).toBe('active');
    expect(body!.data.nextDate).toBe('2026-09-20');
  });

  it('answers 404 for another household series and leaves it untouched', async () => {
    const theirs = 'b2222222-2222-4222-8222-222222222222';
    await seedSeries({ id: theirs, householdId: OTHER_HOUSEHOLD, accountId: THEIR_ACCOUNT, amount: '-1200.00' });

    const { res } = await api(`/recurring/${theirs}`, json('PATCH', { amount: '-1.00' }));
    expect(res.status).toBe(404);

    const row = await env.DB.prepare('SELECT amount FROM recurring_transactions WHERE id = ?')
      .bind(theirs)
      .first<{ amount: string }>();
    expect(row?.amount).toBe('-1200.00');
  });

  it('rejects an empty body with 400', async () => {
    await seedSeries({ id: ID, householdId: MAZZA_HOUSEHOLD_ID, accountId: OUR_ACCOUNT });
    const { res, body } = await api(`/recurring/${ID}`, json('PATCH', {}));
    expect(res.status).toBe(400);
    expect(body!.error).toBe('No fields to update');
  });
});

describe('DELETE /recurring/:id', () => {
  it('ends the series rather than removing the row', async () => {
    const id = 'c1111111-1111-4111-8111-111111111111';
    await seedSeries({ id, householdId: MAZZA_HOUSEHOLD_ID, accountId: OUR_ACCOUNT });

    const { res } = await api(`/recurring/${id}`, { method: 'DELETE' });
    expect(res.status).toBe(204);

    const row = await env.DB.prepare('SELECT status FROM recurring_transactions WHERE id = ?')
      .bind(id)
      .first<{ status: string }>();
    expect(row?.status).toBe('ended');
  });

  it('answers 404 for another household series and leaves it active', async () => {
    const theirs = 'c2222222-2222-4222-8222-222222222222';
    await seedSeries({ id: theirs, householdId: OTHER_HOUSEHOLD, accountId: THEIR_ACCOUNT });

    const { res } = await api(`/recurring/${theirs}`, { method: 'DELETE' });
    expect(res.status).toBe(404);

    const row = await env.DB.prepare('SELECT status FROM recurring_transactions WHERE id = ?')
      .bind(theirs)
      .first<{ status: string }>();
    expect(row?.status).toBe('active');
  });
});

describe('overrides', () => {
  const SERIES = 'd1111111-1111-4111-8111-111111111111';

  beforeEach(async () => {
    await seedSeries({ id: SERIES, householdId: MAZZA_HOUSEHOLD_ID, accountId: OUR_ACCOUNT });
  });

  it('records a single-occurrence edit', async () => {
    const { res, body } = await api(
      `/recurring/${SERIES}/overrides/2026-09-01`,
      json('POST', { overrideType: 'modified', overrideAmount: '-1250.00' }),
    );
    expect(res.status).toBe(201);
    expect(body!.data).toMatchObject({ overrideType: 'modified', overrideAmount: '-1250.00' });
  });

  it('replaces rather than duplicating when the same occurrence is edited twice', async () => {
    // #100: the upsert always claimed one row per occurrence, but no unique
    // existed for onConflictDoNothing to conflict with, so the second edit
    // joined the first — and a deleted override beside a modified one means a
    // skipped bill can reappear.
    await api(
      `/recurring/${SERIES}/overrides/2026-09-01`,
      json('POST', { overrideType: 'modified', overrideAmount: '-1250.00' }),
    );
    const { res, body } = await api(
      `/recurring/${SERIES}/overrides/2026-09-01`,
      json('POST', { overrideType: 'modified', overrideAmount: '-1300.00' }),
    );

    expect(res.status).toBe(201);
    expect(body!.data.overrideAmount).toBe('-1300.00');

    const count = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM recurring_overrides WHERE recurring_transaction_id = ? AND original_date = ?',
    )
      .bind(SERIES, '2026-09-01')
      .first<{ n: number }>();
    expect(count?.n).toBe(1);
  });

  it('lists overrides by original date', async () => {
    await api(`/recurring/${SERIES}/overrides/2026-10-01`, json('POST', { overrideType: 'deleted' }));
    await api(`/recurring/${SERIES}/overrides/2026-09-01`, json('POST', { overrideType: 'deleted' }));

    const { body } = await api(`/recurring/${SERIES}/overrides`);
    expect(body!.data.map((o: any) => o.originalDate)).toEqual(['2026-09-01', '2026-10-01']);
  });

  it('deletes one', async () => {
    await api(`/recurring/${SERIES}/overrides/2026-09-01`, json('POST', { overrideType: 'deleted' }));

    const { res } = await api(`/recurring/${SERIES}/overrides/2026-09-01`, { method: 'DELETE' });
    expect(res.status).toBe(204);

    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM recurring_overrides').first<{ n: number }>();
    expect(count?.n).toBe(0);
  });

  it('answers 404 when the parent series is another household', async () => {
    const theirs = 'd2222222-2222-4222-8222-222222222222';
    await seedSeries({ id: theirs, householdId: OTHER_HOUSEHOLD, accountId: THEIR_ACCOUNT });

    const { res } = await api(
      `/recurring/${theirs}/overrides/2026-09-01`,
      json('POST', { overrideType: 'deleted' }),
    );
    expect(res.status).toBe(404);

    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM recurring_overrides').first<{ n: number }>();
    expect(count?.n).toBe(0);
  });

  it('will not delete another household override', async () => {
    // Express deleted by (id, date) with no parent check at all, so a known
    // pair was enough to reach across the boundary.
    const theirs = 'd3333333-3333-4333-8333-333333333333';
    await seedSeries({ id: theirs, householdId: OTHER_HOUSEHOLD, accountId: THEIR_ACCOUNT });
    await env.DB.prepare(
      `INSERT INTO recurring_overrides (id, household_id, recurring_transaction_id, original_date, override_type, created_at)
       VALUES ('d4444444-4444-4444-8444-444444444444', ?, ?, '2026-09-01', 'deleted', '2026-08-17T00:00:00.000Z')`,
    )
      .bind(OTHER_HOUSEHOLD, theirs)
      .run();

    const { res } = await api(`/recurring/${theirs}/overrides/2026-09-01`, { method: 'DELETE' });
    expect(res.status).toBe(404);

    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM recurring_overrides').first<{ n: number }>();
    expect(count?.n).toBe(1);
  });

  it('rejects a date that is not YYYY-MM-DD', async () => {
    const { res, body } = await api(
      `/recurring/${SERIES}/overrides/09-01-2026`,
      json('POST', { overrideType: 'deleted' }),
    );
    expect(res.status).toBe(400);
    expect(body!.error).toBe('Invalid id or date format (expected YYYY-MM-DD)');
  });
});

describe('POST /recurring/detect', () => {
  it('answers 404 for another household account', async () => {
    const { res } = await api('/recurring/detect', json('POST', { accountId: THEIR_ACCOUNT }));
    expect(res.status).toBe(404);
  });

  it('ends a series that genuinely stopped, and writes no end date', async () => {
    // #43 Defect 3: the end date used to be the series' own frozen nextDate —
    // a date the forecast predicted, never one on which anything was seen to
    // stop. The ended status carries the fact; a date would be fiction.
    await seedSeries({
      id: 'e1111111-1111-4111-8111-111111111111',
      householdId: MAZZA_HOUSEHOLD_ID,
      accountId: OUR_ACCOUNT,
      nextDate: '2020-01-15',
    });

    const { res, body } = await api('/recurring/detect', json('POST', { accountId: OUR_ACCOUNT }));
    expect(res.status).toBe(200);
    expect(body!.data.expired).toBe(1);

    const row = await env.DB.prepare(
      'SELECT status, end_date FROM recurring_transactions WHERE id = ?',
    )
      .bind('e1111111-1111-4111-8111-111111111111')
      .first<{ status: string; end_date: string | null }>();
    expect(row?.status).toBe('ended');
    expect(row?.end_date).toBeNull();
  });

  it('sweeps 60 series in one request', async () => {
    // Express advanced each paid series with its own UPDATE inside the loop.
    // The D1 free tier allows 50 queries per Worker invocation (#95), so this
    // request — the one that keeps the forecast populated — would have failed
    // on a household with this many series.
    for (let i = 0; i < 60; i++) {
      await seedSeries({
        id: `f${String(i).padStart(7, '0')}-1111-4111-8111-111111111111`,
        householdId: MAZZA_HOUSEHOLD_ID,
        accountId: OUR_ACCOUNT,
        name: `Series ${i}`,
        nextDate: '2020-01-15',
      });
    }

    const { res, body } = await api('/recurring/detect', json('POST', { accountId: OUR_ACCOUNT }));
    expect(res.status).toBe(200);
    expect(body!.data.expired).toBe(60);
  });

  it('never touches another household series', async () => {
    await seedSeries({
      id: 'a9999999-9999-4999-8999-999999999999',
      householdId: OTHER_HOUSEHOLD,
      accountId: THEIR_ACCOUNT,
      nextDate: '2020-01-15',
    });

    const { body } = await api('/recurring/detect', json('POST', { accountId: OUR_ACCOUNT }));
    expect(body!.data.expired).toBe(0);

    const row = await env.DB.prepare('SELECT status FROM recurring_transactions WHERE id = ?')
      .bind('a9999999-9999-4999-8999-999999999999')
      .first<{ status: string }>();
    expect(row?.status).toBe('active');
  });
});
