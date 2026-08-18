/**
 * The guard around a SimpleFIN poll (#70).
 *
 * SimpleFIN allows 24 polls per day and **exceeding it permanently disables
 * the token**. That is a cliff, not a rate limit, so this is a unit with its
 * own tests rather than a condition inside the sync job — where the only way
 * to exercise it would be to spend the budget it protects.
 *
 * Three concerns, all decided by rows in `sync_log`:
 *
 * - a lock, so two requests cannot both call SimpleFIN
 * - a staleness timeout, so a Worker that died mid-sync cannot wedge the lock
 * - the 24/day budget, counted per household and reset at midnight UTC
 *
 * A Durable Object is the noted upgrade if lock contention ever matters. It
 * does not yet: a household is two people with one phone each.
 */
import { and, eq, gte, inArray } from 'drizzle-orm';
import { syncLog } from '../db/schema.js';
import type { getDb } from '../db/client.js';

type Db = ReturnType<typeof getDb>;

/** SimpleFIN's published ceiling. Exceeding it disables the token for good. */
export const DAILY_SYNC_LIMIT = 24;

/**
 * How long a `running` row is honoured before it is treated as abandoned.
 *
 * A Worker invocation cannot outlive its request, so a sync that has been
 * running for this long is not running at all — the isolate is gone. Long
 * enough that a slow but live sync is never stolen from; short enough that a
 * crash does not cost the household a day of syncing.
 */
export const STALE_LOCK_MS = 5 * 60 * 1000;

export interface LockResult {
  acquired: boolean;
  /** Set when acquired: the `sync_log` row to complete when the sync ends. */
  lockId?: string;
  /** Why it was refused. `running` — another sync holds it. `budget` — spent. */
  reason?: 'running' | 'budget';
  /** Polls counted against today's budget, including the one just taken. */
  usedToday: number;
  limit: number;
}

/** Midnight UTC of the day `nowIso` falls in. SimpleFIN's reset boundary. */
function startOfUtcDay(nowIso: string): string {
  return `${nowIso.slice(0, 10)}T00:00:00.000Z`;
}

/**
 * Takes the lock for one household, or explains why it could not.
 *
 * `nowIso` is passed rather than read from the clock so the caller decides
 * what "now" is — which is what lets the timeout and the midnight boundary be
 * tested at all, without waiting five minutes or until tomorrow.
 */
export async function acquireSyncLock(
  db: Db,
  householdId: string,
  nowIso: string,
): Promise<LockResult> {
  const dayStart = startOfUtcDay(nowIso);
  const staleBefore = new Date(Date.parse(nowIso) - STALE_LOCK_MS).toISOString();

  const todays = await db
    .select({ id: syncLog.id, startedAt: syncLog.startedAt, status: syncLog.status })
    .from(syncLog)
    .where(and(eq(syncLog.householdId, householdId), gte(syncLog.startedAt, dayStart)));

  const running = todays.filter((r) => r.status === 'running');
  const live = running.filter((r) => r.startedAt > staleBefore);

  if (live.length > 0) {
    return { acquired: false, reason: 'running', usedToday: todays.length, limit: DAILY_SYNC_LIMIT };
  }

  // Anything still `running` past the timeout is abandoned. It is marked
  // failed rather than deleted: SimpleFIN counted that poll whether or not a
  // result was ever recorded, and a row that vanishes takes its budget with
  // it — which is how 24 retries become 48 polls and a dead token.
  const abandoned = running.map((r) => r.id);
  if (abandoned.length > 0) {
    await db
      .update(syncLog)
      .set({ status: 'failed', completedAt: nowIso, errorCode: 'abandoned' })
      .where(and(eq(syncLog.householdId, householdId), inArray(syncLog.id, abandoned)));
  }

  if (todays.length >= DAILY_SYNC_LIMIT) {
    return { acquired: false, reason: 'budget', usedToday: todays.length, limit: DAILY_SYNC_LIMIT };
  }

  const inserted = await db
    .insert(syncLog)
    .values({ householdId, startedAt: nowIso, status: 'running' })
    .returning({ id: syncLog.id });

  const lockId = inserted[0]!.id;

  // D1 has no transaction spanning the read and the write above, so a true
  // race can insert twice. The loser of the race is whichever row is not the
  // earliest for this household today: it withdraws its own row and reports
  // `running`, so exactly one caller proceeds to SimpleFIN.
  const contenders = await db
    .select({ id: syncLog.id, startedAt: syncLog.startedAt })
    .from(syncLog)
    .where(
      and(
        eq(syncLog.householdId, householdId),
        eq(syncLog.status, 'running'),
        gte(syncLog.startedAt, dayStart),
      ),
    );

  if (contenders.length > 1) {
    // Ties on startedAt are broken by id, which is stable and shared by every
    // contender, so they all reach the same verdict.
    const winner = [...contenders].sort(
      (a, b) => a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id),
    )[0]!;

    if (winner.id !== lockId) {
      await db.delete(syncLog).where(eq(syncLog.id, lockId));
      return {
        acquired: false,
        reason: 'running',
        usedToday: todays.length,
        limit: DAILY_SYNC_LIMIT,
      };
    }
  }

  return { acquired: true, lockId, usedToday: todays.length + 1, limit: DAILY_SYNC_LIMIT };
}

/** Completes the row taken by `acquireSyncLock`, freeing the lock. */
export async function releaseSyncLock(
  db: Db,
  lockId: string,
  status: 'success' | 'partial' | 'failed',
  nowIso: string,
  counts?: {
    accountsSynced?: number;
    transactionsFetched?: number;
    transactionsReconciled?: number;
    /** Fixed vocabulary only — never raw SimpleFIN response text. */
    errorCode?: string;
  },
): Promise<void> {
  await db
    .update(syncLog)
    .set({ status, completedAt: nowIso, ...counts })
    .where(eq(syncLog.id, lockId));
}
