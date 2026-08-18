/**
 * CSV import — ported from Express (#68), household-scoped.
 *
 * The insert is chunked because D1 binds at most 100 parameters per query,
 * measured at 8 rows for this table (#102). Express issued one bulk insert
 * for the whole payload, which fails outright on D1 at 20 rows.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { SELF, env } from 'cloudflare:test';
import { MAZZA_HOUSEHOLD_ID } from '../src/db/household.js';

const OTHER_HOUSEHOLD = '8e2a1f77-0c44-4f6e-9b3a-1d5c6e7f8a90';
const OUR_ACCOUNT = '55555555-5555-4555-8555-555555555555';
const THEIR_ACCOUNT = '66666666-6666-4666-8666-666666666666';

async function post(path: string, body: unknown) {
  const res = await SELF.fetch(`https://example.com/api/v1${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { res, body: text ? (JSON.parse(text) as { data: any; error: any }) : null };
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

beforeEach(async () => {
  await env.DB.exec('DELETE FROM transactions');
  await env.DB.exec('DELETE FROM accounts');
  await seedAccount(OUR_ACCOUNT, MAZZA_HOUSEHOLD_ID);
  await seedAccount(THEIR_ACCOUNT, OTHER_HOUSEHOLD);
});

describe('POST /import/csv', () => {
  it('imports rows and categorizes them', async () => {
    const { res, body } = await post('/import/csv', {
      accountId: OUR_ACCOUNT,
      transactions: [
        { date: '2026-01-15', description: 'WHOLE FOODS MARKET', amount: '-84.21' },
        { date: '2026-01-16', description: 'SHELL OIL', amount: '-45.00' },
      ],
    });

    expect(res.status).toBe(200);
    expect(body!.data).toEqual({ imported: 2, skipped: 0, errors: [] });

    const row = await env.DB.prepare(
      "SELECT category, household_id, type FROM transactions WHERE description = 'WHOLE FOODS MARKET'",
    ).first<{ category: string; household_id: string; type: string }>();
    expect(row?.category).toBe('Groceries');
    expect(row?.household_id).toBe(MAZZA_HOUSEHOLD_ID);
    expect(row?.type).toBe('manual');
  });

  it('imports 200 rows, which one bulk insert cannot do on D1', async () => {
    // Measured (#102): a single INSERT into this table takes 8 rows before D1
    // rejects it on bound parameters. Express issued exactly one for the whole
    // payload, so this request would have failed outright.
    const transactions = Array.from({ length: 200 }, (_, i) => ({
      date: '2026-01-15',
      description: `Merchant ${i}`,
      amount: '-1.00',
    }));

    const { res, body } = await post('/import/csv', { accountId: OUR_ACCOUNT, transactions });
    expect(res.status).toBe(200);
    expect(body!.data.imported).toBe(200);

    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM transactions').first<{ n: number }>();
    expect(count?.n).toBe(200);
  });

  it('skips a row already present, matched on date, description and amount', async () => {
    await post('/import/csv', {
      accountId: OUR_ACCOUNT,
      transactions: [{ date: '2026-01-15', description: 'Coffee', amount: '-4.50' }],
    });

    const { body } = await post('/import/csv', {
      accountId: OUR_ACCOUNT,
      transactions: [
        { date: '2026-01-15', description: 'Coffee', amount: '-4.50' },
        { date: '2026-01-16', description: 'Coffee', amount: '-4.50' },
      ],
    });

    expect(body!.data).toEqual({ imported: 1, skipped: 1, errors: [] });
  });

  it('treats -4.5 and -4.50 as the same row', async () => {
    await post('/import/csv', {
      accountId: OUR_ACCOUNT,
      transactions: [{ date: '2026-01-15', description: 'Coffee', amount: '-4.50' }],
    });

    const { body } = await post('/import/csv', {
      accountId: OUR_ACCOUNT,
      transactions: [{ date: '2026-01-15', description: 'Coffee', amount: '-4.5' }],
    });

    expect(body!.data.skipped).toBe(1);
  });

  it('refuses to import into another household account', async () => {
    const { res, body } = await post('/import/csv', {
      accountId: THEIR_ACCOUNT,
      transactions: [{ date: '2026-01-15', description: 'Coffee', amount: '-4.50' }],
    });

    expect(res.status).toBe(400);
    expect(body!.error).toBe('Account not found');

    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM transactions').first<{ n: number }>();
    expect(count?.n).toBe(0);
  });

  it('does not dedupe against another household rows', async () => {
    // Their identical row must not make ours look like a duplicate.
    await env.DB.prepare(
      `INSERT INTO transactions (id, household_id, simplefin_id, account_id, date, description, amount, type, status, category, category_source, created_at, updated_at)
       VALUES ('99999999-9999-4999-8999-999999999999', ?, NULL, ?, '2026-01-15', 'Coffee', '-4.50', 'manual', 'posted', NULL, 'auto', '2026-08-17T00:00:00.000Z', '2026-08-17T00:00:00.000Z')`,
    )
      .bind(OTHER_HOUSEHOLD, THEIR_ACCOUNT)
      .run();

    const { body } = await post('/import/csv', {
      accountId: OUR_ACCOUNT,
      transactions: [{ date: '2026-01-15', description: 'Coffee', amount: '-4.50' }],
    });

    expect(body!.data).toEqual({ imported: 1, skipped: 0, errors: [] });
  });

  it('rejects an empty transaction list with 400', async () => {
    const { res } = await post('/import/csv', { accountId: OUR_ACCOUNT, transactions: [] });
    expect(res.status).toBe(400);
  });

  it('rejects a malformed amount with 400 and writes nothing', async () => {
    const { res } = await post('/import/csv', {
      accountId: OUR_ACCOUNT,
      transactions: [{ date: '2026-01-15', description: 'Coffee', amount: '4.5.0' }],
    });
    expect(res.status).toBe(400);

    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM transactions').first<{ n: number }>();
    expect(count?.n).toBe(0);
  });
});
