/**
 * The sync job's persistence half (#68, #70).
 *
 * `applyAccountSet` takes an already-fetched `SimpleFINAccountSet` and does
 * every database thing a sync does. It is separated from the fetch on purpose:
 * a SimpleFIN call spends one of 24 daily polls and exceeding 24 permanently
 * disables the token, so the half that can be exercised freely is the half
 * worth exercising thoroughly.
 *
 * Nothing here is mocked. A `SimpleFINAccountSet` is a plain data structure —
 * building one is a fixture, not a stand-in for behaviour — and every
 * assertion is against real D1.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { getDb } from '../src/db/client.js';
import { MAZZA_HOUSEHOLD_ID } from '../src/db/household.js';
import { applyAccountSet } from '../src/jobs/sync.js';
import type { SimpleFINAccountSet } from '../src/lib/simplefin-client.js';

const OTHER_HOUSEHOLD = '8e2a1f77-0c44-4f6e-9b3a-1d5c6e7f8a90';
const NOW = '2026-08-17T12:00:00.000Z';

/** 2026-08-15 as unix seconds, the date most fixtures post on. */
const AUG_15 = Math.floor(Date.parse('2026-08-15T00:00:00Z') / 1000);

function accountSet(overrides: Partial<SimpleFINAccountSet> = {}): SimpleFINAccountSet {
  return {
    errors: [],
    accounts: [
      {
        org: { name: 'Test Bank', domain: 'testbank.com' },
        id: 'sf-acct-1',
        name: 'Primary Checking',
        currency: 'USD',
        balance: '1000.00',
        'balance-date': AUG_15,
        transactions: [
          {
            id: 'sf-tx-1',
            posted: AUG_15,
            amount: '-84.21',
            description: 'WHOLE FOODS MARKET',
          },
        ],
      },
    ],
    ...overrides,
  };
}

beforeEach(async () => {
  await env.DB.exec('DELETE FROM recurring_overrides');
  await env.DB.exec('DELETE FROM recurring_transactions');
  await env.DB.exec('DELETE FROM transactions');
  await env.DB.exec('DELETE FROM accounts');
  await env.DB.prepare('INSERT OR IGNORE INTO households (id, name, created_at) VALUES (?, ?, ?)')
    .bind(OTHER_HOUSEHOLD, 'Other', '2026-08-17T00:00:00.000Z')
    .run();
});

describe('accounts', () => {
  it('creates an account it has never seen, under the request household', async () => {
    await applyAccountSet(getDb(env.DB), MAZZA_HOUSEHOLD_ID, accountSet(), NOW);

    const row = await env.DB.prepare(
      'SELECT household_id, institution, name, type, currency FROM accounts WHERE simplefin_id = ?',
    )
      .bind('sf-acct-1')
      .first<Record<string, string>>();

    expect(row).toMatchObject({
      household_id: MAZZA_HOUSEHOLD_ID,
      institution: 'Test Bank',
      name: 'Primary Checking',
      type: 'checking',
      currency: 'USD',
    });
  });

  it('reuses the account on a second sync rather than creating a twin', async () => {
    const db = getDb(env.DB);
    await applyAccountSet(db, MAZZA_HOUSEHOLD_ID, accountSet(), NOW);
    await applyAccountSet(db, MAZZA_HOUSEHOLD_ID, accountSet(), NOW);

    const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM accounts').first<{ n: number }>();
    expect(row?.n).toBe(1);
  });

  it('creates its own account when another household already holds the same simplefin id', async () => {
    // Two households can bank at the same institution. The unique is on
    // (household_id, simplefin_id) precisely so this is not a collision.
    const db = getDb(env.DB);
    await applyAccountSet(db, OTHER_HOUSEHOLD, accountSet(), NOW);
    await applyAccountSet(db, MAZZA_HOUSEHOLD_ID, accountSet(), NOW);

    const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM accounts').first<{ n: number }>();
    expect(row?.n).toBe(2);
  });

  it('records the balance and when it was seen', async () => {
    await applyAccountSet(getDb(env.DB), MAZZA_HOUSEHOLD_ID, accountSet(), NOW);

    const row = await env.DB.prepare(
      'SELECT last_balance, last_synced_at FROM accounts WHERE simplefin_id = ?',
    )
      .bind('sf-acct-1')
      .first<{ last_balance: string; last_synced_at: string }>();

    expect(row?.last_balance).toBe('1000.00');
    expect(row?.last_synced_at).toBe(NOW);
  });

  it('prefers the available balance over the ledger balance', async () => {
    const set = accountSet();
    set.accounts[0]!['available-balance'] = '900.00';

    await applyAccountSet(getDb(env.DB), MAZZA_HOUSEHOLD_ID, set, NOW);

    const row = await env.DB.prepare(
      'SELECT last_balance FROM accounts WHERE simplefin_id = ?',
    ).bind('sf-acct-1').first<{ last_balance: string }>();
    // Available is what is actually spendable; the ledger balance can include
    // a deposit that has not cleared.
    expect(row?.last_balance).toBe('900.00');
  });

  it('maps the account type from its name', async () => {
    const set = accountSet();
    set.accounts[0]!.name = 'High Yield Savings';

    await applyAccountSet(getDb(env.DB), MAZZA_HOUSEHOLD_ID, set, NOW);

    const row = await env.DB.prepare('SELECT type FROM accounts').first<{ type: string }>();
    expect(row?.type).toBe('savings');
  });
});

describe('transactions', () => {
  it('inserts a new transaction, categorized, as an actual', async () => {
    await applyAccountSet(getDb(env.DB), MAZZA_HOUSEHOLD_ID, accountSet(), NOW);

    const row = await env.DB.prepare(
      'SELECT household_id, date, amount, type, status, category FROM transactions WHERE simplefin_id = ?',
    )
      .bind('sf-tx-1')
      .first<Record<string, string>>();

    expect(row).toMatchObject({
      household_id: MAZZA_HOUSEHOLD_ID,
      date: '2026-08-15',
      amount: '-84.21',
      type: 'actual',
      status: 'posted',
      category: 'Groceries',
    });
  });

  it('does not insert the same transaction twice across syncs', async () => {
    const db = getDb(env.DB);
    await applyAccountSet(db, MAZZA_HOUSEHOLD_ID, accountSet(), NOW);
    await applyAccountSet(db, MAZZA_HOUSEHOLD_ID, accountSet(), NOW);

    const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM transactions').first<{ n: number }>();
    expect(row?.n).toBe(1);
  });

  it('marks a pending charge pending, then posted when it clears', async () => {
    const db = getDb(env.DB);

    const pending = accountSet();
    pending.accounts[0]!.transactions![0]!.pending = true;
    await applyAccountSet(db, MAZZA_HOUSEHOLD_ID, pending, NOW);

    let row = await env.DB.prepare('SELECT status FROM transactions').first<{ status: string }>();
    expect(row?.status).toBe('pending');

    await applyAccountSet(db, MAZZA_HOUSEHOLD_ID, accountSet(), NOW);

    row = await env.DB.prepare('SELECT status FROM transactions').first<{ status: string }>();
    expect(row?.status).toBe('posted');
  });

  it('inserts 100 transactions in one sync', async () => {
    // D1 takes 8 rows per INSERT before rejecting on bound parameters, so a
    // single bulk insert cannot do this. Chunked, it can.
    const set = accountSet();
    set.accounts[0]!.transactions = Array.from({ length: 100 }, (_, i) => ({
      id: `sf-bulk-${i}`,
      posted: AUG_15,
      amount: '-1.00',
      description: `Merchant ${i}`,
    }));

    await applyAccountSet(getDb(env.DB), MAZZA_HOUSEHOLD_ID, set, NOW);

    const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM transactions').first<{ n: number }>();
    expect(row?.n).toBe(100);
  });

  it('reports what it fetched and what it wrote', async () => {
    const result = await applyAccountSet(getDb(env.DB), MAZZA_HOUSEHOLD_ID, accountSet(), NOW);
    expect(result).toMatchObject({ accountsSynced: 1, transactionsFetched: 1, transactionsReconciled: 1 });
  });

  it('never touches another household transactions', async () => {
    const db = getDb(env.DB);
    await applyAccountSet(db, OTHER_HOUSEHOLD, accountSet(), NOW);
    await applyAccountSet(db, MAZZA_HOUSEHOLD_ID, accountSet(), NOW);

    const rows = await env.DB.prepare(
      'SELECT household_id, COUNT(*) AS n FROM transactions GROUP BY household_id',
    ).all<{ household_id: string; n: number }>();

    expect(rows.results).toHaveLength(2);
    expect(rows.results.every((r) => r.n === 1)).toBe(true);
  });
});

describe('the errors array', () => {
  it('is carried out rather than swallowed', async () => {
    // It holds rate-limit warnings and per-institution connection failures.
    // The user needs to see them; a sync that reports success while an
    // institution failed to connect is lying about the balance.
    const set = accountSet({ errors: ['Connection to Test Bank failed'] });

    const result = await applyAccountSet(getDb(env.DB), MAZZA_HOUSEHOLD_ID, set, NOW);
    expect(result.errors).toEqual(['Connection to Test Bank failed']);
  });

  it('is empty, not absent, when there is nothing wrong', async () => {
    const result = await applyAccountSet(getDb(env.DB), MAZZA_HOUSEHOLD_ID, accountSet(), NOW);
    expect(result.errors).toEqual([]);
  });
});

describe('recurring series advance on what was paid', () => {
  it('moves nextDate past an occurrence a synced actual covers', async () => {
    // #43: without this the staleness check reads a frozen nextDate and ends
    // series that are still being paid.
    const db = getDb(env.DB);
    await applyAccountSet(db, MAZZA_HOUSEHOLD_ID, accountSet(), NOW);

    const account = await env.DB.prepare('SELECT id FROM accounts').first<{ id: string }>();
    await env.DB.prepare(
      `INSERT INTO recurring_transactions (id, household_id, account_id, name, amount, frequency, next_date, end_date, source, status, category, created_at, updated_at)
       VALUES ('r-1', ?, ?, 'WHOLE FOODS MARKET', '-84.21', 'monthly', '2026-08-15', NULL, 'manual', 'active', NULL, '2026-08-17T00:00:00.000Z', '2026-08-17T00:00:00.000Z')`,
    )
      .bind(MAZZA_HOUSEHOLD_ID, account!.id)
      .run();

    await applyAccountSet(db, MAZZA_HOUSEHOLD_ID, accountSet(), NOW);

    const row = await env.DB.prepare(
      'SELECT next_date FROM recurring_transactions WHERE id = ?',
    ).bind('r-1').first<{ next_date: string }>();
    expect(row?.next_date).toBe('2026-09-15');
  });
});
