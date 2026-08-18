/**
 * The sync guard (#70).
 *
 * SimpleFIN allows 24 polls per day and **exceeding it permanently disables
 * the token**. That is not a rate limit to be retried past; it is a cliff. So
 * the guard is a unit with its own tests against real D1, rather than a
 * condition buried in the sync job where it can only be exercised by actually
 * calling SimpleFIN — which would spend the very budget it protects.
 *
 * Nothing here mocks anything. The lock, the staleness timeout and the budget
 * are decided entirely by rows in `sync_log`, so they can be driven honestly.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { getDb } from '../src/db/client.js';
import { MAZZA_HOUSEHOLD_ID } from '../src/db/household.js';
import { acquireSyncLock, releaseSyncLock, STALE_LOCK_MS, DAILY_SYNC_LIMIT } from '../src/services/sync-guard.js';

const OTHER_HOUSEHOLD = '8e2a1f77-0c44-4f6e-9b3a-1d5c6e7f8a90';
const NOW = '2026-08-17T12:00:00.000Z';

function at(iso: string, offsetMs: number): string {
  return new Date(Date.parse(iso) + offsetMs).toISOString();
}

async function seedHousehold(id: string) {
  await env.DB.prepare('INSERT OR IGNORE INTO households (id, name, created_at) VALUES (?, ?, ?)')
    .bind(id, 'H', '2026-08-17T00:00:00.000Z')
    .run();
}

let seq = 0;
async function seedSyncRow(householdId: string, startedAt: string, status: string) {
  seq += 1;
  await env.DB.prepare(
    `INSERT INTO sync_log (id, household_id, started_at, completed_at, status, accounts_synced, transactions_fetched, transactions_reconciled, error_code, created_at)
     VALUES (?, ?, ?, NULL, ?, 0, 0, 0, NULL, ?)`,
  )
    .bind(`s${seq}`, householdId, startedAt, status, startedAt)
    .run();
}

beforeEach(async () => {
  await env.DB.exec('DELETE FROM sync_log');
  await seedHousehold(MAZZA_HOUSEHOLD_ID);
  await seedHousehold(OTHER_HOUSEHOLD);
});

describe('the lock', () => {
  it('grants the first request', async () => {
    const result = await acquireSyncLock(getDb(env.DB), MAZZA_HOUSEHOLD_ID, NOW);
    expect(result.acquired).toBe(true);
  });

  it('grants exactly one of two concurrent requests', async () => {
    // The condition the whole guard exists for. Two acquisitions raced
    // against the same database; exactly one may proceed to SimpleFIN.
    const db = getDb(env.DB);
    const results = await Promise.all([
      acquireSyncLock(db, MAZZA_HOUSEHOLD_ID, NOW),
      acquireSyncLock(db, MAZZA_HOUSEHOLD_ID, NOW),
    ]);

    expect(results.filter((r) => r.acquired)).toHaveLength(1);
    expect(results.filter((r) => !r.acquired)).toHaveLength(1);
  });

  it('leaves exactly one running row behind when two race', async () => {
    const db = getDb(env.DB);
    await Promise.all([
      acquireSyncLock(db, MAZZA_HOUSEHOLD_ID, NOW),
      acquireSyncLock(db, MAZZA_HOUSEHOLD_ID, NOW),
    ]);

    const row = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM sync_log WHERE status = 'running'",
    ).first<{ n: number }>();
    expect(row?.n).toBe(1);
  });

  it('refuses while another sync is running, with a reason', async () => {
    await seedSyncRow(MAZZA_HOUSEHOLD_ID, at(NOW, -60_000), 'running');

    const result = await acquireSyncLock(getDb(env.DB), MAZZA_HOUSEHOLD_ID, NOW);
    expect(result).toMatchObject({ acquired: false, reason: 'running' });
  });

  it('does not block on another household running sync', async () => {
    // The budget and the lock are both per household. One household syncing
    // must not stop another, or the first tenant to arrive owns the app.
    await seedSyncRow(OTHER_HOUSEHOLD, at(NOW, -60_000), 'running');

    const result = await acquireSyncLock(getDb(env.DB), MAZZA_HOUSEHOLD_ID, NOW);
    expect(result.acquired).toBe(true);
  });

  it('releases so the next request can proceed', async () => {
    const db = getDb(env.DB);
    const first = await acquireSyncLock(db, MAZZA_HOUSEHOLD_ID, NOW);
    await releaseSyncLock(db, first.lockId!, 'success', at(NOW, 5_000));

    const second = await acquireSyncLock(db, MAZZA_HOUSEHOLD_ID, at(NOW, 6_000));
    expect(second.acquired).toBe(true);
  });
});

describe('the staleness timeout', () => {
  it('honours a running row inside the timeout', async () => {
    await seedSyncRow(MAZZA_HOUSEHOLD_ID, at(NOW, -(STALE_LOCK_MS - 1_000)), 'running');

    const result = await acquireSyncLock(getDb(env.DB), MAZZA_HOUSEHOLD_ID, NOW);
    expect(result.acquired).toBe(false);
  });

  it('reclaims a running row past the timeout', async () => {
    // A Worker that died mid-sync leaves a running row with nothing behind
    // it. Without this the household can never sync again.
    await seedSyncRow(MAZZA_HOUSEHOLD_ID, at(NOW, -(STALE_LOCK_MS + 1_000)), 'running');

    const result = await acquireSyncLock(getDb(env.DB), MAZZA_HOUSEHOLD_ID, NOW);
    expect(result.acquired).toBe(true);
  });

  it('marks the abandoned row failed rather than leaving it running forever', async () => {
    await seedSyncRow(MAZZA_HOUSEHOLD_ID, at(NOW, -(STALE_LOCK_MS + 1_000)), 'running');
    await acquireSyncLock(getDb(env.DB), MAZZA_HOUSEHOLD_ID, NOW);

    // Looked up by shape rather than by a hardcoded id: the seed counter is
    // shared across this file, so the id is not stable per test.
    const row = await env.DB.prepare(
      "SELECT status, error_code FROM sync_log WHERE started_at < ? ORDER BY started_at LIMIT 1",
    )
      .bind(NOW)
      .first<{ status: string; error_code: string | null }>();
    expect(row?.status).toBe('failed');
    // Fixed vocabulary, never raw API text.
    expect(row?.error_code).toBe('abandoned');
  });

  it('counts a reclaimed abandoned sync against the budget', async () => {
    // It was a poll. SimpleFIN counted it whether or not we recorded a
    // result, so pretending otherwise is how the token gets disabled.
    await seedSyncRow(MAZZA_HOUSEHOLD_ID, at(NOW, -(STALE_LOCK_MS + 1_000)), 'running');
    const result = await acquireSyncLock(getDb(env.DB), MAZZA_HOUSEHOLD_ID, NOW);
    expect(result.usedToday).toBe(2);
  });
});

describe('the 24/day budget', () => {
  async function fill(n: number, householdId = MAZZA_HOUSEHOLD_ID) {
    for (let i = 0; i < n; i++) {
      await seedSyncRow(householdId, at(NOW, -(i + 1) * 60_000), 'success');
    }
  }

  it('allows the 24th poll of the day', async () => {
    await fill(DAILY_SYNC_LIMIT - 1);
    const result = await acquireSyncLock(getDb(env.DB), MAZZA_HOUSEHOLD_ID, NOW);
    expect(result.acquired).toBe(true);
  });

  it('refuses the 25th, with a reason and no row written', async () => {
    await fill(DAILY_SYNC_LIMIT);

    const result = await acquireSyncLock(getDb(env.DB), MAZZA_HOUSEHOLD_ID, NOW);
    expect(result).toMatchObject({ acquired: false, reason: 'budget' });

    const row = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM sync_log WHERE status = 'running'",
    ).first<{ n: number }>();
    expect(row?.n).toBe(0);
  });

  it('counts a failed poll against the budget', async () => {
    // SimpleFIN counted it. A failure that did not count would let 24 retries
    // become 48 polls and disable the token permanently.
    for (let i = 0; i < DAILY_SYNC_LIMIT; i++) {
      await seedSyncRow(MAZZA_HOUSEHOLD_ID, at(NOW, -(i + 1) * 60_000), 'failed');
    }

    const result = await acquireSyncLock(getDb(env.DB), MAZZA_HOUSEHOLD_ID, NOW);
    expect(result.acquired).toBe(false);
    expect(result.reason).toBe('budget');
  });

  it('resets at midnight UTC, not on a rolling 24 hours', async () => {
    // Yesterday at 23:59 UTC is spent budget; the same clock hour today is not.
    for (let i = 0; i < DAILY_SYNC_LIMIT; i++) {
      await seedSyncRow(MAZZA_HOUSEHOLD_ID, `2026-08-16T23:5${i % 10}:00.000Z`, 'success');
    }

    const justAfterMidnight = '2026-08-17T00:00:01.000Z';
    const result = await acquireSyncLock(getDb(env.DB), MAZZA_HOUSEHOLD_ID, justAfterMidnight);
    expect(result.acquired).toBe(true);
  });

  it('budgets each household separately', async () => {
    await fill(DAILY_SYNC_LIMIT, OTHER_HOUSEHOLD);

    const result = await acquireSyncLock(getDb(env.DB), MAZZA_HOUSEHOLD_ID, NOW);
    expect(result.acquired).toBe(true);
    expect(result.usedToday).toBe(1);
  });

  it('reports what is left so the client can say so before spending it', async () => {
    await fill(10);
    const result = await acquireSyncLock(getDb(env.DB), MAZZA_HOUSEHOLD_ID, NOW);
    expect(result.usedToday).toBe(11);
    expect(result.limit).toBe(DAILY_SYNC_LIMIT);
  });
});
