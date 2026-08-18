/**
 * CSV import — ported from `backend/src/api/import.ts` (#68).
 *
 * The insert is chunked. D1 binds at most 100 parameters per query and this
 * table has 13 columns, measured at 8 rows before D1 rejects the statement
 * (#102). Express issued one bulk insert for the whole payload, which fails
 * outright on D1 at 20 rows.
 *
 * Chunking is necessary but not sufficient: 5,000 rows is ~625 INSERTs
 * against a free-tier ceiling of 50 queries per invocation. #102 carries that
 * decision; this router is correct on whichever plan is chosen.
 */
import { Hono } from 'hono';
import { and, eq, gte, lte } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { accounts, transactions } from '../db/schema.js';
import { currentHouseholdId } from '../db/household.js';
import { ok, fail, serverError } from '../lib/envelope.js';
import { ImportCsvBodySchema } from '../lib/validate.js';
import { categorize } from '../../../backend/src/services/categorize.js';
import type { Env } from '../env.js';

/**
 * Rows per INSERT.
 *
 * Measured against a real D1 binding: 8 rows succeed on this table and 20 do
 * not. Kept at the measured ceiling rather than guessed, and named so that a
 * column added to `transactions` is an obvious reason to re-measure.
 */
const INSERT_CHUNK = 8;

/**
 * Normalize an amount to 2 decimal places for dedup comparison only.
 *
 * `parseFloat` is deliberate and confined to this key: it compares, it never
 * stores or totals. The amount written to the database is the string as it
 * arrived.
 */
function normalizeAmount(amount: string): string {
  return parseFloat(amount).toFixed(2);
}

async function readJson(c: { req: { json: () => Promise<unknown> } }): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}

const app = new Hono<{ Bindings: Env }>();

// POST /import/csv
app.post('/csv', async (c) => {
  const parsed = ImportCsvBodySchema.safeParse(await readJson(c));
  if (!parsed.success) return fail(c, parsed.error.flatten(), 400);

  const { accountId, transactions: rows } = parsed.data;

  try {
    const db = getDb(c.env.DB);
    const householdId = currentHouseholdId();

    const accountRows = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.id, accountId), eq(accounts.householdId, householdId)))
      .limit(1);
    if (accountRows.length === 0) return fail(c, 'Account not found', 400);

    // The date range this import covers, so the dedup read is one bounded
    // query rather than the whole account.
    const sortedDates = rows.map((r) => r.date).sort();
    const minDate = sortedDates[0]!;
    const maxDate = sortedDates[sortedDates.length - 1]!;

    const existing = await db
      .select({
        date: transactions.date,
        description: transactions.description,
        amount: transactions.amount,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.accountId, accountId),
          eq(transactions.householdId, householdId),
          gte(transactions.date, minDate),
          lte(transactions.date, maxDate),
        ),
      );

    const existingKeys = new Set(
      existing.map((t) => `${String(t.date)}|${t.description}|${normalizeAmount(String(t.amount))}`),
    );

    let skipped = 0;
    const toInsert = [];

    for (const row of rows) {
      const key = `${row.date}|${row.description}|${normalizeAmount(row.amount)}`;
      if (existingKeys.has(key)) {
        skipped++;
        continue;
      }
      // A row repeated inside one payload is a duplicate of itself.
      existingKeys.add(key);
      toInsert.push({
        householdId,
        accountId,
        date: row.date,
        description: row.description,
        amount: row.amount,
        // Same treatment every other write path gives a description. Without
        // it a CSV-seeded account reads as entirely uncategorized on the
        // reports screen until someone runs the batch sweep by hand.
        category: categorize(row.description),
        type: 'manual' as const,
        status: 'posted' as const,
      });
    }

    for (let i = 0; i < toInsert.length; i += INSERT_CHUNK) {
      await db.insert(transactions).values(toInsert.slice(i, i + INSERT_CHUNK));
    }

    return ok(c, { imported: toInsert.length, skipped, errors: [] });
  } catch (err) {
    return serverError(c, 'POST /import/csv', err);
  }
});

export default app;
