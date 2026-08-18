/**
 * Transactions — ported from `backend/src/api/transactions.ts` (#68).
 *
 * The categorization service is imported from the Express tree rather than
 * copied. Both servers are live until the Phase 2 cutover, and a second copy
 * of the keyword rules would drift from the first without anything noticing.
 * #82 moves the file here when the Express app is deleted.
 *
 * Two endpoints depart from the original, and only in how they issue queries.
 * `batch-categorize` and `backfill-categories` ran one UPDATE per row in a
 * loop; the D1 free tier allows 50 queries per Worker invocation (#95), so a
 * correction across 60 rows would have failed partway through with half of
 * them already written. Both now write in bounded batches.
 */
import { Hono } from 'hono';
import { and, asc, desc, eq, gte, inArray, isNull, lte } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { accounts, transactions } from '../db/schema.js';
import { currentHouseholdId } from '../db/household.js';
import { ok, fail, serverError } from '../lib/envelope.js';
import {
  BatchCategorizeSchema,
  CreateManualTransactionSchema,
  TransactionsQuerySchema,
  UpdateManualTransactionSchema,
  uuid,
} from '../lib/validate.js';
import {
  categorize,
  normalizeDescription,
  isRecategorizable,
} from '../../../backend/src/services/categorize.js';
import type { Env } from '../env.js';

/** Column map for dynamic ORDER BY. */
const SORT_COLUMNS = {
  date: transactions.date,
  amount: transactions.amount,
  description: transactions.description,
  category: transactions.category,
} as const;

/**
 * How many ids one UPDATE ... WHERE id IN (...) carries.
 *
 * D1 binds at most 100 parameters per query, and the category and the
 * timestamp take two of them. 90 leaves room without being tuned to the
 * limit. A 60-row correction is therefore one query, not sixty.
 */
const ID_BATCH = 90;

async function readJson(c: { req: { json: () => Promise<unknown> } }): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}

const app = new Hono<{ Bindings: Env }>();

// GET /transactions?accountId=&startDate=&endDate=&sortBy=&sortDir=&category=
app.get('/', async (c) => {
  const parsed = TransactionsQuerySchema.safeParse(
    Object.fromEntries(new URL(c.req.url).searchParams),
  );
  if (!parsed.success) return fail(c, parsed.error.flatten(), 400);

  const { accountId, startDate, endDate, sortBy, sortDir, category } = parsed.data;

  try {
    const db = getDb(c.env.DB);
    const conditions = [eq(transactions.householdId, currentHouseholdId())];
    if (accountId) conditions.push(eq(transactions.accountId, accountId));
    if (startDate) conditions.push(gte(transactions.date, startDate));
    if (endDate) conditions.push(lte(transactions.date, endDate));
    if (category) conditions.push(eq(transactions.category, category));

    const orderCol = sortBy ? SORT_COLUMNS[sortBy] : transactions.date;
    const orderFn = sortDir === 'asc' ? asc : desc;

    const rows = await db
      .select()
      .from(transactions)
      .where(and(...conditions))
      .orderBy(orderFn(orderCol));

    return ok(c, rows);
  } catch (err) {
    return serverError(c, 'GET /transactions', err);
  }
});

// POST /transactions/batch-categorize — declared before /:id so the literal
// path is not swallowed by the parameter route.
app.post('/batch-categorize', async (c) => {
  const parsed = BatchCategorizeSchema.safeParse(await readJson(c));
  if (!parsed.success) return fail(c, parsed.error.flatten(), 400);

  const { description, category } = parsed.data;
  const target = normalizeDescription(description).toLowerCase();

  try {
    const db = getDb(c.env.DB);
    const householdId = currentHouseholdId();

    // Normalization is a JS function, so the match cannot be pushed into SQL.
    // One read of id + description for the household, then batched writes.
    const all = await db
      .select({ id: transactions.id, description: transactions.description })
      .from(transactions)
      .where(eq(transactions.householdId, householdId));

    const matching = all
      .filter((t) => normalizeDescription(t.description).toLowerCase() === target)
      .map((t) => t.id);

    if (matching.length === 0) return ok(c, { updated: 0 });

    // A batch correction is as deliberate as a single one, so the rows it
    // touches are user-set and stay out of reach of re-categorization.
    const updatedAt = new Date().toISOString();
    for (let i = 0; i < matching.length; i += ID_BATCH) {
      await db
        .update(transactions)
        .set({ category, categorySource: 'user', updatedAt })
        .where(
          and(
            eq(transactions.householdId, householdId),
            inArray(transactions.id, matching.slice(i, i + ID_BATCH)),
          ),
        );
    }

    return ok(c, { updated: matching.length });
  } catch (err) {
    return serverError(c, 'POST /transactions/batch-categorize', err);
  }
});

// POST /transactions/backfill-categories
app.post('/backfill-categories', async (c) => {
  try {
    const db = getDb(c.env.DB);
    const householdId = currentHouseholdId();

    const uncategorized = await db
      .select({
        id: transactions.id,
        description: transactions.description,
        categorySource: transactions.categorySource,
      })
      .from(transactions)
      .where(and(eq(transactions.householdId, householdId), isNull(transactions.category)));

    // Grouped by the category each row resolves to, so the write count is
    // bounded by the number of distinct categories rather than by the number
    // of rows. A null category the user chose is a decision, not a gap.
    const byCategory = new Map<string, string[]>();
    for (const row of uncategorized) {
      if (!isRecategorizable(row.categorySource)) continue;
      const cat = categorize(row.description);
      if (!cat) continue;
      const bucket = byCategory.get(cat);
      if (bucket) bucket.push(row.id);
      else byCategory.set(cat, [row.id]);
    }

    const updatedAt = new Date().toISOString();
    let updated = 0;
    for (const [category, ids] of byCategory) {
      for (let i = 0; i < ids.length; i += ID_BATCH) {
        const slice = ids.slice(i, i + ID_BATCH);
        await db
          .update(transactions)
          // categorySource is deliberately not set: this filled a gap, it did
          // not record a decision, so a later correction is still a correction.
          .set({ category: category as never, updatedAt })
          .where(
            and(
              eq(transactions.householdId, householdId),
              inArray(transactions.id, slice),
            ),
          );
        updated += slice.length;
      }
    }

    return ok(c, { updated, total: uncategorized.length });
  } catch (err) {
    return serverError(c, 'POST /transactions/backfill-categories', err);
  }
});

// POST /transactions (manual entries only)
app.post('/', async (c) => {
  const parsed = CreateManualTransactionSchema.safeParse(await readJson(c));
  if (!parsed.success) return fail(c, parsed.error.flatten(), 400);

  try {
    const db = getDb(c.env.DB);
    const householdId = currentHouseholdId();

    // Without this the account id is an open door: the row would be filed
    // under this household but pointed at another household's account.
    const account = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.id, parsed.data.accountId), eq(accounts.householdId, householdId)))
      .limit(1);
    if (account.length === 0) return fail(c, 'Account not found', 404);

    const rows = await db
      .insert(transactions)
      .values({
        ...parsed.data,
        householdId,
        category: parsed.data.category ?? categorize(parsed.data.description),
        type: 'manual',
        status: 'posted',
      })
      .returning();

    return ok(c, rows[0], 201);
  } catch (err) {
    return serverError(c, 'POST /transactions', err);
  }
});

// PATCH /transactions/:id
// Category can be updated on any transaction type. Date, description and
// amount can only be updated on manual entries.
app.patch('/:id', async (c) => {
  const id = uuid.safeParse(c.req.param('id'));
  if (!id.success) return fail(c, 'Invalid transaction id', 400);

  const parsed = UpdateManualTransactionSchema.safeParse(await readJson(c));
  if (!parsed.success) return fail(c, parsed.error.flatten(), 400);
  if (Object.keys(parsed.data).length === 0) return fail(c, 'No fields to update', 400);

  try {
    const db = getDb(c.env.DB);
    const scope = and(
      eq(transactions.id, id.data),
      eq(transactions.householdId, currentHouseholdId()),
    );

    const existing = await db.select().from(transactions).where(scope).limit(1);
    if (existing.length === 0) return fail(c, 'Transaction not found', 404);

    const hasDataFields =
      parsed.data.date !== undefined ||
      parsed.data.description !== undefined ||
      parsed.data.amount !== undefined;

    if (existing[0]!.type !== 'manual' && hasDataFields) {
      return fail(c, 'Only category can be edited on bank transactions', 403);
    }

    const setFields: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (parsed.data.date !== undefined) setFields['date'] = parsed.data.date;
    if (parsed.data.description !== undefined) setFields['description'] = parsed.data.description;
    if (parsed.data.amount !== undefined) setFields['amount'] = parsed.data.amount;
    // A category arriving here was chosen by the user, including a deliberate
    // clear to null — auto-categorization must not fill it back in later.
    if ('category' in parsed.data) {
      setFields['category'] = parsed.data.category;
      setFields['categorySource'] = 'user';
    }

    const rows = await db
      .update(transactions)
      .set(setFields as never)
      .where(scope)
      .returning();

    return ok(c, rows[0]);
  } catch (err) {
    return serverError(c, 'PATCH /transactions/:id', err);
  }
});

// DELETE /transactions/:id (manual entries only)
app.delete('/:id', async (c) => {
  const id = uuid.safeParse(c.req.param('id'));
  if (!id.success) return fail(c, 'Invalid transaction id', 400);

  try {
    const db = getDb(c.env.DB);
    const scope = and(
      eq(transactions.id, id.data),
      eq(transactions.householdId, currentHouseholdId()),
    );

    const existing = await db.select().from(transactions).where(scope).limit(1);
    if (existing.length === 0) return fail(c, 'Transaction not found', 404);
    if (existing[0]!.type !== 'manual') {
      return fail(c, 'Only manual transactions can be deleted', 403);
    }

    await db.delete(transactions).where(scope);
    return c.body(null, 204);
  } catch (err) {
    return serverError(c, 'DELETE /transactions/:id', err);
  }
});

export default app;
