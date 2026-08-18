/**
 * Sync — the last of the eight routers (#68), and where #70 and #73 meet.
 *
 * Every refusal happens before a poll is spent. That ordering is the whole
 * design: SimpleFIN allows 24 polls a day and exceeding 24 permanently
 * disables the token, so a request that cannot succeed must cost nothing.
 *
 * The Express version answered 202 and ran the sync fire-and-forget, with the
 * client polling `/sync/status`. That shape is kept — a sync outlasts a
 * comfortable request — but the work is handed to `waitUntil` so the isolate
 * is not torn down mid-write.
 */
import { Hono } from 'hono';
import { and, desc, eq, gte } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { syncLog } from '../db/schema.js';
import { currentHouseholdId } from '../db/household.js';
import { ok, fail, serverError } from '../lib/envelope.js';
import {
  acquireSyncLock,
  releaseSyncLock,
  DAILY_SYNC_LIMIT,
} from '../services/sync-guard.js';
import { readAccessUrl, hasConnection } from '../services/simplefin-connection.js';
import { runSync } from '../jobs/sync.js';
import { SimpleFINApiError } from '../lib/simplefin-client.js';
import type { Env } from '../env.js';

const app = new Hono<{ Bindings: Env }>();

// POST /sync — trigger an on-demand sync
app.post('/', async (c) => {
  const db = getDb(c.env.DB);
  const householdId = currentHouseholdId();
  const nowIso = new Date().toISOString();

  try {
    // Checked before the lock: a household with nothing to sync with should
    // not consume a sync_log row, because a refused attempt is not a poll and
    // must not spend budget.
    const accessUrl = await readAccessUrl(db, householdId, c.env.ENCRYPTION_KEY);
    if (!accessUrl) {
      return fail(c, 'SimpleFIN is not connected for this household', 409);
    }

    const lock = await acquireSyncLock(db, householdId, nowIso);
    if (!lock.acquired) {
      if (lock.reason === 'budget') {
        return fail(
          c,
          `Daily sync limit reached (${DAILY_SYNC_LIMIT}). Resets at midnight UTC.`,
          429,
        );
      }
      return fail(c, 'A sync is already running', 409);
    }

    // Fire and forget, as Express did — the client polls /sync/status. The
    // work is handed to waitUntil so the isolate survives it; without that
    // the sync is killed the moment this response is returned.
    c.executionCtx.waitUntil(
      runSync(db, householdId, accessUrl, nowIso)
        .then((result) =>
          releaseSyncLock(db, lock.lockId!, result.errors.length > 0 ? 'partial' : 'success', new Date().toISOString(), {
            accountsSynced: result.accountsSynced,
            transactionsFetched: result.transactionsFetched,
            transactionsReconciled: result.transactionsReconciled,
          }),
        )
        .catch((err) => {
          // Fixed vocabulary only — a SimpleFIN error body can carry account
          // detail and is never written to a column or a log line.
          const errorCode =
            err instanceof SimpleFINApiError ? `SIMPLEFIN_${err.status}` : 'UNEXPECTED_ERROR';
          console.error('Sync failed', { errorCode });
          return releaseSyncLock(db, lock.lockId!, 'failed', new Date().toISOString(), {
            errorCode,
          });
        }),
    );

    return ok(c, { accepted: true, syncsToday: lock.usedToday, dailyLimit: lock.limit }, 202);
  } catch (err) {
    return serverError(c, 'POST /sync', err);
  }
});

// The Express router mounted POST only, so a GET fell through to the 404
// handler. Answering 405 says the same thing more precisely without
// suggesting the path does not exist.
app.get('/', (c) => fail(c, 'Method not allowed', 405));

// GET /sync/status — last sync, today's usage, and whether a connection exists
app.get('/status', async (c) => {
  const db = getDb(c.env.DB);
  const householdId = currentHouseholdId();

  try {
    const dayStart = `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`;

    const [lastSyncRows, todays, connected] = await Promise.all([
      db
        .select()
        .from(syncLog)
        .where(eq(syncLog.householdId, householdId))
        .orderBy(desc(syncLog.startedAt))
        .limit(1),
      db
        .select({ id: syncLog.id })
        .from(syncLog)
        .where(and(eq(syncLog.householdId, householdId), gte(syncLog.startedAt, dayStart))),
      hasConnection(db, householdId),
    ]);

    return ok(c, {
      lastSync: lastSyncRows[0] ?? null,
      syncsToday: todays.length,
      dailyLimit: DAILY_SYNC_LIMIT,
      // Reported without decrypting: a check that produces plaintext to
      // answer a boolean is a credential created for no reason.
      connected,
    });
  } catch (err) {
    return serverError(c, 'GET /sync/status', err);
  }
});

export default app;
