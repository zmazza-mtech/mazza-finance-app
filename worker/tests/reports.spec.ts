/**
 * Reports — ported from Express (#68), and the one place the Express app did
 * money arithmetic in the database (#69).
 *
 * `categoryTotals` was `SUM(${transactions.amount})`, typed `sql<string>`. On
 * Postgres the column was NUMERIC and the sum was exact. On D1 the column is
 * TEXT, and what SUM does with it was measured here rather than assumed:
 *
 *   SELECT SUM(amount), typeof(SUM(amount)) FROM ...
 *     three rows of '0.10'        -> 0.30000000000000004   typeof real
 *     '-0.10','-0.20','1e3','not-a-number','12.345' -> 1012.045
 *
 * Three things, all bad. The value arrives as a JS **number**, so the
 * `sql<string>` annotation is a lie the type system cannot catch. The float
 * error is real and reaches the wire. And 'not-a-number' was silently read as
 * zero — a row that cannot be summed is dropped from the total rather than
 * reported.
 *
 * The three tests below were each watched failing against that exact shape,
 * returning -0.30000000000000004, -7.000000000000009, and typeof 'number'.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { SELF, env } from 'cloudflare:test';
import { MAZZA_HOUSEHOLD_ID } from '../src/db/household.js';

const OTHER_HOUSEHOLD = '8e2a1f77-0c44-4f6e-9b3a-1d5c6e7f8a90';
const OUR_ACCOUNT = '55555555-5555-4555-8555-555555555555';
const THEIR_ACCOUNT = '66666666-6666-4666-8666-666666666666';

async function api(path: string) {
  const res = await SELF.fetch(`https://example.com/api/v1${path}`);
  const text = await res.text();
  const ct = res.headers.get('content-type') ?? '';
  return {
    res,
    body: ct.includes('json') && text ? (JSON.parse(text) as { data: any; error: any }) : null,
    text,
  };
}

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

let seq = 0;
async function seedTx(opts: {
  householdId?: string;
  accountId?: string;
  date?: string;
  description?: string;
  amount: string;
  category?: string | null;
  categorySource?: 'auto' | 'user';
}) {
  seq += 1;
  const id = `${String(seq).padStart(8, '0')}-1111-4111-8111-111111111111`;
  await env.DB.prepare(
    `INSERT INTO transactions (id, household_id, simplefin_id, account_id, date, description, amount, type, status, category, category_source, created_at, updated_at)
     VALUES (?, ?, NULL, ?, ?, ?, ?, 'actual', 'posted', ?, ?, '2026-08-17T00:00:00.000Z', '2026-08-17T00:00:00.000Z')`,
  )
    .bind(
      id,
      opts.householdId ?? MAZZA_HOUSEHOLD_ID,
      opts.accountId ?? OUR_ACCOUNT,
      opts.date ?? '2026-01-15',
      opts.description ?? 'Merchant',
      opts.amount,
      opts.category === undefined ? 'Groceries' : opts.category,
      opts.categorySource ?? 'auto',
    )
    .run();
  return id;
}

beforeEach(async () => {
  await env.DB.exec('DELETE FROM transactions');
  await env.DB.exec('DELETE FROM accounts');
  await seedAccount(OUR_ACCOUNT, MAZZA_HOUSEHOLD_ID);
  await seedAccount(THEIR_ACCOUNT, OTHER_HOUSEHOLD);
});

describe('the money invariant (#69)', () => {
  it('sums amounts exactly, where a float sum would not', async () => {
    // Measured against SUM(amount): -0.30000000000000004. This is the
    // assertion that reddens if SQL summation ever comes back.
    await seedTx({ amount: '-0.10' });
    await seedTx({ amount: '-0.20' });

    const { body } = await api(
      `/reports/category-summary?accountId=${OUR_ACCOUNT}&startDate=2026-01-01&endDate=2026-01-31`,
    );
    expect(body!.data.expenses[0].total).toBe('-0.30');
  });

  it('holds across many rows, where float error accumulates', async () => {
    // 100 x -0.07 is -7.00 exactly. Measured against SUM(amount):
    // -7.000000000000009.
    for (let i = 0; i < 100; i++) await seedTx({ amount: '-0.07' });

    const { body } = await api(
      `/reports/category-summary?accountId=${OUR_ACCOUNT}&startDate=2026-01-01&endDate=2026-01-31`,
    );
    expect(body!.data.expenses[0].total).toBe('-7.00');
  });

  it('returns totals as strings, never as numbers', async () => {
    await seedTx({ amount: '-84.21' });

    const { body } = await api(
      `/reports/category-summary?accountId=${OUR_ACCOUNT}&startDate=2026-01-01&endDate=2026-01-31`,
    );
    // SUM returns SQLite `real`, which reaches JS as a number however the
    // Drizzle call is typed. Measured: typeof 'number'.
    expect(typeof body!.data.expenses[0].total).toBe('string');
    expect(body!.data.expenses[0].total).toMatch(/^-?\d+\.\d{2}$/);
  });
});

describe('GET /reports/category-summary', () => {
  it('splits income from expenses', async () => {
    await seedTx({ amount: '2500.00', category: 'Income' });
    await seedTx({ amount: '-84.21', category: 'Groceries' });

    const { res, body } = await api(
      `/reports/category-summary?accountId=${OUR_ACCOUNT}&startDate=2026-01-01&endDate=2026-01-31`,
    );
    expect(res.status).toBe(200);
    expect(body!.data.income.map((r: any) => r.category)).toEqual(['Income']);
    expect(body!.data.expenses.map((r: any) => r.category)).toEqual(['Groceries']);
  });

  it('answers 404 for another household account', async () => {
    const { res } = await api(
      `/reports/category-summary?accountId=${THEIR_ACCOUNT}&startDate=2026-01-01&endDate=2026-01-31`,
    );
    expect(res.status).toBe(404);
  });

  it('excludes another household rows from the totals', async () => {
    await seedTx({ amount: '-10.00' });
    await seedTx({ householdId: OTHER_HOUSEHOLD, accountId: THEIR_ACCOUNT, amount: '-999.00' });

    const { body } = await api(
      `/reports/category-summary?accountId=${OUR_ACCOUNT}&startDate=2026-01-01&endDate=2026-01-31`,
    );
    expect(body!.data.expenses[0].total).toBe('-10.00');
  });

  it('rejects a missing date with 400', async () => {
    const { res } = await api(`/reports/category-summary?accountId=${OUR_ACCOUNT}`);
    expect(res.status).toBe(400);
  });
});

describe('GET /reports/category-trend', () => {
  it('returns one bucket per requested month', async () => {
    const { res, body } = await api(
      `/reports/category-trend?accountId=${OUR_ACCOUNT}&asOf=2026-03-15&months=3`,
    );
    expect(res.status).toBe(200);
    expect(body!.data.months).toHaveLength(3);
  });

  it('rejects months above the upper bound with 400', async () => {
    const { res } = await api(
      `/reports/category-trend?accountId=${OUR_ACCOUNT}&asOf=2026-03-15&months=13`,
    );
    expect(res.status).toBe(400);
  });

  it('accepts months as a query string integer', async () => {
    const { res } = await api(
      `/reports/category-trend?accountId=${OUR_ACCOUNT}&asOf=2026-03-15&months=3`,
    );
    expect(res.status).toBe(200);
  });

  it('answers 404 for another household account', async () => {
    const { res } = await api(
      `/reports/category-trend?accountId=${THEIR_ACCOUNT}&asOf=2026-03-15&months=3`,
    );
    expect(res.status).toBe(404);
  });
});

describe('GET /reports/monthly', () => {
  it('reports income, expenses and net per month as decimal strings', async () => {
    await seedTx({ date: '2026-01-10', amount: '2500.00', category: 'Income' });
    await seedTx({ date: '2026-01-20', amount: '-0.10' });
    await seedTx({ date: '2026-01-21', amount: '-0.20' });

    const { res, body } = await api(
      `/reports/monthly?accountId=${OUR_ACCOUNT}&startMonth=2026-01&endMonth=2026-01`,
    );
    expect(res.status).toBe(200);
    const jan = body!.data.months[0];
    expect(jan.income).toBe('2500.00');
    expect(jan.expenses).toBe('-0.30');
    expect(jan.net).toBe('2499.70');
  });

  it('rejects an end month before the start month', async () => {
    const { res } = await api(
      `/reports/monthly?accountId=${OUR_ACCOUNT}&startMonth=2026-03&endMonth=2026-01`,
    );
    expect(res.status).toBe(400);
  });

  it('answers 404 for another household account', async () => {
    const { res } = await api(
      `/reports/monthly?accountId=${THEIR_ACCOUNT}&startMonth=2026-01&endMonth=2026-01`,
    );
    expect(res.status).toBe(404);
  });
});

describe('GET /reports/uncategorized', () => {
  it('groups auto-categorized gaps by merchant', async () => {
    await seedTx({ description: 'MYSTERY LLC', amount: '-10.00', category: null });
    await seedTx({ description: 'MYSTERY LLC', amount: '-20.00', category: null });

    const { res, body } = await api('/reports/uncategorized');
    expect(res.status).toBe(200);
    expect(body!.data.groups[0].count).toBe(2);
  });

  it('leaves a user-set choice alone', async () => {
    await seedTx({ description: 'MYSTERY LLC', amount: '-10.00', category: null, categorySource: 'user' });

    const { body } = await api('/reports/uncategorized');
    expect(body!.data.groups).toEqual([]);
  });

  it('never counts another household rows', async () => {
    await seedTx({ householdId: OTHER_HOUSEHOLD, accountId: THEIR_ACCOUNT, description: 'THEIRS', amount: '-10.00', category: null });

    const { body } = await api('/reports/uncategorized');
    expect(body!.data.groups).toEqual([]);
  });
});

describe('CSV exports', () => {
  it('sends transactions.csv as a download', async () => {
    await seedTx({ description: 'Coffee', amount: '-4.50' });

    const { res, text } = await api(
      `/reports/transactions.csv?accountId=${OUR_ACCOUNT}&startDate=2026-01-01&endDate=2026-01-31`,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    expect(res.headers.get('content-disposition')).toContain('attachment');
    // Amounts are written exactly as the API states them: an export that
    // prettified them into "$4.50" would not import back.
    expect(text).toContain('-4.50');
  });

  it('sends category-summary.csv as a download', async () => {
    await seedTx({ amount: '-84.21' });

    const { res, text } = await api(
      `/reports/category-summary.csv?accountId=${OUR_ACCOUNT}&startDate=2026-01-01&endDate=2026-01-31`,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    expect(text).toContain('-84.21');
  });

  it('answers 404 for another household account rather than exporting it', async () => {
    const { res } = await api(
      `/reports/transactions.csv?accountId=${THEIR_ACCOUNT}&startDate=2026-01-01&endDate=2026-01-31`,
    );
    expect(res.status).toBe(404);
  });
});
