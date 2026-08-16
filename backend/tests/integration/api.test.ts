/**
 * Integration tests for the Express API.
 *
 * These run against the throwaway Postgres `globalSetup.ts` brings up, so
 * every DB-backed assertion is against the real thing. The focus here is the
 * request/response contract:
 *   - Zod input validation (400 on bad input)
 *   - Route existence and HTTP method handling
 *   - 404 for unknown routes
 *
 * Endpoint behaviour in depth lives in reports.test.ts and import.test.ts.
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import supertest from 'supertest';
import app from '../../src/app';
import { closeDb } from '../../src/db/client';
import { resetDb, seedAccount, seedTransactions, allTransactions } from '../helpers/db';

const request = supertest(app);

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const res = await request.get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

// ---------------------------------------------------------------------------
// 404 for unknown routes
// ---------------------------------------------------------------------------

describe('Unknown routes', () => {
  it('returns 404 for unknown GET', async () => {
    const res = await request.get('/api/v1/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body.error).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Input validation — no DB required
// ---------------------------------------------------------------------------

describe('POST /api/v1/transactions — input validation', () => {
  it('returns 400 when accountId is missing', async () => {
    const res = await request
      .post('/api/v1/transactions')
      .send({ date: '2024-01-01', description: 'Test', amount: '-10.00' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when date format is invalid', async () => {
    const res = await request
      .post('/api/v1/transactions')
      .send({
        accountId: '550e8400-e29b-41d4-a716-446655440000',
        date: '01/01/2024', // wrong format
        description: 'Test',
        amount: '-10.00',
      });

    expect(res.status).toBe(400);
  });

  it('returns 400 when amount is not a decimal string', async () => {
    const res = await request
      .post('/api/v1/transactions')
      .send({
        accountId: '550e8400-e29b-41d4-a716-446655440000',
        date: '2024-01-01',
        description: 'Test',
        amount: 'ten dollars', // invalid
      });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/v1/recurring — input validation', () => {
  it('returns 400 for invalid frequency', async () => {
    const res = await request
      .post('/api/v1/recurring')
      .send({
        accountId: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Netflix',
        amount: '-15.99',
        frequency: 'daily', // not in enum
        nextDate: '2024-02-01',
      });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/forecast — input validation', () => {
  it('returns 400 when accountId is missing', async () => {
    const res = await request
      .get('/api/v1/forecast')
      .query({ startDate: '2024-01-01', endDate: '2024-01-31' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when dates are invalid format', async () => {
    const res = await request
      .get('/api/v1/forecast')
      .query({
        accountId: '550e8400-e29b-41d4-a716-446655440000',
        startDate: '2024/01/01',
        endDate: '2024/01/31',
      });

    expect(res.status).toBe(400);
  });
});

describe('PUT /api/v1/settings/:key — input validation', () => {
  it('returns 400 for unknown setting key', async () => {
    const res = await request
      .put('/api/v1/settings/unknown_key')
      .send({ value: 'something' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('unknown_key');
  });

  it('returns 400 when value is missing', async () => {
    const res = await request
      .put('/api/v1/settings/theme')
      .send({});

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Reports — input validation
// ---------------------------------------------------------------------------

const ACCOUNT_ID = '550e8400-e29b-41d4-a716-446655440000';

describe('GET /api/v1/reports/category-trend — input validation', () => {
  it('returns 400 when accountId is not a uuid', async () => {
    const res = await request.get('/api/v1/reports/category-trend').query({
      accountId: 'not-a-uuid',
      asOf: '2026-08-15',
      months: 4,
    });

    expect(res.status).toBe(400);
  });

  it('returns 400 when asOf is not YYYY-MM-DD', async () => {
    const res = await request.get('/api/v1/reports/category-trend').query({
      accountId: ACCOUNT_ID,
      asOf: '08/15/2026',
      months: 4,
    });

    expect(res.status).toBe(400);
  });

  it('returns 400 when months is below the lower bound', async () => {
    const res = await request.get('/api/v1/reports/category-trend').query({
      accountId: ACCOUNT_ID,
      asOf: '2026-08-15',
      months: 0,
    });

    expect(res.status).toBe(400);
  });

  it('returns 400 when months is above the upper bound', async () => {
    const res = await request.get('/api/v1/reports/category-trend').query({
      accountId: ACCOUNT_ID,
      asOf: '2026-08-15',
      months: 13,
    });

    expect(res.status).toBe(400);
  });

  it('returns 400 when months is not an integer', async () => {
    const res = await request.get('/api/v1/reports/category-trend').query({
      accountId: ACCOUNT_ID,
      asOf: '2026-08-15',
      months: '2.5',
    });

    expect(res.status).toBe(400);
  });

  it('returns 400 when months is missing', async () => {
    const res = await request.get('/api/v1/reports/category-trend').query({
      accountId: ACCOUNT_ID,
      asOf: '2026-08-15',
    });

    expect(res.status).toBe(400);
  });

  it('accepts months as a query string integer rather than rejecting it', async () => {
    // Query params arrive as strings; the schema coerces. A validation
    // rejection here would mean the coercion regressed.
    const res = await request.get('/api/v1/reports/category-trend').query({
      accountId: ACCOUNT_ID,
      asOf: '2026-08-15',
      months: '4',
    });

    expect(res.status).not.toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Method not allowed basics
// ---------------------------------------------------------------------------

describe('HTTP method enforcement', () => {
  it('GET /api/v1/sync returns 404 (POST only)', async () => {
    const res = await request.get('/api/v1/sync');
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Auto-categorization on create
// ---------------------------------------------------------------------------

describe('POST /transactions — categorization', () => {
  let accountId: string;

  beforeEach(async () => {
    await resetDb();
    accountId = (await seedAccount()).id;
  });

  it('returns a category derived from the description', async () => {
    const res = await request.post('/api/v1/transactions').send({
      accountId,
      date: '2026-08-10',
      description: 'SHELL OIL 5729',
      amount: '-42.00',
    });

    expect(res.status).toBe(201);
    expect(res.body.data.category).toBe('Transportation');
  });

  it('honours an explicit category over the guess', async () => {
    const res = await request.post('/api/v1/transactions').send({
      accountId,
      date: '2026-08-10',
      description: 'SHELL OIL 5729',
      amount: '-42.00',
      category: 'Dining',
    });

    expect(res.status).toBe(201);
    expect(res.body.data.category).toBe('Dining');
  });

  it('returns a null category for a description it cannot place', async () => {
    const res = await request.post('/api/v1/transactions').send({
      accountId,
      date: '2026-08-10',
      description: 'ZZQQ 4417',
      amount: '-42.00',
    });

    expect(res.status).toBe(201);
    expect(res.body.data.category).toBeNull();
  });

  it('persists the category, not just reports it', async () => {
    await request.post('/api/v1/transactions').send({
      accountId,
      date: '2026-08-10',
      description: 'SHELL OIL 5729',
      amount: '-42.00',
    });

    const [saved] = await allTransactions(accountId);
    expect(saved!.category).toBe('Transportation');
  });
});

// ---------------------------------------------------------------------------
// The transaction wire shape the frontend maps from
// ---------------------------------------------------------------------------

/**
 * `GET /transactions` returns raw Drizzle rows, and the frontend translates
 * them into its own `Transaction` — `type` becomes `source`, and nothing else
 * is renamed. That translation is written against the key set below, so a
 * column added, dropped or renamed here has to fail loudly rather than reach
 * the browser as an undefined field the UI renders blank (issue #34).
 */
const TRANSACTION_WIRE_KEYS = [
  'accountId',
  'amount',
  'category',
  'categorySource',
  'createdAt',
  'date',
  'description',
  'id',
  'simplefinId',
  'status',
  'type',
  'updatedAt',
].sort();

describe('Transaction wire shape', () => {
  let accountId: string;

  beforeEach(async () => {
    await resetDb();
    accountId = (await seedAccount()).id;
    await seedTransactions(accountId, [
      { date: '2026-08-10', description: 'KROGER 118', amount: '-42.00', type: 'actual' },
    ]);
  });

  it('returns exactly the keys the frontend maps from', async () => {
    const res = await request.get(`/api/v1/transactions?accountId=${accountId}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(Object.keys(res.body.data[0]).sort()).toEqual(TRANSACTION_WIRE_KEYS);
  });

  it('carries the transaction type the frontend reads as its source', async () => {
    const res = await request.get(`/api/v1/transactions?accountId=${accountId}`);

    expect(res.body.data[0].type).toBe('actual');
  });

  it('answers PATCH with the same shape it answers GET with', async () => {
    const [seeded] = await allTransactions(accountId);

    const res = await request
      .patch(`/api/v1/transactions/${seeded!.id}`)
      .send({ category: 'Groceries' });

    expect(res.status).toBe(200);
    expect(Object.keys(res.body.data).sort()).toEqual(TRANSACTION_WIRE_KEYS);
  });

  it('answers POST with the same shape it answers GET with', async () => {
    const res = await request.post('/api/v1/transactions').send({
      accountId,
      date: '2026-08-11',
      description: 'SHELL OIL 5729',
      amount: '-30.00',
    });

    expect(res.status).toBe(201);
    expect(Object.keys(res.body.data).sort()).toEqual(TRANSACTION_WIRE_KEYS);
  });
});

// ---------------------------------------------------------------------------
// Category corrections that survive re-categorization
// ---------------------------------------------------------------------------

describe('Category corrections', () => {
  let accountId: string;

  beforeEach(async () => {
    await resetDb();
    accountId = (await seedAccount()).id;
  });

  async function seedOne(overrides: Partial<{ description: string; category: string | null }> = {}) {
    const res = await request.post('/api/v1/transactions').send({
      accountId,
      date: '2026-08-10',
      description: overrides.description ?? 'SHELL OIL 5729',
      amount: '-42.00',
      ...(overrides.category !== undefined ? { category: overrides.category } : {}),
    });
    return res.body.data.id as string;
  }

  it('records an auto-assigned category as auto', async () => {
    await seedOne();
    const [saved] = await allTransactions(accountId);
    expect(saved!.category).toBe('Transportation');
    expect(saved!.categorySource).toBe('auto');
  });

  it('marks a corrected category as user-set', async () => {
    const id = await seedOne();

    const res = await request
      .patch(`/api/v1/transactions/${id}`)
      .send({ category: 'Groceries' });

    expect(res.status).toBe(200);
    const [saved] = await allTransactions(accountId);
    expect(saved!.category).toBe('Groceries');
    expect(saved!.categorySource).toBe('user');
  });

  it('marks a deliberately cleared category as user-set', async () => {
    const id = await seedOne();

    await request.patch(`/api/v1/transactions/${id}`).send({ category: null });

    const [saved] = await allTransactions(accountId);
    expect(saved!.category).toBeNull();
    expect(saved!.categorySource).toBe('user');
  });

  it('rejects a category outside the enum and leaves the row untouched', async () => {
    const id = await seedOne();

    const res = await request
      .patch(`/api/v1/transactions/${id}`)
      .send({ category: 'Nonsense' });

    expect(res.status).toBe(400);
    const [saved] = await allTransactions(accountId);
    expect(saved!.category).toBe('Transportation');
    expect(saved!.categorySource).toBe('auto');
  });

  it('leaves a user-set category in place when categories are backfilled', async () => {
    const id = await seedOne({ description: 'ZZQQ 4417' });
    await request.patch(`/api/v1/transactions/${id}`).send({ category: 'Groceries' });

    // Clearing the category directly mimics a row the backfill would otherwise
    // claim, without going through the endpoint that sets the source.
    const res = await request.post('/api/v1/transactions/backfill-categories');
    expect(res.status).toBe(200);

    const [saved] = await allTransactions(accountId);
    expect(saved!.category).toBe('Groceries');
    expect(saved!.categorySource).toBe('user');
  });

  it('does not re-categorize a category the user deliberately cleared', async () => {
    const id = await seedOne();
    await request.patch(`/api/v1/transactions/${id}`).send({ category: null });

    await request.post('/api/v1/transactions/backfill-categories');

    const [saved] = await allTransactions(accountId);
    expect(saved!.category).toBeNull();
    expect(saved!.categorySource).toBe('user');
  });

  it('still backfills a row the user has never touched', async () => {
    // Seeded directly so the row starts uncategorized despite a description
    // the keyword map can place — the state the backfill exists to clean up.
    await seedTransactions(accountId, [
      { date: '2026-08-10', description: 'KROGER 118', amount: '-42.00', category: null },
    ]);

    const res = await request.post('/api/v1/transactions/backfill-categories');
    expect(res.status).toBe(200);
    expect(res.body.data.updated).toBe(1);

    const [saved] = await allTransactions(accountId);
    expect(saved!.category).toBe('Groceries');
    expect(saved!.categorySource).toBe('auto');
  });

  it('marks a batch correction user-set across every matching description', async () => {
    await seedOne({ description: 'DBT CRD 0407 27105864 TSTDRIP KITCHEN' });
    await seedOne({ description: 'DBT CRD 0937 11111111 TSTDRIP KITCHEN' });

    const res = await request
      .post('/api/v1/transactions/batch-categorize')
      .send({ description: 'TSTDRIP KITCHEN', category: 'Dining' });

    expect(res.status).toBe(200);
    expect(res.body.data.updated).toBe(2);

    const saved = await allTransactions(accountId);
    expect(saved.every((t) => t.category === 'Dining')).toBe(true);
    expect(saved.every((t) => t.categorySource === 'user')).toBe(true);
  });
});

afterAll(async () => {
  await closeDb();
});

// ---------------------------------------------------------------------------
// #43 — a paid recurring bill is counted once
// ---------------------------------------------------------------------------

describe('GET /forecast — reconciliation of actuals against recurring instances', () => {
  let accountId: string;

  /** An active monthly series billing on the 15th. */
  async function seedSeries(amount = '-100.00', nextDate = '2026-01-15') {
    const res = await request.post('/api/v1/recurring').send({
      accountId,
      name: 'Internet Bill',
      amount,
      frequency: 'monthly',
      nextDate,
    });
    expect(res.status).toBe(201);
    await request.patch(`/api/v1/recurring/${res.body.data.id}`).send({ status: 'active' });
    return res.body.data.id as string;
  }

  function day(body: { data: { date: string }[] }, date: string) {
    return body.data.find((d) => d.date === date)!;
  }

  beforeEach(async () => {
    await resetDb();
    accountId = (await seedAccount({ lastBalance: '1000.00' })).id;
  });

  it('counts a bill once when the forecast instance was actually paid', async () => {
    await seedSeries();
    await seedTransactions(accountId, [
      { date: '2026-01-15', description: 'Internet Bill', amount: '-100.00', type: 'actual' },
    ]);

    const res = await request
      .get('/api/v1/forecast')
      .query({ accountId, startDate: '2026-01-01', endDate: '2026-01-31' });

    expect(res.status).toBe(200);
    const jan15 = day(res.body, '2026-01-15');

    // Before this, the day carried both rows and netted -200.00.
    expect(jan15.transactions).toHaveLength(1);
    expect(jan15.transactions[0].source).toBe('actual');
    expect(jan15.dailyNet).toBe('-100.00');
  });

  it('still forecasts an instance with no payment behind it', async () => {
    await seedSeries();

    const res = await request
      .get('/api/v1/forecast')
      .query({ accountId, startDate: '2026-01-01', endDate: '2026-01-31' });

    const jan15 = day(res.body, '2026-01-15');
    expect(jan15.transactions).toHaveLength(1);
    expect(jan15.transactions[0].source).toBe('forecast');
    expect(jan15.dailyNet).toBe('-100.00');
  });

  it('keeps both rows when the amount drifted beyond tolerance', async () => {
    await seedSeries();
    await seedTransactions(accountId, [
      { date: '2026-01-15', description: 'Internet Bill', amount: '-400.00', type: 'actual' },
    ]);

    const res = await request
      .get('/api/v1/forecast')
      .query({ accountId, startDate: '2026-01-01', endDate: '2026-01-31' });

    // Left visible so #12 has a discrepancy to report, rather than one of them
    // being silently swallowed.
    const jan15 = day(res.body, '2026-01-15');
    expect(jan15.transactions).toHaveLength(2);
  });

  it('suppresses a payment that landed a day late, within tolerance', async () => {
    await seedSeries();
    await seedTransactions(accountId, [
      { date: '2026-01-16', description: 'Internet Bill', amount: '-104.00', type: 'actual' },
    ]);

    const res = await request
      .get('/api/v1/forecast')
      .query({ accountId, startDate: '2026-01-01', endDate: '2026-01-31' });

    expect(day(res.body, '2026-01-15').transactions).toHaveLength(0);
    expect(day(res.body, '2026-01-16').transactions).toHaveLength(1);
  });

  it('leaves a manual entry standing alongside its instance', async () => {
    await seedSeries();
    await request.post('/api/v1/transactions').send({
      accountId,
      date: '2026-01-15',
      description: 'Internet Bill',
      amount: '-100.00',
    });

    const res = await request
      .get('/api/v1/forecast')
      .query({ accountId, startDate: '2026-01-01', endDate: '2026-01-31' });

    // A manual entry is something the user added deliberately, not a bank
    // record of the forecast bill.
    expect(day(res.body, '2026-01-15').transactions).toHaveLength(2);
  });
});
