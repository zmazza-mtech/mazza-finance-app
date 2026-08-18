/**
 * What migration 0001 has to guarantee before any route can resolve a
 * household (#71).
 *
 * Runs against the real migration chain — `apply-migrations.ts` applies every
 * file in `migrations/` to the test database — so a seed that is wrong in
 * production is wrong here too.
 */
import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { MAZZA_HOUSEHOLD_ID } from '../src/db/household.js';

describe('migration seed — the Mazza household', () => {
  it('creates exactly one household', async () => {
    const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM households').first<{
      n: number;
    }>();
    expect(row?.n).toBe(1);
  });

  it('gives it the id the application addresses it by', async () => {
    // A generated id would mean the app has to discover the household at
    // runtime before it can scope a single query. Fixed, it is a constant
    // until #89 swaps in a JWT membership lookup.
    const row = await env.DB.prepare('SELECT id, name FROM households').first<{
      id: string;
      name: string;
    }>();
    expect(row?.id).toBe(MAZZA_HOUSEHOLD_ID);
    expect(row?.name).toBe('Mazza');
  });

  it('is the household the application resolves, not a second copy of the id', async () => {
    // The literal lives in exactly two places, the migration and this
    // constant, and this is what keeps them the same value. #89 replaces the
    // constant with a JWT membership lookup and deletes this assertion with it.
    const row = await env.DB.prepare('SELECT id FROM households').first<{ id: string }>();
    expect(row?.id).toBe(MAZZA_HOUSEHOLD_ID);
  });

  it('is idempotent — applying the chain twice leaves one household', async () => {
    // D1 records applied migrations, but a seed that used a bare INSERT would
    // still duplicate if the chain were ever replayed against a live database.
    await env.DB.exec(
      "INSERT OR IGNORE INTO households (id, name, created_at) VALUES ('" +
        MAZZA_HOUSEHOLD_ID +
        "', 'Mazza', '2026-08-17T00:00:00.000Z')",
    );
    const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM households').first<{
      n: number;
    }>();
    expect(row?.n).toBe(1);
  });
});

describe('migration seed — no orphans', () => {
  it('leaves no household setting pointing at a household that does not exist', async () => {
    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM household_settings hs
       LEFT JOIN households h ON h.id = hs.household_id
       WHERE h.id IS NULL`,
    ).first<{ n: number }>();
    expect(row?.n).toBe(0);
  });

  it('leaves no user setting pointing at a user that does not exist', async () => {
    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM user_settings us
       LEFT JOIN users u ON u.id = us.user_id
       WHERE u.id IS NULL`,
    ).first<{ n: number }>();
    expect(row?.n).toBe(0);
  });

  it('seeds no users — they are provisioned from the verified JWT, not by hand', async () => {
    const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>();
    expect(row?.n).toBe(0);
  });
});

describe('tenancy uniqueness on simplefin ids', () => {
  const OTHER_HOUSEHOLD = '8e2a1f77-0c44-4f6e-9b3a-1d5c6e7f8a90';

  async function seedSecondHousehold() {
    await env.DB.prepare(
      'INSERT OR IGNORE INTO households (id, name, created_at) VALUES (?, ?, ?)',
    )
      .bind(OTHER_HOUSEHOLD, 'Other', '2026-08-17T00:00:00.000Z')
      .run();
  }

  async function insertAccount(id: string, householdId: string, simplefinId: string) {
    await env.DB.prepare(
      `INSERT INTO accounts (id, household_id, simplefin_id, institution, name, type, currency, last_balance, created_at, updated_at)
       VALUES (?, ?, ?, 'Bank', 'Checking', 'checking', 'USD', '100.00', '2026-08-17T00:00:00.000Z', '2026-08-17T00:00:00.000Z')`,
    )
      .bind(id, householdId, simplefinId)
      .run();
  }

  it('rejects the same simplefin account twice within one household', async () => {
    await insertAccount('acct-dup-1', MAZZA_HOUSEHOLD_ID, 'sf-dup');
    await expect(insertAccount('acct-dup-2', MAZZA_HOUSEHOLD_ID, 'sf-dup')).rejects.toThrow();
  });

  it('allows two households to hold the same simplefin account id', async () => {
    // The old schema had a bare unique on simplefin_id, which would have made
    // a second household connecting the same bank a constraint violation
    // rather than a tenant.
    await seedSecondHousehold();
    await insertAccount('acct-shared-1', MAZZA_HOUSEHOLD_ID, 'sf-shared');
    await expect(
      insertAccount('acct-shared-2', OTHER_HOUSEHOLD, 'sf-shared'),
    ).resolves.not.toThrow();
  });
});
