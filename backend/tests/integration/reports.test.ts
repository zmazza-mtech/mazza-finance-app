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
const UNCATEGORIZED = '/api/v1/reports/uncategorized';
const MONTHLY = '/api/v1/reports/monthly';

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

/**
 * The uncategorized review surface. A row needs review when nothing useful has
 * been decided about it and nobody decided it: `category` null or `Other`, with
 * `categorySource` still 'auto'. A user who deliberately chose `Other`, or
 * deliberately cleared the category, has made a decision — putting it back in
 * the review queue would nag them about a choice they already made.
 */
describe('GET /reports/uncategorized', () => {
  it('collapses descriptions that differ only in a stripped prefix', async () => {
    await seedTransactions(accountId, [
      { date: '2026-08-01', description: 'DBT CRD 0407 27105864 TSTDRIP KITCHEN', amount: '-12.00' },
      { date: '2026-08-02', description: 'DBT CRD 0937 88104412 TSTDRIP KITCHEN', amount: '-18.00' },
    ]);

    const res = await request.get(UNCATEGORIZED);

    expect(res.status).toBe(200);
    expect(res.body.data.groups).toHaveLength(1);
    expect(res.body.data.groups[0].count).toBe(2);
    expect(res.body.data.groups[0].total).toBe('-30.00');
  });

  it('includes a row auto-assigned to Other', async () => {
    await seedTransactions(accountId, [
      { date: '2026-08-01', description: 'MYSTERY CO', amount: '-40.00', category: 'Other' },
    ]);

    const res = await request.get(UNCATEGORIZED);

    expect(res.body.data.groups).toHaveLength(1);
  });

  it('leaves out a row the user deliberately filed under Other', async () => {
    await seedTransactions(accountId, [
      {
        date: '2026-08-01',
        description: 'MYSTERY CO',
        amount: '-40.00',
        category: 'Other',
        categorySource: 'user',
      },
    ]);

    const res = await request.get(UNCATEGORIZED);

    expect(res.body.data.groups).toEqual([]);
  });

  it('leaves out a row whose category the user deliberately cleared', async () => {
    await seedTransactions(accountId, [
      {
        date: '2026-08-01',
        description: 'MYSTERY CO',
        amount: '-40.00',
        category: null,
        categorySource: 'user',
      },
    ]);

    const res = await request.get(UNCATEGORIZED);

    expect(res.body.data.groups).toEqual([]);
  });

  it('leaves out a row that already has a real category', async () => {
    await seedTransactions(accountId, [
      { date: '2026-08-01', description: 'KROGER 123', amount: '-40.00', category: 'Groceries' },
    ]);

    const res = await request.get(UNCATEGORIZED);

    expect(res.body.data.groups).toEqual([]);
  });

  it('reports the money sitting uncategorized as an exact decimal string', async () => {
    await seedTransactions(accountId, [
      { date: '2026-08-01', description: 'ONE CO', amount: '-0.10' },
      { date: '2026-08-02', description: 'TWO CO', amount: '-0.20' },
    ]);

    const res = await request.get(UNCATEGORIZED);

    expect(res.body.data.total).toBe('-0.30');
  });

  it('returns nothing to review when everything is categorized', async () => {
    await seedTransactions(accountId, [
      { date: '2026-08-01', description: 'KROGER 123', amount: '-40.00', category: 'Groceries' },
    ]);

    const res = await request.get(UNCATEGORIZED);

    expect(res.body.data).toEqual({ total: '0.00', groups: [] });
  });

  it('counts every account, because bulk assignment is not scoped to one', async () => {
    const otherAccount = (await seedAccount({ name: 'Savings' })).id;
    await seedTransactions(accountId, [
      { date: '2026-08-01', description: 'PEPO SHOP', amount: '-10.00' },
    ]);
    await seedTransactions(otherAccount, [
      { date: '2026-08-02', description: 'PEPO SHOP', amount: '-20.00' },
    ]);

    const res = await request.get(UNCATEGORIZED);

    expect(res.body.data.groups).toHaveLength(1);
    expect(res.body.data.groups[0].count).toBe(2);
  });

  it('reports a group under a description that batch-categorize then matches', async () => {
    await seedTransactions(accountId, [
      { date: '2026-08-01', description: 'DBT CRD 0407 27105864 TSTDRIP KITCHEN', amount: '-12.00' },
      { date: '2026-08-02', description: 'DBT CRD 0937 88104412 TSTDRIP KITCHEN', amount: '-18.00' },
    ]);

    const review = await request.get(UNCATEGORIZED);
    const assign = await request
      .post('/api/v1/transactions/batch-categorize')
      .send({ description: review.body.data.groups[0].description, category: 'Dining' });

    expect(assign.body.data.updated).toBe(2);
  });

  it('drops a group once its transactions are assigned', async () => {
    await seedTransactions(accountId, [
      { date: '2026-08-01', description: 'TSTDRIP KITCHEN', amount: '-12.00' },
    ]);

    await request
      .post('/api/v1/transactions/batch-categorize')
      .send({ description: 'TSTDRIP KITCHEN', category: 'Dining' });
    const res = await request.get(UNCATEGORIZED);

    expect(res.body.data.groups).toEqual([]);
  });
});

/**
 * The monthly summary. Buckets are whole calendar months, every month in the
 * requested range appears whether or not it holds anything, and each category
 * carries its movement against the month immediately before.
 */
describe('GET /reports/monthly — validation', () => {
  it('rejects a missing accountId', async () => {
    const res = await request.get(MONTHLY).query({ startMonth: '2026-07', endMonth: '2026-08' });
    expect(res.status).toBe(400);
  });

  it('rejects a month that carries a day', async () => {
    const res = await request.get(MONTHLY).query({
      accountId,
      startMonth: '2026-07-01',
      endMonth: '2026-08',
    });
    expect(res.status).toBe(400);
  });

  it('rejects an end month that precedes the start', async () => {
    const res = await request.get(MONTHLY).query({
      accountId,
      startMonth: '2026-08',
      endMonth: '2026-07',
    });
    expect(res.status).toBe(400);
  });

  it('rejects a range longer than two years, which nothing asks for', async () => {
    const res = await request.get(MONTHLY).query({
      accountId,
      startMonth: '2020-01',
      endMonth: '2026-08',
    });
    expect(res.status).toBe(400);
  });
});

describe('GET /reports/monthly', () => {
  it('returns a bucket for every month in the range', async () => {
    const res = await request.get(MONTHLY).query({
      accountId,
      startMonth: '2026-06',
      endMonth: '2026-08',
    });

    expect(res.status).toBe(200);
    expect(res.body.data.months.map((m: { month: string }) => m.month)).toEqual([
      '2026-06',
      '2026-07',
      '2026-08',
    ]);
  });

  it('keeps a month with no transactions rather than omitting it', async () => {
    await seedTransactions(accountId, [
      { date: '2026-06-10', description: 'Kroger', amount: '-100.00', category: 'Groceries' },
      { date: '2026-08-10', description: 'Kroger', amount: '-100.00', category: 'Groceries' },
    ]);

    const res = await request.get(MONTHLY).query({
      accountId,
      startMonth: '2026-06',
      endMonth: '2026-08',
    });

    expect(res.body.data.months[1]).toMatchObject({ month: '2026-07', categories: [] });
  });

  it('buckets a transaction into the month it falls in', async () => {
    await seedTransactions(accountId, [
      { date: '2026-07-31', description: 'Kroger', amount: '-100.00', category: 'Groceries' },
      { date: '2026-08-01', description: 'Kroger', amount: '-200.00', category: 'Groceries' },
    ]);

    const res = await request.get(MONTHLY).query({
      accountId,
      startMonth: '2026-07',
      endMonth: '2026-08',
    });

    expect(res.body.data.months[0].categories[0].total).toBe('-100.00');
    expect(res.body.data.months[1].categories[0].total).toBe('-200.00');
  });

  it('leaves the earliest month in the range without a change figure', async () => {
    await seedTransactions(accountId, [
      { date: '2026-07-10', description: 'Kroger', amount: '-100.00', category: 'Groceries' },
    ]);

    const res = await request.get(MONTHLY).query({
      accountId,
      startMonth: '2026-07',
      endMonth: '2026-08',
    });

    expect(res.body.data.months[0].categories[0].change).toBeNull();
    expect(res.body.data.months[0].categories[0].changePercent).toBeNull();
  });

  it('states each category’s movement against the prior month', async () => {
    await seedTransactions(accountId, [
      { date: '2026-07-10', description: 'Kroger', amount: '-100.00', category: 'Groceries' },
      { date: '2026-08-10', description: 'Kroger', amount: '-117.70', category: 'Groceries' },
    ]);

    const res = await request.get(MONTHLY).query({
      accountId,
      startMonth: '2026-07',
      endMonth: '2026-08',
    });

    expect(res.body.data.months[1].categories[0]).toMatchObject({
      change: '17.70',
      changePercent: '17.7',
    });
  });

  it('sums income and expenses for the month as decimal strings', async () => {
    await seedTransactions(accountId, [
      { date: '2026-08-01', description: 'Payroll', amount: '2400.00', category: 'Income' },
      { date: '2026-08-10', description: 'Kroger', amount: '-100.00', category: 'Groceries' },
      { date: '2026-08-11', description: 'Rent', amount: '-1250.00', category: 'Housing' },
    ]);

    const res = await request.get(MONTHLY).query({
      accountId,
      startMonth: '2026-08',
      endMonth: '2026-08',
    });

    expect(res.body.data.months[0]).toMatchObject({
      income: '2400.00',
      expenses: '-1350.00',
      net: '1050.00',
    });
  });

  it('excludes transfers from the income and expense totals', async () => {
    await seedTransactions(accountId, [
      { date: '2026-08-01', description: 'Payroll', amount: '2400.00', category: 'Income' },
      { date: '2026-08-02', description: 'To savings', amount: '-500.00', category: 'Transfers' },
      { date: '2026-08-03', description: 'From savings', amount: '500.00', category: 'Transfers' },
    ]);

    const res = await request.get(MONTHLY).query({
      accountId,
      startMonth: '2026-08',
      endMonth: '2026-08',
    });

    expect(res.body.data.months[0]).toMatchObject({
      income: '2400.00',
      expenses: '0.00',
      net: '2400.00',
    });
  });

  it('leaves transfers out of the category rows too', async () => {
    await seedTransactions(accountId, [
      { date: '2026-08-02', description: 'To savings', amount: '-500.00', category: 'Transfers' },
    ]);

    const res = await request.get(MONTHLY).query({
      accountId,
      startMonth: '2026-08',
      endMonth: '2026-08',
    });

    expect(res.body.data.months[0].categories).toEqual([]);
  });

  it('covers a partial month to its end, so today’s data is included', async () => {
    await seedTransactions(accountId, [
      { date: '2026-08-31', description: 'Kroger', amount: '-100.00', category: 'Groceries' },
    ]);

    const res = await request.get(MONTHLY).query({
      accountId,
      startMonth: '2026-08',
      endMonth: '2026-08',
    });

    expect(res.body.data.months[0].categories[0].total).toBe('-100.00');
  });

  it('counts only the requested account', async () => {
    const otherAccount = (await seedAccount({ name: 'Savings' })).id;
    await seedTransactions(otherAccount, [
      { date: '2026-08-10', description: 'Kroger', amount: '-100.00', category: 'Groceries' },
    ]);

    const res = await request.get(MONTHLY).query({
      accountId,
      startMonth: '2026-08',
      endMonth: '2026-08',
    });

    expect(res.body.data.months[0].categories).toEqual([]);
  });

  it('files an uncategorized transaction under Other', async () => {
    await seedTransactions(accountId, [
      { date: '2026-08-10', description: 'Mystery', amount: '-40.00', category: null },
    ]);

    const res = await request.get(MONTHLY).query({
      accountId,
      startMonth: '2026-08',
      endMonth: '2026-08',
    });

    expect(res.body.data.months[0].categories[0].category).toBe('Other');
  });
});
