/**
 * The SimpleFIN sync, ported from `backend/src/jobs/sync.ts` (#68, #70, #73).
 *
 * Split in two on purpose. `applyAccountSet` does every database thing a sync
 * does and takes an already-fetched account set; `runSync` is the thin shell
 * that spends a poll to get one. A SimpleFIN call costs one of 24 daily polls
 * and exceeding 24 permanently disables the token, so the half that can be
 * exercised freely is the half worth exercising thoroughly — and it is,
 * against real D1.
 *
 * The module-level `syncRunning` flag the Express version used is gone. It
 * guarded a single long-lived process; Worker isolates are many and
 * short-lived, so the lock lives in `sync_log` where every isolate can see it
 * (`services/sync-guard.ts`).
 */
import Decimal from 'decimal.js';
import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import { accounts, recurringTransactions, transactions } from '../db/schema.js';
import { fetchAccounts, type SimpleFINAccountSet } from '../lib/simplefin-client.js';
import { categorize } from '../../../backend/src/services/categorize.js';
import { reconcileTransactions } from '../../../backend/src/services/reconciliation.js';
import { detectRecurring, type RawTransaction } from '../../../backend/src/services/detection.js';
import {
  advanceSeriesDate,
  type ActualTransaction,
  type RecurringDef,
} from '../../../backend/src/services/forecast.js';
import type { getDb } from '../db/client.js';

type Db = ReturnType<typeof getDb>;

import {
  ID_BATCH,
  RECURRING_COLUMNS,
  TRANSACTION_COLUMNS,
  rowsPerInsert,
} from '../db/limits.js';

const TX_CHUNK = rowsPerInsert(TRANSACTION_COLUMNS);
const RECURRING_CHUNK = rowsPerInsert(RECURRING_COLUMNS);

/** SimpleFIN's maximum window per request. */
const SYNC_WINDOW_DAYS = 90;

export interface SyncResult {
  accountsSynced: number;
  transactionsFetched: number;
  transactionsReconciled: number;
  /**
   * SimpleFIN's `errors` array, carried out rather than swallowed.
   *
   * It holds rate-limit warnings and per-institution connection failures. A
   * sync that reports success while an institution failed to connect is lying
   * about the balance, so the caller surfaces these (#70).
   */
  errors: string[];
}

/** Unix epoch seconds to YYYY-MM-DD. */
function unixToDate(epoch: number, nowIso: string): string {
  if (epoch === 0) return nowIso.slice(0, 10);
  return new Date(epoch * 1000).toISOString().slice(0, 10);
}

/** Best-effort account type from the SimpleFIN account name. */
function mapAccountType(name: string): 'checking' | 'savings' | 'credit' {
  const lower = name.toLowerCase();
  if (lower.includes('credit')) return 'credit';
  if (lower.includes('saving')) return 'savings';
  return 'checking';
}

/**
 * Writes an account set to the database for one household.
 *
 * Everything is scoped by `householdId`, including the lookup that decides
 * whether an account already exists: two households can bank at the same
 * institution, and the unique on `(household_id, simplefin_id)` exists so
 * that is a tenant rather than a collision.
 */
export async function applyAccountSet(
  db: Db,
  householdId: string,
  accountSet: SimpleFINAccountSet,
  nowIso: string,
): Promise<SyncResult> {
  let transactionsFetched = 0;
  let transactionsReconciled = 0;
  let accountsSynced = 0;

  for (const sfAccount of accountSet.accounts) {
    let localRows = await db
      .select()
      .from(accounts)
      .where(
        and(eq(accounts.simplefinId, sfAccount.id), eq(accounts.householdId, householdId)),
      )
      .limit(1);

    if (localRows.length === 0) {
      localRows = await db
        .insert(accounts)
        .values({
          householdId,
          simplefinId: sfAccount.id,
          institution: sfAccount.org.name ?? sfAccount.org.domain ?? 'Unknown',
          name: sfAccount.name,
          type: mapAccountType(sfAccount.name),
          currency: sfAccount.currency,
        })
        .returning();
    }

    const localAccount = localRows[0]!;

    // Available balance where SimpleFIN gives one: it is what is actually
    // spendable, where the ledger balance can include a deposit that has not
    // cleared.
    const balanceValue = sfAccount['available-balance'] ?? sfAccount.balance;
    await db
      .update(accounts)
      .set({
        lastBalance: new Decimal(balanceValue).toFixed(2),
        lastSyncedAt: nowIso,
        updatedAt: nowIso,
      })
      .where(eq(accounts.id, localAccount.id));

    const sfTxs = sfAccount.transactions ?? [];
    transactionsFetched += sfTxs.length;

    const incoming = sfTxs.map((t) => ({
      id: t.id,
      accountId: localAccount.id,
      date: unixToDate(t.posted || t.transacted_at || 0, nowIso),
      description: t.description,
      amount: t.amount,
      status: (t.pending ? 'pending' : 'posted') as 'posted' | 'pending',
    }));

    const existingRows = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.accountId, localAccount.id),
          eq(transactions.householdId, householdId),
        ),
      );

    const existing = existingRows.map((r) => ({
      id: r.id,
      simplefinId: r.simplefinId ?? null,
      accountId: r.accountId,
      date: r.date,
      description: r.description,
      amount: r.amount,
      type: r.type as 'actual' | 'manual',
      status: r.status as 'posted' | 'pending',
    }));

    const { toInsert, toUpdate } = reconcileTransactions(incoming, existing);

    // Chunked by the table's width against D1's 100-parameter ceiling.
    // Express issued one bulk insert for everything, which fails outright
    // here at 20 rows.
    const rows = toInsert.map((t) => ({
      householdId,
      simplefinId: t.id,
      accountId: localAccount.id,
      date: t.date,
      description: t.description,
      amount: t.amount,
      type: 'actual' as const,
      status: t.status,
      category: categorize(t.description),
    }));

    for (let i = 0; i < rows.length; i += TX_CHUNK) {
      await db.insert(transactions).values(rows.slice(i, i + TX_CHUNK));
    }

    // Updates carry per-row values, so they cannot merge into one statement.
    // They are few by construction: only a transaction whose status or amount
    // moved since the last sync appears here.
    for (const update of toUpdate) {
      await db
        .update(transactions)
        .set({ ...update.updates, updatedAt: nowIso })
        .where(
          and(eq(transactions.id, update.id), eq(transactions.householdId, householdId)),
        );
    }

    transactionsReconciled += toInsert.length + toUpdate.length;
    accountsSynced++;

    await advanceMatchedSeries(db, householdId, localAccount.id, nowIso);
    await runDetection(db, householdId, localAccount.id, incoming, nowIso);
  }

  return {
    accountsSynced,
    transactionsFetched,
    transactionsReconciled,
    errors: accountSet.errors,
  };
}

/**
 * Moves `nextDate` past occurrences a synced actual covers.
 *
 * Without it the staleness check in `POST /recurring/detect` reads a date
 * frozen at approval and ends series that are still being paid (#43).
 *
 * Written grouped by target date rather than one statement per series, so the
 * query count is bounded by distinct dates rather than by how many bills a
 * household has (#95).
 */
async function advanceMatchedSeries(
  db: Db,
  householdId: string,
  accountId: string,
  nowIso: string,
): Promise<void> {
  const today = nowIso.slice(0, 10);

  const seriesRows = await db
    .select()
    .from(recurringTransactions)
    .where(
      and(
        eq(recurringTransactions.accountId, accountId),
        eq(recurringTransactions.householdId, householdId),
        eq(recurringTransactions.status, 'active'),
      ),
    );

  if (seriesRows.length === 0) return;

  const earliest = seriesRows.reduce(
    (min, r) => (String(r.nextDate) < min ? String(r.nextDate) : min),
    today,
  );

  const txRows = await db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.accountId, accountId),
        eq(transactions.householdId, householdId),
        gte(transactions.date, earliest),
        lte(transactions.date, today),
      ),
    );

  const actuals: ActualTransaction[] = txRows
    .filter((t) => t.type === 'actual')
    .map((t) => ({
      id: t.id,
      date: String(t.date),
      description: t.description,
      amount: String(t.amount),
      type: 'actual' as const,
    }));

  const byDate = new Map<string, string[]>();
  for (const row of seriesRows) {
    const next = advanceSeriesDate(
      {
        id: row.id,
        accountId: row.accountId,
        name: row.name,
        amount: String(row.amount),
        frequency: row.frequency as RecurringDef['frequency'],
        nextDate: String(row.nextDate),
        endDate: row.endDate ? String(row.endDate) : null,
        status: row.status as RecurringDef['status'],
      },
      actuals,
      today,
    );

    if (next === null || next === String(row.nextDate)) continue;
    const bucket = byDate.get(next);
    if (bucket) bucket.push(row.id);
    else byDate.set(next, [row.id]);
  }

  for (const [date, ids] of byDate) {
    for (let i = 0; i < ids.length; i += ID_BATCH) {
      await db
        .update(recurringTransactions)
        .set({ nextDate: date, updatedAt: nowIso })
        .where(
          and(
            eq(recurringTransactions.householdId, householdId),
            inArray(recurringTransactions.id, ids.slice(i, i + ID_BATCH)),
          ),
        );
    }
  }
}

/** Detects new patterns in what just arrived, as `pending_review` rows. */
async function runDetection(
  db: Db,
  householdId: string,
  accountId: string,
  incoming: { id: string; accountId: string; date: string; description: string; amount: string }[],
  nowIso: string,
): Promise<void> {
  const existingRows = await db
    .select({ name: recurringTransactions.name })
    .from(recurringTransactions)
    .where(
      and(
        eq(recurringTransactions.accountId, accountId),
        eq(recurringTransactions.householdId, householdId),
      ),
    );

  const existingNames = new Set(existingRows.map((r) => r.name.trim().toLowerCase()));

  const rawTxs: RawTransaction[] = incoming.map((t) => ({
    externalId: t.id,
    accountId: t.accountId,
    date: t.date,
    description: t.description,
    amount: t.amount,
  }));

  const detected = detectRecurring(rawTxs, nowIso.slice(0, 10), existingNames);
  if (detected.length === 0) return;

  const rows = detected.map((d) => ({
    householdId,
    accountId,
    name: d.name,
    amount: d.amount,
    frequency: d.frequency,
    nextDate: d.nextDate,
    source: 'auto_detected' as const,
    status: 'pending_review' as const,
  }));

  for (let i = 0; i < rows.length; i += RECURRING_CHUNK) {
    await db.insert(recurringTransactions).values(rows.slice(i, i + RECURRING_CHUNK));
  }
}

/**
 * Spends one SimpleFIN poll and writes what comes back.
 *
 * **The caller must hold the sync lock first** (`services/sync-guard.ts`).
 * Nothing in here checks the 24/day budget, deliberately: a guard that lives
 * beside the thing it guards is a guard that gets forgotten when a second
 * caller appears.
 */
export async function runSync(
  db: Db,
  householdId: string,
  accessUrl: string,
  nowIso: string,
): Promise<SyncResult> {
  const startDate = new Date(Date.parse(nowIso) - SYNC_WINDOW_DAYS * 86_400_000);

  const accountSet = await fetchAccounts(accessUrl, { startDate, pending: true });

  return applyAccountSet(db, householdId, accountSet, nowIso);
}
