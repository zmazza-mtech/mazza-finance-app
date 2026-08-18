/**
 * Recurring series and single-occurrence overrides — ported from
 * `backend/src/api/recurring.ts` (#68).
 *
 * `detect` is the endpoint most exposed to the D1 free tier's 50-queries-per
 * -invocation ceiling (#95). The Express version advanced each paid series
 * with its own UPDATE inside a loop, so the sweep that keeps the forecast
 * populated would have failed on a household with 50 series. It now writes
 * one statement per distinct advanced date, and one for the whole stale set.
 *
 * Detection and forecast services are imported from the Express tree rather
 * than copied: both servers are live until the Phase 2 cutover, and a second
 * copy of the pattern rules would drift. #82 moves them.
 */
import { Hono } from 'hono';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../db/client.js';
import { accounts, recurringOverrides, recurringTransactions, transactions } from '../db/schema.js';
import { currentHouseholdId } from '../db/household.js';
import { ok, fail, serverError } from '../lib/envelope.js';
import {
  CreateOverrideSchema,
  CreateRecurringSchema,
  UpdateRecurringSchema,
  dateString,
  uuid,
} from '../lib/validate.js';
import { categorize } from '../../../backend/src/services/categorize.js';
import {
  detectRecurring,
  type RawTransaction,
} from '../../../backend/src/services/detection.js';
import {
  advanceSeriesDate,
  type ActualTransaction,
  type RecurringDef,
} from '../../../backend/src/services/forecast.js';
import type { Env } from '../env.js';

/**
 * Grace period in days after nextDate before an active series is stale.
 * 3x the expected interval gives one full missed period of buffer.
 */
const STALE_GRACE_DAYS: Record<string, number> = {
  weekly: 21,
  biweekly: 42,
  monthly: 90,
  yearly: 400,
};

function addDaysToDateStr(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** D1 binds at most 100 parameters per query; this leaves room for the rest. */
const ID_BATCH = 90;

async function readJson(c: { req: { json: () => Promise<unknown> } }): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}

const app = new Hono<{ Bindings: Env }>();

/** Resolves an account inside the request household, or null. */
async function ownedAccount(env: Env, accountId: string): Promise<string | null> {
  const db = getDb(env.DB);
  const rows = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.householdId, currentHouseholdId())))
    .limit(1);
  return rows[0]?.id ?? null;
}

// GET /recurring?accountId=
app.get('/', async (c) => {
  const parsed = z
    .object({ accountId: uuid })
    .safeParse(Object.fromEntries(new URL(c.req.url).searchParams));
  if (!parsed.success) return fail(c, parsed.error.flatten(), 400);

  try {
    if (!(await ownedAccount(c.env, parsed.data.accountId))) {
      return fail(c, 'Account not found', 404);
    }

    const db = getDb(c.env.DB);
    const rows = await db
      .select()
      .from(recurringTransactions)
      .where(
        and(
          eq(recurringTransactions.accountId, parsed.data.accountId),
          eq(recurringTransactions.householdId, currentHouseholdId()),
        ),
      )
      .orderBy(recurringTransactions.name);

    return ok(c, rows);
  } catch (err) {
    return serverError(c, 'GET /recurring', err);
  }
});

// POST /recurring/detect — find new patterns, advance what was paid, expire
// what genuinely stopped.
app.post('/detect', async (c) => {
  const parsed = z.object({ accountId: uuid }).safeParse(await readJson(c));
  if (!parsed.success) return fail(c, parsed.error.flatten(), 400);

  const { accountId } = parsed.data;

  try {
    if (!(await ownedAccount(c.env, accountId))) return fail(c, 'Account not found', 404);

    const db = getDb(c.env.DB);
    const householdId = currentHouseholdId();
    const serverToday = new Date().toISOString().slice(0, 10);

    const txRows = await db
      .select()
      .from(transactions)
      .where(
        and(eq(transactions.accountId, accountId), eq(transactions.householdId, householdId)),
      );

    const allRecurring = await db
      .select()
      .from(recurringTransactions)
      .where(
        and(
          eq(recurringTransactions.accountId, accountId),
          eq(recurringTransactions.householdId, householdId),
        ),
      );

    const existingNames = new Set(allRecurring.map((r) => r.name.trim().toLowerCase()));

    // Step 1 — detect new patterns
    const rawTxs: RawTransaction[] = txRows.map((t) => ({
      externalId: t.id,
      accountId: t.accountId,
      date: String(t.date),
      description: t.description,
      amount: String(t.amount),
    }));

    const detected = detectRecurring(rawTxs, serverToday, existingNames);

    let insertedCount = 0;
    if (detected.length > 0) {
      const inserted = await db
        .insert(recurringTransactions)
        .values(
          detected.map((d) => ({
            householdId,
            accountId: d.accountId,
            name: d.name,
            amount: d.amount,
            frequency: d.frequency,
            nextDate: d.nextDate,
            source: 'auto_detected' as const,
            status: 'pending_review' as const,
          })),
        )
        .returning();
      insertedCount = inserted.length;
    }

    // Step 2 — advance series whose occurrences were paid.
    //
    // The staleness check below reads nextDate, so it has to run against a
    // nextDate reflecting the payments actually seen. The sync job does this
    // too, but detection is reachable on its own from "Scan for patterns" —
    // without it, one click there re-ends every series whose payments had not
    // been reconciled since the last sync (#43).
    const actualsForAdvance: ActualTransaction[] = txRows
      .filter((t) => t.type === 'actual')
      .map((t) => ({
        id: t.id,
        date: String(t.date),
        description: t.description,
        amount: String(t.amount),
        type: 'actual' as const,
      }));

    const advancedNextDates = new Map<string, string>();
    for (const r of allRecurring) {
      if (r.status !== 'active') continue;

      const next = advanceSeriesDate(
        {
          id: r.id,
          accountId: r.accountId,
          name: r.name,
          amount: String(r.amount),
          frequency: r.frequency as RecurringDef['frequency'],
          nextDate: String(r.nextDate),
          endDate: r.endDate ? String(r.endDate) : null,
          status: 'active',
        },
        actualsForAdvance,
        serverToday,
      );

      if (next !== null && next !== String(r.nextDate)) advancedNextDates.set(r.id, next);
    }

    // Written grouped by target date rather than one statement per series:
    // series sharing a billing cycle share a date, and the query count is
    // then bounded by distinct dates rather than by how many bills a
    // household has (#95).
    if (advancedNextDates.size > 0) {
      const byDate = new Map<string, string[]>();
      for (const [id, date] of advancedNextDates) {
        const bucket = byDate.get(date);
        if (bucket) bucket.push(id);
        else byDate.set(date, [id]);
      }

      const updatedAt = new Date().toISOString();
      for (const [date, ids] of byDate) {
        for (let i = 0; i < ids.length; i += ID_BATCH) {
          await db
            .update(recurringTransactions)
            .set({ nextDate: date, updatedAt })
            .where(
              and(
                eq(recurringTransactions.householdId, householdId),
                inArray(recurringTransactions.id, ids.slice(i, i + ID_BATCH)),
              ),
            );
        }
      }
    }

    // Step 3 — expire stale active series. A series is stale when its
    // nextDate plus its grace period is still in the past.
    const staleIds: string[] = [];
    for (const r of allRecurring) {
      if (r.status !== 'active') continue;
      const graceDays = STALE_GRACE_DAYS[r.frequency] ?? 90;
      // The advanced date where one was written, not the row's stale copy.
      const nextDate = advancedNextDates.get(r.id) ?? String(r.nextDate);
      if (addDaysToDateStr(nextDate, graceDays) < serverToday) staleIds.push(r.id);
    }

    /*
     * `endDate` is deliberately left null (#43, Defect 3).
     *
     * This once wrote the series' own nextDate as its end date — the date the
     * forecast last predicted an occurrence, never one on which anything was
     * observed to stop. The `ended` status already carries "this stopped
     * generating"; a date belongs here only once something is known to have
     * ended, and nothing here knows that.
     */
    for (let i = 0; i < staleIds.length; i += ID_BATCH) {
      await db
        .update(recurringTransactions)
        .set({ status: 'ended', updatedAt: new Date().toISOString() })
        .where(
          and(
            eq(recurringTransactions.householdId, householdId),
            inArray(recurringTransactions.id, staleIds.slice(i, i + ID_BATCH)),
          ),
        );
    }

    return ok(c, { detected: insertedCount, expired: staleIds.length });
  } catch (err) {
    return serverError(c, 'POST /recurring/detect', err);
  }
});

// POST /recurring
app.post('/', async (c) => {
  const parsed = CreateRecurringSchema.safeParse(await readJson(c));
  if (!parsed.success) return fail(c, parsed.error.flatten(), 400);

  try {
    if (!(await ownedAccount(c.env, parsed.data.accountId))) {
      return fail(c, 'Account not found', 404);
    }

    const db = getDb(c.env.DB);
    const rows = await db
      .insert(recurringTransactions)
      .values({
        householdId: currentHouseholdId(),
        accountId: parsed.data.accountId,
        name: parsed.data.name,
        amount: parsed.data.amount,
        frequency: parsed.data.frequency,
        nextDate: parsed.data.nextDate,
        source: 'manual',
        status: 'active',
        category: parsed.data.category ?? categorize(parsed.data.name),
        ...(parsed.data.endDate !== undefined ? { endDate: parsed.data.endDate } : {}),
      })
      .returning();

    return ok(c, rows[0], 201);
  } catch (err) {
    return serverError(c, 'POST /recurring', err);
  }
});

/** Resolves a series inside the request household, or null. */
async function ownedSeries(env: Env, id: string) {
  const db = getDb(env.DB);
  const rows = await db
    .select()
    .from(recurringTransactions)
    .where(
      and(
        eq(recurringTransactions.id, id),
        eq(recurringTransactions.householdId, currentHouseholdId()),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

// GET /recurring/:id/overrides
app.get('/:id/overrides', async (c) => {
  const id = uuid.safeParse(c.req.param('id'));
  if (!id.success) return fail(c, 'Invalid recurring transaction id', 400);

  try {
    if (!(await ownedSeries(c.env, id.data))) {
      return fail(c, 'Recurring transaction not found', 404);
    }

    const db = getDb(c.env.DB);
    const rows = await db
      .select()
      .from(recurringOverrides)
      .where(
        and(
          eq(recurringOverrides.recurringTransactionId, id.data),
          eq(recurringOverrides.householdId, currentHouseholdId()),
        ),
      )
      .orderBy(recurringOverrides.originalDate);

    return ok(c, rows);
  } catch (err) {
    return serverError(c, 'GET /recurring/:id/overrides', err);
  }
});

// POST /recurring/:id/overrides/:originalDate
app.post('/:id/overrides/:originalDate', async (c) => {
  const params = z
    .object({ id: uuid, originalDate: dateString })
    .safeParse({ id: c.req.param('id'), originalDate: c.req.param('originalDate') });
  if (!params.success) {
    return fail(c, 'Invalid id or date format (expected YYYY-MM-DD)', 400);
  }

  const parsed = CreateOverrideSchema.safeParse(await readJson(c));
  if (!parsed.success) return fail(c, parsed.error.flatten(), 400);

  const { id, originalDate } = params.data;

  try {
    if (!(await ownedSeries(c.env, id))) {
      return fail(c, 'Recurring transaction not found', 404);
    }

    const db = getDb(c.env.DB);
    const householdId = currentHouseholdId();

    // One row per occurrence. Migration 0002 added the unique this upsert
    // always assumed (#100), so a second edit of the same occurrence now
    // replaces the first instead of joining it.
    await db
      .insert(recurringOverrides)
      .values({
        householdId,
        recurringTransactionId: id,
        originalDate,
        overrideType: parsed.data.overrideType,
        ...(parsed.data.overrideDate !== undefined
          ? { overrideDate: parsed.data.overrideDate }
          : {}),
        ...(parsed.data.overrideAmount !== undefined
          ? { overrideAmount: parsed.data.overrideAmount }
          : {}),
        ...(parsed.data.overrideName !== undefined
          ? { overrideName: parsed.data.overrideName }
          : {}),
      })
      .onConflictDoUpdate({
        target: [recurringOverrides.recurringTransactionId, recurringOverrides.originalDate],
        set: {
          overrideType: parsed.data.overrideType,
          overrideDate: parsed.data.overrideDate ?? null,
          overrideAmount: parsed.data.overrideAmount ?? null,
          overrideName: parsed.data.overrideName ?? null,
        },
      });

    const rows = await db
      .select()
      .from(recurringOverrides)
      .where(
        and(
          eq(recurringOverrides.recurringTransactionId, id),
          eq(recurringOverrides.originalDate, originalDate),
          eq(recurringOverrides.householdId, householdId),
        ),
      )
      .limit(1);

    return ok(c, rows[0], 201);
  } catch (err) {
    return serverError(c, 'POST /recurring/:id/overrides/:date', err);
  }
});

// DELETE /recurring/:id/overrides/:originalDate
app.delete('/:id/overrides/:originalDate', async (c) => {
  const params = z
    .object({ id: uuid, originalDate: dateString })
    .safeParse({ id: c.req.param('id'), originalDate: c.req.param('originalDate') });
  if (!params.success) {
    return fail(c, 'Invalid id or date format (expected YYYY-MM-DD)', 400);
  }

  try {
    // Express deleted by (id, date) with no parent check at all, so knowing a
    // pair was enough to reach across the tenancy boundary.
    if (!(await ownedSeries(c.env, params.data.id))) {
      return fail(c, 'Recurring transaction not found', 404);
    }

    const db = getDb(c.env.DB);
    await db
      .delete(recurringOverrides)
      .where(
        and(
          eq(recurringOverrides.recurringTransactionId, params.data.id),
          eq(recurringOverrides.originalDate, params.data.originalDate),
          eq(recurringOverrides.householdId, currentHouseholdId()),
        ),
      );

    return c.body(null, 204);
  } catch (err) {
    return serverError(c, 'DELETE /recurring/:id/overrides/:date', err);
  }
});

// PATCH /recurring/:id
app.patch('/:id', async (c) => {
  const id = uuid.safeParse(c.req.param('id'));
  if (!id.success) return fail(c, 'Invalid recurring transaction id', 400);

  const parsed = UpdateRecurringSchema.safeParse(await readJson(c));
  if (!parsed.success) return fail(c, parsed.error.flatten(), 400);
  if (Object.keys(parsed.data).length === 0) return fail(c, 'No fields to update', 400);

  try {
    if (!(await ownedSeries(c.env, id.data))) {
      return fail(c, 'Recurring transaction not found', 404);
    }

    const db = getDb(c.env.DB);
    const scope = and(
      eq(recurringTransactions.id, id.data),
      eq(recurringTransactions.householdId, currentHouseholdId()),
    );

    const setFields: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (parsed.data.name !== undefined) setFields['name'] = parsed.data.name;
    if (parsed.data.amount !== undefined) setFields['amount'] = parsed.data.amount;
    if (parsed.data.frequency !== undefined) setFields['frequency'] = parsed.data.frequency;
    if (parsed.data.nextDate !== undefined) setFields['nextDate'] = parsed.data.nextDate;
    if (parsed.data.endDate !== undefined) setFields['endDate'] = parsed.data.endDate;
    if (parsed.data.status !== undefined) setFields['status'] = parsed.data.status;
    if ('category' in parsed.data) setFields['category'] = parsed.data.category;

    const rows = await db
      .update(recurringTransactions)
      .set(setFields as never)
      .where(scope)
      .returning();

    return ok(c, rows[0]);
  } catch (err) {
    return serverError(c, 'PATCH /recurring/:id', err);
  }
});

// DELETE /recurring/:id — soft delete via status=ended
app.delete('/:id', async (c) => {
  const id = uuid.safeParse(c.req.param('id'));
  if (!id.success) return fail(c, 'Invalid recurring transaction id', 400);

  try {
    if (!(await ownedSeries(c.env, id.data))) {
      return fail(c, 'Recurring transaction not found', 404);
    }

    const db = getDb(c.env.DB);
    await db
      .update(recurringTransactions)
      .set({ status: 'ended', updatedAt: new Date().toISOString() })
      .where(
        and(
          eq(recurringTransactions.id, id.data),
          eq(recurringTransactions.householdId, currentHouseholdId()),
        ),
      );

    return c.body(null, 204);
  } catch (err) {
    return serverError(c, 'DELETE /recurring/:id', err);
  }
});

export default app;
