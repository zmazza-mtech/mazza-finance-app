import Decimal from 'decimal.js';
import { and, eq, gte, lte } from 'drizzle-orm';
import { getDb } from '../db/client';
import {
  accounts,
  transactions,
  recurringTransactions,
  syncLog,
} from '../db/schema';
import { fetchAccounts, SimpleFINApiError } from '../lib/simplefin-client';
import { reconcileTransactions } from '../services/reconciliation';
import { detectRecurring } from '../services/detection';
import {
  advanceSeriesDate,
  type ActualTransaction,
  type RecurringDef,
} from '../services/forecast';
import { categorize } from '../services/categorize';
import { logger } from '../lib/logger';

// ---------------------------------------------------------------------------
// Sync lock — prevent concurrent runs
// ---------------------------------------------------------------------------

let syncRunning = false;

// ---------------------------------------------------------------------------
// runSync
// ---------------------------------------------------------------------------

export async function runSync(): Promise<void> {
  if (syncRunning) {
    logger.info('Sync already running — skipping');
    return;
  }

  syncRunning = true;
  const db = getDb();

  const logRow = await db
    .insert(syncLog)
    .values({ startedAt: new Date(), status: 'running' })
    .returning();

  const logId = logRow[0]!.id;

  let totalFetched = 0;
  let totalReconciled = 0;
  let accountsSynced = 0;

  try {
    // Fetch accounts + transactions from SimpleFIN (90-day window)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const accountSet = await fetchAccounts({
      startDate: ninetyDaysAgo,
      pending: true,
    });

    for (const sfAccount of accountSet.accounts) {
      // Find or create local account by simplefinId
      let localRows = await db
        .select()
        .from(accounts)
        .where(eq(accounts.simplefinId, sfAccount.id))
        .limit(1);

      if (localRows.length === 0) {
        // Auto-create account from SimpleFIN data
        localRows = await db
          .insert(accounts)
          .values({
            simplefinId: sfAccount.id,
            institution: sfAccount.org.name ?? sfAccount.org.domain ?? 'Unknown',
            name: sfAccount.name,
            type: mapAccountType(sfAccount.name),
            currency: sfAccount.currency,
          })
          .returning();

        logger.info('Auto-created account from SimpleFIN', {
          simplefinId: sfAccount.id,
          name: sfAccount.name,
        });
      }

      const localAccount = localRows[0]!;

      // Update balance
      const balanceValue = sfAccount['available-balance'] ?? sfAccount.balance;
      await db
        .update(accounts)
        .set({
          lastBalance: new Decimal(balanceValue).toFixed(2),
          lastSyncedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(accounts.id, localAccount.id));

      // Process transactions
      const sfTxs = sfAccount.transactions ?? [];
      totalFetched += sfTxs.length;

      const incoming = sfTxs.map((t) => ({
        id: t.id,
        accountId: localAccount.id,
        date: unixToDate(t.posted || t.transacted_at || 0),
        description: t.description,
        amount: t.amount,
        status: (t.pending ? 'pending' : 'posted') as 'posted' | 'pending',
      }));

      // Fetch existing stored actual transactions
      const existingRows = await db
        .select()
        .from(transactions)
        .where(eq(transactions.accountId, localAccount.id));

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

      // Insert new transactions
      if (toInsert.length > 0) {
        await db.insert(transactions).values(
          toInsert.map((t) => ({
            simplefinId: t.id,
            accountId: localAccount.id,
            date: t.date,
            description: t.description,
            amount: t.amount,
            type: 'actual' as const,
            status: t.status,
            category: categorize(t.description),
          }))
        );
      }

      // Update changed transactions
      for (const update of toUpdate) {
        await db
          .update(transactions)
          .set({ ...update.updates, updatedAt: new Date() })
          .where(eq(transactions.id, update.id));
      }

      totalReconciled += toInsert.length + toUpdate.length;
      accountsSynced++;

      // Advance the nextDate of any series whose occurrence was actually paid,
      // so the staleness check in POST /recurring/detect reads a signal that
      // is maintained rather than frozen at approval time (#43).
      await advanceMatchedSeries(db, localAccount.id);

      // Run recurring detection on this account's transaction history
      await runDetection(localAccount.id, incoming.map((t) => ({
        externalId: t.id,
        accountId: t.accountId,
        date: t.date,
        description: t.description,
        amount: t.amount,
      })));
    }

    // Mark sync complete
    await db
      .update(syncLog)
      .set({
        status: 'success',
        completedAt: new Date(),
        accountsSynced,
        transactionsFetched: totalFetched,
        transactionsReconciled: totalReconciled,
      })
      .where(eq(syncLog.id, logId));

    logger.info('Sync complete', { accountsSynced, totalFetched, totalReconciled });
  } catch (err) {
    const errorCode = err instanceof SimpleFINApiError
      ? `SIMPLEFIN_${err.status}`
      : 'UNEXPECTED_ERROR';

    await db
      .update(syncLog)
      .set({
        status: 'failed',
        completedAt: new Date(),
        errorCode,
        accountsSynced,
        transactionsFetched: totalFetched,
        transactionsReconciled: totalReconciled,
      })
      .where(eq(syncLog.id, logId));

    logger.error('Sync failed', { err });
  } finally {
    syncRunning = false;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert Unix epoch seconds to YYYY-MM-DD string. */
function unixToDate(epoch: number): string {
  if (epoch === 0) return new Date().toISOString().slice(0, 10);
  return new Date(epoch * 1000).toISOString().slice(0, 10);
}

/** Best-effort account type mapping from SimpleFIN account name. */
function mapAccountType(name: string): 'checking' | 'savings' | 'credit' {
  const lower = name.toLowerCase();
  if (lower.includes('credit')) return 'credit';
  if (lower.includes('saving')) return 'savings';
  return 'checking';
}

// ---------------------------------------------------------------------------
// Detection pass — called per account after reconciliation
// ---------------------------------------------------------------------------

async function runDetection(
  accountId: string,
  rawTxs: { externalId: string; accountId: string; date: string; description: string; amount: string }[]
): Promise<void> {
  const db = getDb();

  const existingRows = await db
    .select({ name: recurringTransactions.name })
    .from(recurringTransactions)
    .where(eq(recurringTransactions.accountId, accountId));

  const existingNames = new Set(
    existingRows.map((r) => r.name.trim().toLowerCase())
  );

  const asOfDate = new Date().toISOString().slice(0, 10);
  const detected = detectRecurring(rawTxs, asOfDate, existingNames);

  for (const d of detected) {
    await db
      .insert(recurringTransactions)
      .values({
        accountId,
        name: d.name,
        amount: d.amount,
        frequency: d.frequency,
        nextDate: d.nextDate,
        source: 'auto_detected',
        status: 'pending_review',
      })
      .onConflictDoNothing();

    logger.info('Recurring transaction detected', { name: d.name, frequency: d.frequency });
  }
}

// ---------------------------------------------------------------------------
// advanceMatchedSeries
// ---------------------------------------------------------------------------

/**
 * Moves each active series' `nextDate` past the occurrences that were paid.
 *
 * Without this the staleness sweep in `POST /recurring/detect` reads a
 * `nextDate` that nothing ever advances, so every active series crosses its
 * own cutoff on a fixed timer and is ended regardless of whether the bill is
 * still being paid (#43, Defect 2).
 *
 * Series with no matching payment are left untouched, so a series that really
 * has stopped still goes stale.
 */
async function advanceMatchedSeries(
  db: ReturnType<typeof getDb>,
  accountId: string
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);

  const seriesRows = await db
    .select()
    .from(recurringTransactions)
    .where(
      and(
        eq(recurringTransactions.accountId, accountId),
        eq(recurringTransactions.status, 'active')
      )
    );

  if (seriesRows.length === 0) return;

  const earliest = seriesRows.reduce(
    (min, r) => (String(r.nextDate) < min ? String(r.nextDate) : min),
    today
  );

  const txRows = await db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.accountId, accountId),
        gte(transactions.date, earliest),
        lte(transactions.date, today)
      )
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
      today
    );

    if (next === null || next === String(row.nextDate)) continue;

    await db
      .update(recurringTransactions)
      .set({ nextDate: next, updatedAt: new Date() })
      .where(eq(recurringTransactions.id, row.id));

    logger.info('Advanced recurring series nextDate', {
      seriesId: row.id,
      from: String(row.nextDate),
      to: next,
    });
  }
}
