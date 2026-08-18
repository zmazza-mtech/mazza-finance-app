/**
 * Forecast — ported from Express (#68), household-scoped.
 *
 * The pipeline itself is the unchanged service layer, already covered by the
 * backend suite and the workerd CPU gate. What is asserted here is the router
 * around it: the queries it issues, the seed-balance arithmetic, and the
 * tenancy boundary.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { SELF, env } from 'cloudflare:test';
import { MAZZA_HOUSEHOLD_ID } from '../src/db/household.js';
import { authed } from './helpers/auth.js';

const OTHER_HOUSEHOLD = '8e2a1f77-0c44-4f6e-9b3a-1d5c6e7f8a90';
const OUR_ACCOUNT = '55555555-5555-4555-8555-555555555555';
const THEIR_ACCOUNT = '66666666-6666-4666-8666-666666666666';

async function api(path: string) {
  const res = await SELF.fetch(`https://example.com/api/v1${path}`, authed());
  const text = await res.text();
  return { res, body: text ? (JSON.parse(text) as { data: any; error: any }) : null };
}

async function seedAccount(id: string, householdId: string, lastBalance: string | null = null) {
  await env.DB.prepare('INSERT OR IGNORE INTO households (id, name, created_at) VALUES (?, ?, ?)')
    .bind(householdId, 'H', '2026-08-17T00:00:00.000Z')
    .run();
  await env.DB.prepare(
    `INSERT INTO accounts (id, household_id, simplefin_id, institution, name, type, currency, last_balance, is_active, include_in_view, created_at, updated_at)
     VALUES (?, ?, NULL, 'Bank', 'Checking', 'checking', 'USD', ?, 1, 1, '2026-08-17T00:00:00.000Z', '2026-08-17T00:00:00.000Z')`,
  )
    .bind(id, householdId, lastBalance)
    .run();
}

async function seedTransaction(id: string, householdId: string, accountId: string, date: string, amount: string, type: 'actual' | 'manual' = 'actual') {
  await env.DB.prepare(
    `INSERT INTO transactions (id, household_id, simplefin_id, account_id, date, description, amount, type, status, category, category_source, created_at, updated_at)
     VALUES (?, ?, NULL, ?, ?, 'Tx', ?, ?, 'posted', NULL, 'auto', '2026-08-17T00:00:00.000Z', '2026-08-17T00:00:00.000Z')`,
  )
    .bind(id, householdId, accountId, date, amount, type)
    .run();
}

async function seedSeries(id: string, householdId: string, accountId: string, amount: string, nextDate: string) {
  await env.DB.prepare(
    `INSERT INTO recurring_transactions (id, household_id, account_id, name, amount, frequency, next_date, end_date, source, status, category, created_at, updated_at)
     VALUES (?, ?, ?, 'Internet Bill', ?, 'monthly', ?, NULL, 'manual', 'active', NULL, '2026-08-17T00:00:00.000Z', '2026-08-17T00:00:00.000Z')`,
  )
    .bind(id, householdId, accountId, amount, nextDate)
    .run();
}

beforeEach(async () => {
  await env.DB.exec('DELETE FROM recurring_overrides');
  await env.DB.exec('DELETE FROM recurring_transactions');
  await env.DB.exec('DELETE FROM transactions');
  await env.DB.exec('DELETE FROM accounts');
  await seedAccount(OUR_ACCOUNT, MAZZA_HOUSEHOLD_ID, '1000.00');
  await seedAccount(THEIR_ACCOUNT, OTHER_HOUSEHOLD, '9999.00');
});

describe('GET /forecast — validation and tenancy', () => {
  it('rejects a missing accountId with 400', async () => {
    const { res } = await api('/forecast?startDate=2026-01-01&endDate=2026-01-31');
    expect(res.status).toBe(400);
  });

  it('rejects a malformed date with 400', async () => {
    const { res } = await api(`/forecast?accountId=${OUR_ACCOUNT}&startDate=01-01-2026&endDate=2026-01-31`);
    expect(res.status).toBe(400);
  });

  it('answers 404 for another household account', async () => {
    const { res, body } = await api(
      `/forecast?accountId=${THEIR_ACCOUNT}&startDate=2026-01-01&endDate=2026-01-31`,
    );
    expect(res.status).toBe(404);
    expect(body!.error).toBe('Account not found');
  });

  it('returns one entry per day in the range', async () => {
    const { res, body } = await api(
      `/forecast?accountId=${OUR_ACCOUNT}&startDate=2026-01-01&endDate=2026-01-31`,
    );
    expect(res.status).toBe(200);
    expect(body!.data).toHaveLength(31);
    expect(body!.data[0].date).toBe('2026-01-01');
  });
});

describe('GET /forecast — money', () => {
  it('counts a paid bill once rather than twice', async () => {
    // The #43 repro, held as an integration test against the ported router:
    // a monthly series of -100.00 with a matching posted actual.
    await seedSeries('a1111111-1111-4111-8111-111111111111', MAZZA_HOUSEHOLD_ID, OUR_ACCOUNT, '-100.00', '2026-01-15');
    await seedTransaction('b1111111-1111-4111-8111-111111111111', MAZZA_HOUSEHOLD_ID, OUR_ACCOUNT, '2026-01-15', '-100.00');

    const { body } = await api(
      `/forecast?accountId=${OUR_ACCOUNT}&startDate=2026-01-01&endDate=2026-01-31`,
    );
    const jan15 = body!.data.find((d: any) => d.date === '2026-01-15');
    expect(jan15.transactions).toHaveLength(1);
    expect(jan15.dailyNet).toBe('-100.00');
  });

  it('still forecasts an instance with no payment behind it', async () => {
    await seedSeries('a2222222-2222-4222-8222-222222222222', MAZZA_HOUSEHOLD_ID, OUR_ACCOUNT, '-100.00', '2026-01-15');

    const { body } = await api(
      `/forecast?accountId=${OUR_ACCOUNT}&startDate=2026-01-01&endDate=2026-01-31`,
    );
    const jan15 = body!.data.find((d: any) => d.date === '2026-01-15');
    expect(jan15.transactions).toHaveLength(1);
    expect(jan15.transactions[0].source).toBe('forecast');
  });

  it('carries amounts as decimal strings, never numbers', async () => {
    await seedTransaction('b2222222-2222-4222-8222-222222222222', MAZZA_HOUSEHOLD_ID, OUR_ACCOUNT, '2026-01-10', '-15.99');

    const { body } = await api(
      `/forecast?accountId=${OUR_ACCOUNT}&startDate=2026-01-01&endDate=2026-01-31`,
    );
    const jan10 = body!.data.find((d: any) => d.date === '2026-01-10');
    expect(jan10.transactions[0].amount).toBe('-15.99');
    expect(typeof jan10.dailyNet).toBe('string');
    expect(typeof jan10.runningBalance).toBe('string');
  });

  it('back-calculates the opening balance when the view starts in the past', async () => {
    // seedBalance = lastBalance - sum(transactions from startDate to today).
    // One -100.00 in the past against a 1000.00 last balance opens at 1100.00,
    // so the day it posts closes back at 1000.00.
    const past = new Date(Date.now() - 5 * 86_400_000).toISOString().slice(0, 10);
    await seedTransaction('b3333333-3333-4333-8333-333333333333', MAZZA_HOUSEHOLD_ID, OUR_ACCOUNT, past, '-100.00');

    const start = new Date(Date.now() - 10 * 86_400_000).toISOString().slice(0, 10);
    const end = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);

    const { body } = await api(`/forecast?accountId=${OUR_ACCOUNT}&startDate=${start}&endDate=${end}`);
    expect(body!.data[0].runningBalance).toBe('1100.00');
    expect(body!.data.find((d: any) => d.date === past).runningBalance).toBe('1000.00');
  });

  it('opens at the last balance when the range starts today or later', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const end = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);

    const { body } = await api(`/forecast?accountId=${OUR_ACCOUNT}&startDate=${today}&endDate=${end}`);
    expect(body!.data[0].runningBalance).toBe('1000.00');
  });
});

describe('GET /forecast — tenancy inside the pipeline', () => {
  it('excludes another household transactions on the same dates', async () => {
    await seedTransaction('b4444444-4444-4444-8444-444444444444', OTHER_HOUSEHOLD, THEIR_ACCOUNT, '2026-01-10', '-500.00');

    const { body } = await api(
      `/forecast?accountId=${OUR_ACCOUNT}&startDate=2026-01-01&endDate=2026-01-31`,
    );
    const jan10 = body!.data.find((d: any) => d.date === '2026-01-10');
    expect(jan10.transactions).toEqual([]);
  });

  it('excludes another household series', async () => {
    await seedSeries('a3333333-3333-4333-8333-333333333333', OTHER_HOUSEHOLD, THEIR_ACCOUNT, '-100.00', '2026-01-15');

    const { body } = await api(
      `/forecast?accountId=${OUR_ACCOUNT}&startDate=2026-01-01&endDate=2026-01-31`,
    );
    expect(body!.data.every((d: any) => d.transactions.length === 0)).toBe(true);
  });

  it('does not let another household override reach our series', async () => {
    // Express filtered overrides by date only, then narrowed by series id in
    // JS. Scoped by household in SQL, a foreign override never arrives.
    const ours = 'a4444444-4444-4444-8444-444444444444';
    await seedSeries(ours, MAZZA_HOUSEHOLD_ID, OUR_ACCOUNT, '-100.00', '2026-01-15');
    await env.DB.prepare(
      `INSERT INTO recurring_overrides (id, household_id, recurring_transaction_id, original_date, override_type, created_at)
       VALUES ('c1111111-1111-4111-8111-111111111111', ?, ?, '2026-01-15', 'deleted', '2026-08-17T00:00:00.000Z')`,
    )
      .bind(OTHER_HOUSEHOLD, ours)
      .run();

    const { body } = await api(
      `/forecast?accountId=${OUR_ACCOUNT}&startDate=2026-01-01&endDate=2026-01-31`,
    );
    const jan15 = body!.data.find((d: any) => d.date === '2026-01-15');
    expect(jan15.transactions).toHaveLength(1);
  });
});
