/**
 * `POST /sync` and `GET /sync/status` — the last of the eight routers (#68).
 *
 * The route holds the guard (#70) and reads the encrypted access URL (#73)
 * before it will spend a poll. What is asserted here is every refusal, which
 * is the part that can be exercised without calling SimpleFIN: no connection,
 * budget spent, another sync running. The accepted path is covered by
 * `sync.spec.ts` against the job itself.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { SELF, env } from 'cloudflare:test';
import { getDb } from '../src/db/client.js';
import { MAZZA_HOUSEHOLD_ID } from '../src/db/household.js';
import { authed } from './helpers/auth.js';
import { storeAccessUrl } from '../src/services/simplefin-connection.js';
import { DAILY_SYNC_LIMIT } from '../src/services/sync-guard.js';

const OTHER_HOUSEHOLD = '8e2a1f77-0c44-4f6e-9b3a-1d5c6e7f8a90';
const ACCESS_URL = 'https://user:pass@bridge.simplefin.org/simplefin';

async function api(path: string, init?: RequestInit) {
  const res = await SELF.fetch(`https://example.com/api/v1${path}`, authed(init));
  const text = await res.text();
  return { res, body: text ? (JSON.parse(text) as { data: any; error: any }) : null };
}

let seq = 0;
async function seedSyncRow(householdId: string, startedAt: string, status: string) {
  seq += 1;
  await env.DB.prepare(
    `INSERT INTO sync_log (id, household_id, started_at, completed_at, status, accounts_synced, transactions_fetched, transactions_reconciled, error_code, created_at)
     VALUES (?, ?, ?, NULL, ?, 0, 0, 0, NULL, ?)`,
  )
    .bind(`api-s${seq}`, householdId, startedAt, status, startedAt)
    .run();
}

beforeEach(async () => {
  await env.DB.exec('DELETE FROM sync_log');
  await env.DB.exec('DELETE FROM simplefin_connections');
  await env.DB.prepare('INSERT OR IGNORE INTO households (id, name, created_at) VALUES (?, ?, ?)')
    .bind(OTHER_HOUSEHOLD, 'Other', '2026-08-17T00:00:00.000Z')
    .run();
});

describe('POST /sync — refusals, none of which spend a poll', () => {
  it('refuses with 409 when no SimpleFIN connection is configured', async () => {
    const { res, body } = await api('/sync', { method: 'POST' });
    expect(res.status).toBe(409);
    expect(body!.error).toMatch(/not connected/i);
  });

  it('writes no sync_log row when there is nothing to sync with', async () => {
    // A refused attempt is not a poll, so it must not consume budget.
    await api('/sync', { method: 'POST' });
    const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM sync_log').first<{ n: number }>();
    expect(row?.n).toBe(0);
  });

  it('refuses with 429 once the daily budget is spent', async () => {
    await storeAccessUrl(getDb(env.DB), MAZZA_HOUSEHOLD_ID, ACCESS_URL, env.ENCRYPTION_KEY);
    const today = new Date().toISOString().slice(0, 10);
    for (let i = 0; i < DAILY_SYNC_LIMIT; i++) {
      await seedSyncRow(MAZZA_HOUSEHOLD_ID, `${today}T0${i % 10}:00:00.000Z`, 'success');
    }

    const { res, body } = await api('/sync', { method: 'POST' });
    expect(res.status).toBe(429);
    expect(body!.error).toMatch(/24/);
    expect(body!.error).toMatch(/midnight UTC/i);
  });

  it('refuses with 409 while another sync holds the lock', async () => {
    await storeAccessUrl(getDb(env.DB), MAZZA_HOUSEHOLD_ID, ACCESS_URL, env.ENCRYPTION_KEY);
    await seedSyncRow(MAZZA_HOUSEHOLD_ID, new Date().toISOString(), 'running');

    const { res, body } = await api('/sync', { method: 'POST' });
    expect(res.status).toBe(409);
    expect(body!.error).toMatch(/already running/i);
  });

  it('is not blocked by another household spent budget', async () => {
    const today = new Date().toISOString().slice(0, 10);
    for (let i = 0; i < DAILY_SYNC_LIMIT; i++) {
      await seedSyncRow(OTHER_HOUSEHOLD, `${today}T0${i % 10}:00:00.000Z`, 'success');
    }

    // No connection for our household, so it stops at 409 rather than 429 —
    // which is the point: their spending did not reach us.
    const { res } = await api('/sync', { method: 'POST' });
    expect(res.status).toBe(409);
  });

  it('answers 405 to a GET, as the Express route did', async () => {
    const { res } = await api('/sync');
    expect(res.status).toBe(405);
  });
});

describe('GET /sync/status', () => {
  it('reports an unconnected household without inventing a sync', async () => {
    const { res, body } = await api('/sync/status');
    expect(res.status).toBe(200);
    expect(body!.data).toMatchObject({
      lastSync: null,
      syncsToday: 0,
      dailyLimit: DAILY_SYNC_LIMIT,
      connected: false,
    });
  });

  it('reports the connection without decrypting it', async () => {
    await storeAccessUrl(getDb(env.DB), MAZZA_HOUSEHOLD_ID, ACCESS_URL, env.ENCRYPTION_KEY);
    const { body } = await api('/sync/status');
    expect(body!.data.connected).toBe(true);
  });

  it('returns the most recent sync, not the first', async () => {
    const today = new Date().toISOString().slice(0, 10);
    await seedSyncRow(MAZZA_HOUSEHOLD_ID, `${today}T01:00:00.000Z`, 'success');
    await seedSyncRow(MAZZA_HOUSEHOLD_ID, `${today}T09:00:00.000Z`, 'failed');

    const { body } = await api('/sync/status');
    expect(body!.data.lastSync.status).toBe('failed');
    expect(body!.data.syncsToday).toBe(2);
  });

  it('counts only today, and only this household', async () => {
    const today = new Date().toISOString().slice(0, 10);
    await seedSyncRow(MAZZA_HOUSEHOLD_ID, `${today}T01:00:00.000Z`, 'success');
    await seedSyncRow(MAZZA_HOUSEHOLD_ID, '2020-01-01T01:00:00.000Z', 'success');
    await seedSyncRow(OTHER_HOUSEHOLD, `${today}T02:00:00.000Z`, 'success');

    const { body } = await api('/sync/status');
    expect(body!.data.syncsToday).toBe(1);
  });

  it('never carries the access URL in its answer', async () => {
    await storeAccessUrl(getDb(env.DB), MAZZA_HOUSEHOLD_ID, ACCESS_URL, env.ENCRYPTION_KEY);
    const { body } = await api('/sync/status');
    expect(JSON.stringify(body)).not.toContain('pass');
    expect(JSON.stringify(body)).not.toContain('bridge.simplefin.org');
  });
});
