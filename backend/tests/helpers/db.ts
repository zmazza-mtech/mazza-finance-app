import { sql } from 'drizzle-orm';
import { getDb } from '../../src/db/client';
import { accounts, transactions, recurringTransactions } from '../../src/db/schema';

/**
 * Helpers for the integration tests, which run against the real Postgres that
 * `globalSetup.ts` brings up. Nothing here stubs anything — every call goes to
 * the database the app itself talks to.
 */

/**
 * Empties every table. Called between tests so each one states its own
 * fixtures and no ordering dependency can creep in.
 *
 * RESTART IDENTITY and CASCADE together mean foreign keys do not dictate the
 * order, and the tables come back as if freshly migrated.
 */
export async function resetDb(): Promise<void> {
  const db = getDb();
  await db.execute(
    // Table list is fixed and comes from the schema, not from user input.
    sql`TRUNCATE TABLE
          recurring_overrides,
          recurring_transactions,
          transactions,
          sync_log,
          app_settings,
          accounts
        RESTART IDENTITY CASCADE`,
  );
}

export interface SeededAccount {
  id: string;
}

export async function seedAccount(
  overrides: Partial<typeof accounts.$inferInsert> = {},
): Promise<SeededAccount> {
  const db = getDb();
  const [row] = await db
    .insert(accounts)
    .values({
      institution: 'Ally',
      name: 'Joint Checking',
      type: 'checking',
      lastBalance: '3142.00',
      ...overrides,
    })
    .returning({ id: accounts.id });

  return { id: row!.id };
}

export interface TransactionSeed {
  date: string;
  description: string;
  amount: string;
  category?: string | null;
  categorySource?: string;
  type?: string;
  status?: string;
}

export async function seedTransactions(
  accountId: string,
  rows: TransactionSeed[],
): Promise<void> {
  if (rows.length === 0) return;
  const db = getDb();
  await db.insert(transactions).values(
    rows.map((row) => ({
      accountId,
      date: row.date,
      description: row.description,
      amount: row.amount,
      category: row.category ?? null,
      categorySource: row.categorySource ?? 'auto',
      type: row.type ?? 'manual',
      status: row.status ?? 'posted',
    })),
  );
}

export async function seedRecurring(
  accountId: string,
  overrides: Partial<typeof recurringTransactions.$inferInsert> = {},
): Promise<string> {
  const db = getDb();
  const [row] = await db
    .insert(recurringTransactions)
    .values({
      accountId,
      name: 'Mortgage',
      amount: '-1850.00',
      frequency: 'monthly',
      nextDate: '2026-09-01',
      source: 'manual',
      status: 'active',
      ...overrides,
    })
    .returning({ id: recurringTransactions.id });

  return row!.id;
}

/** Every transaction row for an account, oldest first. */
export async function allTransactions(accountId: string) {
  const db = getDb();
  return db
    .select()
    .from(transactions)
    .where(sql`${transactions.accountId} = ${accountId}`)
    .orderBy(transactions.date, transactions.description);
}

/** A UUID that is well-formed but belongs to nothing. */
export const ABSENT_UUID = '00000000-0000-4000-8000-000000000000';
