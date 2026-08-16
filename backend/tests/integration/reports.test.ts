/**
 * Integration tests for the reports endpoints, against real Postgres.
 *
 * These exercise the grouped SQL behind category-summary and category-trend —
 * the query the redesign spec recorded as untested, because the production
 * database is deliberately unreachable from the host. `globalSetup.ts` brings
 * up a throwaway instance so it can be covered for real rather than stubbed.
 *
 * Totals are asserted as exact decimal strings. NUMERIC comes back from the
 * driver as a string and must stay one all the way out; a float comparison
 * here would pass while hiding precision loss.
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import supertest from 'supertest';
import app from '../../src/app';
import { closeDb } from '../../src/db/client';
import { resetDb, seedAccount, seedTransactions, ABSENT_UUID } from '../helpers/db';

const request = supertest(app);
const SUMMARY = '/api/v1/reports/category-summary';
const TREND = '/api/v1/reports/category-trend';

let accountId: string;

beforeEach(async () => {
  await resetDb();
  accountId = (await seedAccount()).id;
});

afterAll(async () => {
  await closeDb();
});

/** Sorts by category so assertions do not depend on GROUP BY ordering. */
function byCategory(rows: { category: string; total: string }[]) {
  return [...rows].sort((a, b) => a.category.localeCompare(b.category));
}

describe('GET /reports/category-summary — validation', () => {
  it('rejects a missing accountId', async () => {
    const res = await request.get(SUMMARY).query({
      startDate: '2026-08-01',
      endDate: '2026-08-31',
    });
    expect(res.status).toBe(400);
  });

  it('rejects a malformed date', async () => {
    const res = await request.get(SUMMARY).query({
      accountId,
      startDate: '08/01/2026',
      endDate: '2026-08-31',
    });
    expect(res.status).toBe(400);
  });

  it('rejects an accountId that is not a uuid', async () => {
    const res = await request.get(SUMMARY).query({
      accountId: 'not-a-uuid',
      startDate: '2026-08-01',
      endDate: '2026-08-31',
    });
    expect(res.status).toBe(400);
  });
});

describe('GET /reports/category-summary — totals', () => {
  it('sums each category to an exact decimal string', async () => {
    await seedTransactions(accountId, [
      { date: '2026-08-02', description: 'Paycheck', amount: '2400.00', category: 'Income' },
      { date: '2026-08-16', description: 'Paycheck', amount: '2437.32', category: 'Income' },
      { date: '2026-08-03', description: 'Rent', amount: '-1850.00', category: 'Housing' },
      { date: '2026-08-09', description: 'Whole Foods', amount: '-84.21', category: 'Groceries' },
      { date: '2026-08-14', description: 'Trader Joes', amount: '-61.07', category: 'Groceries' },
    ]);

    const res = await request.get(SUMMARY).query({
      accountId,
      startDate: '2026-08-01',
      endDate: '2026-08-31',
    });

    expect(res.status).toBe(200);
    expect(byCategory(res.body.data.income)).toEqual([
      { category: 'Income', total: '4837.32' },
    ]);
    expect(byCategory(res.body.data.expenses)).toEqual([
      { category: 'Groceries', total: '-145.28' },
      { category: 'Housing', total: '-1850.00' },
    ]);
  });

  it('keeps cents that a float would round away', async () => {
    // 0.1 + 0.2 is 0.30000000000000004 in binary floating point.
    await seedTransactions(accountId, [
      { date: '2026-08-02', description: 'a', amount: '-0.10', category: 'Dining' },
      { date: '2026-08-03', description: 'b', amount: '-0.20', category: 'Dining' },
    ]);

    const res = await request.get(SUMMARY).query({
      accountId,
      startDate: '2026-08-01',
      endDate: '2026-08-31',
    });

    expect(res.body.data.expenses).toEqual([{ category: 'Dining', total: '-0.30' }]);
  });

  it('excludes transfers from both income and expenses', async () => {
    await seedTransactions(accountId, [
      { date: '2026-08-02', description: 'Paycheck', amount: '2400.00', category: 'Income' },
      { date: '2026-08-04', description: 'To savings', amount: '-500.00', category: 'Transfers' },
      { date: '2026-08-05', description: 'From savings', amount: '200.00', category: 'Transfers' },
    ]);

    const res = await request.get(SUMMARY).query({
      accountId,
      startDate: '2026-08-01',
      endDate: '2026-08-31',
    });

    expect(res.body.data.income).toEqual([{ category: 'Income', total: '2400.00' }]);
    expect(res.body.data.expenses).toEqual([]);
    expect(res.body.data.transfers).toEqual([{ category: 'Transfers', total: '-300.00' }]);
  });

  it('reports an uncategorized transaction as Other', async () => {
    await seedTransactions(accountId, [
      { date: '2026-08-02', description: 'Unknown', amount: '-12.00', category: null },
    ]);

    const res = await request.get(SUMMARY).query({
      accountId,
      startDate: '2026-08-01',
      endDate: '2026-08-31',
    });

    expect(res.body.data.expenses).toEqual([{ category: 'Other', total: '-12.00' }]);
  });

  it('drops a category that nets to exactly zero', async () => {
    await seedTransactions(accountId, [
      { date: '2026-08-02', description: 'Charge', amount: '-50.00', category: 'Shopping' },
      { date: '2026-08-06', description: 'Refund', amount: '50.00', category: 'Shopping' },
    ]);

    const res = await request.get(SUMMARY).query({
      accountId,
      startDate: '2026-08-01',
      endDate: '2026-08-31',
    });

    expect(res.body.data.income).toEqual([]);
    expect(res.body.data.expenses).toEqual([]);
  });
});

describe('GET /reports/category-summary — range', () => {
  beforeEach(async () => {
    await seedTransactions(accountId, [
      { date: '2026-07-31', description: 'Before', amount: '-10.00', category: 'Dining' },
      { date: '2026-08-01', description: 'First day', amount: '-20.00', category: 'Dining' },
      { date: '2026-08-31', description: 'Last day', amount: '-40.00', category: 'Dining' },
      { date: '2026-09-01', description: 'After', amount: '-80.00', category: 'Dining' },
    ]);
  });

  it('includes both endpoints and excludes everything outside', async () => {
    const res = await request.get(SUMMARY).query({
      accountId,
      startDate: '2026-08-01',
      endDate: '2026-08-31',
    });

    expect(res.body.data.expenses).toEqual([{ category: 'Dining', total: '-60.00' }]);
  });

  it('returns empty sides for a range with no transactions', async () => {
    const res = await request.get(SUMMARY).query({
      accountId,
      startDate: '2026-10-01',
      endDate: '2026-10-31',
    });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ income: [], expenses: [], transfers: [] });
  });

  it('returns empty sides for an account that does not exist', async () => {
    const res = await request.get(SUMMARY).query({
      accountId: ABSENT_UUID,
      startDate: '2026-08-01',
      endDate: '2026-08-31',
    });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ income: [], expenses: [], transfers: [] });
  });

  it('counts only the account asked for', async () => {
    const other = await seedAccount({ name: 'Savings' });
    await seedTransactions(other.id, [
      { date: '2026-08-10', description: 'Other account', amount: '-999.00', category: 'Dining' },
    ]);

    const res = await request.get(SUMMARY).query({
      accountId,
      startDate: '2026-08-01',
      endDate: '2026-08-31',
    });

    expect(res.body.data.expenses).toEqual([{ category: 'Dining', total: '-60.00' }]);
  });
});

describe('GET /reports/category-trend', () => {
  it('returns one bucket per month, newest first', async () => {
    const res = await request.get(TREND).query({ accountId, asOf: '2026-08-15', months: 3 });

    expect(res.status).toBe(200);
    expect(res.body.data.months.map((m: { month: string }) => m.month)).toEqual([
      '2026-08',
      '2026-07',
      '2026-06',
    ]);
  });

  it('ends each bucket on the same day-of-month, so spans compare like for like', async () => {
    const res = await request.get(TREND).query({ accountId, asOf: '2026-08-15', months: 2 });

    expect(res.body.data.months[0]).toMatchObject({
      startDate: '2026-08-01',
      endDate: '2026-08-15',
    });
    expect(res.body.data.months[1]).toMatchObject({
      startDate: '2026-07-01',
      endDate: '2026-07-15',
    });
  });

  it('totals only the days inside each bucket', async () => {
    await seedTransactions(accountId, [
      { date: '2026-08-10', description: 'In August span', amount: '-100.00', category: 'Dining' },
      { date: '2026-08-20', description: 'After the 15th', amount: '-500.00', category: 'Dining' },
      { date: '2026-07-14', description: 'In July span', amount: '-70.00', category: 'Dining' },
      { date: '2026-07-16', description: 'After the 15th', amount: '-900.00', category: 'Dining' },
    ]);

    const res = await request.get(TREND).query({ accountId, asOf: '2026-08-15', months: 2 });

    expect(res.body.data.months[0].expenses).toEqual([
      { category: 'Dining', total: '-100.00' },
    ]);
    expect(res.body.data.months[1].expenses).toEqual([
      { category: 'Dining', total: '-70.00' },
    ]);
  });

  it('clamps the end day to a short month', async () => {
    const res = await request.get(TREND).query({ accountId, asOf: '2026-03-31', months: 2 });

    expect(res.body.data.months[1]).toMatchObject({
      month: '2026-02',
      endDate: '2026-02-28',
    });
  });

  it('rejects a months value outside the allowed range', async () => {
    const res = await request.get(TREND).query({ accountId, asOf: '2026-08-15', months: 99 });
    expect(res.status).toBe(400);
  });

  it('rejects a malformed asOf', async () => {
    const res = await request.get(TREND).query({ accountId, asOf: 'August', months: 3 });
    expect(res.status).toBe(400);
  });
});
