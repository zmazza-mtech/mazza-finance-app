import Decimal from 'decimal.js';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import {
  accounts,
  tellerCredentials,
  transactions,
  recurringTransactions,
  syncLog,
} from '../db/schema';
import { decrypt } from '../lib/crypto';
import { listAccounts, listTransactions, getBalance, TellerApiError } from '../lib/teller-client';
import { reconcileTransactions } from '../services/reconciliation';
import { detectRecurring } from '../services/detection';
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
  const encryptionKey = process.env.ENCRYPTION_KEY!;

  const logRow = await db
    .insert(syncLog)
    .values({ startedAt: new Date(), status: 'running' })
    .returning();

  const logId = logRow[0]!.id;

  let totalFetched = 0;
  let totalReconciled = 0;
  let accountsSynced = 0;

  try {
    // Fetch all credentials
    const creds = await db.select().from(tellerCredentials);

    for (const cred of creds) {
      const accessToken = decrypt(cred.accessToken, encryptionKey);

      // Get accounts from Teller
      let tellerAccounts;
      try {
        tellerAccounts = await listAccounts(accessToken);
      } catch (err) {
        if (err instanceof TellerApiError && err.status === 401) {
          logger.warn('Teller token expired or revoked', { enrollmentId: cred.enrollmentId });
          continue;
        }
        throw err;
      }

      for (const ta of tellerAccounts) {
        // Find our local account record
        const localRows = await db
          .select()
          .from(accounts)
          .where(eq(accounts.tellerId, ta.id))
          .limit(1);

        if (localRows.length === 0) continue;
        const localAccount = localRows[0]!;

        // Fetch balance
        try {
          const balance = await getBalance(accessToken, ta.id);
          const balanceValue = balance.available ?? balance.ledger;

          await db
            .update(accounts)
            .set({
              lastBalance: new Decimal(balanceValue).toFixed(2),
              lastSyncedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(accounts.id, localAccount.id));
        } catch {
          logger.warn('Balance fetch failed', { accountId: localAccount.id });
        }

        // Fetch transactions (90-day window for detection heuristics)
        const tellerTxs = await listTransactions(accessToken, ta.id, 250);
        totalFetched += tellerTxs.length;

        // Map Teller transactions — Teller reports positive as debit, we store negative as debit
        const incoming = tellerTxs.map((t) => ({
          id: t.id,
          accountId: localAccount.id,
          date: t.date,
          description: t.description,
          // Teller uses negative for credits, positive for debits — match our convention
          amount: t.amount,
          status: t.status as 'posted' | 'pending',
        }));

        // Fetch existing stored actual transactions
        const existingRows = await db
          .select()
          .from(transactions)
          .where(eq(transactions.accountId, localAccount.id));

        const existing = existingRows.map((r) => ({
          id: r.id,
          tellerId: r.tellerId ?? null,
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
              tellerId: t.id,
              accountId: localAccount.id,
              date: t.date,
              description: t.description,
              amount: t.amount,
              type: 'actual' as const,
              status: t.status,
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

        // Run recurring detection on this account's transaction history
        await runDetection(localAccount.id, incoming.map((t) => ({
          tellerId: t.id,
          accountId: t.accountId,
          date: t.date,
          description: t.description,
          amount: t.amount,
        })));
      }
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
    await db
      .update(syncLog)
      .set({
        status: 'failed',
        completedAt: new Date(),
        errorCode: 'UNEXPECTED_ERROR',
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
// Detection pass — called per account after reconciliation
// ---------------------------------------------------------------------------

async function runDetection(
  accountId: string,
  rawTxs: { tellerId: string; accountId: string; date: string; description: string; amount: string }[]
): Promise<void> {
  const db = getDb();

  // Fetch existing recurring series names to avoid re-detecting
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
