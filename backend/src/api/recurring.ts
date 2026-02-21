import { Router, Request, Response } from 'express';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../db/client';
import { recurringTransactions, recurringOverrides, transactions, accounts } from '../db/schema';
import { detectRecurring, type RawTransaction } from '../services/detection';
import {
  CreateRecurringSchema,
  UpdateRecurringSchema,
  CreateOverrideSchema,
  UuidParamSchema,
  OriginalDateParamSchema,
} from '../lib/validate';
import { logger } from '../lib/logger';

const router = Router();

const RecurringQuerySchema = z.object({ accountId: z.string().uuid() });

// Helper to validate :id + :originalDate path params together
const OverrideParamSchema = UuidParamSchema.merge(OriginalDateParamSchema);

// ---------------------------------------------------------------------------
// Recurring transactions
// ---------------------------------------------------------------------------

// GET /recurring?accountId=
router.get('/', async (req: Request, res: Response) => {
  const parsed = RecurringQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ data: null, error: parsed.error.flatten() });
  }

  const { accountId } = parsed.data;

  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(recurringTransactions)
      .where(eq(recurringTransactions.accountId, accountId))
      .orderBy(recurringTransactions.name);

    res.json({ data: rows, error: null });
  } catch (err) {
    logger.error('GET /recurring failed', { message: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ data: null, error: 'Internal server error' });
  }
});

// POST /recurring
router.post('/', async (req: Request, res: Response) => {
  const parsed = CreateRecurringSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ data: null, error: parsed.error.flatten() });
  }

  try {
    const db = getDb();
    const rows = await db
      .insert(recurringTransactions)
      .values({
        accountId: parsed.data.accountId,
        name: parsed.data.name,
        amount: parsed.data.amount,
        frequency: parsed.data.frequency,
        nextDate: parsed.data.nextDate,
        source: 'manual',
        status: 'active',
        ...(parsed.data.endDate !== undefined ? { endDate: parsed.data.endDate } : {}),
      })
      .returning();

    res.status(201).json({ data: rows[0], error: null });
  } catch (err) {
    logger.error('POST /recurring failed', { message: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ data: null, error: 'Internal server error' });
  }
});

// Grace period (in days) after nextDate before an active recurring is considered stale.
// Using 3× the expected interval gives one full missed period of buffer.
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

// POST /recurring/detect — analyze existing transactions and create pending_review rows,
// then expire any active recurring series whose nextDate is stale.
router.post('/detect', async (req: Request, res: Response) => {
  const parsed = z.object({ accountId: z.string().uuid() }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ data: null, error: parsed.error.flatten() });
  }

  const { accountId } = parsed.data;

  try {
    const db = getDb();

    // Verify account exists
    const accountRows = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.id, accountId))
      .limit(1);

    if (accountRows.length === 0) {
      return res.status(404).json({ data: null, error: 'Account not found' });
    }

    const serverToday = new Date().toISOString().slice(0, 10);

    // Fetch all transactions for this account (full history for best pattern detection)
    const txRows = await db
      .select()
      .from(transactions)
      .where(eq(transactions.accountId, accountId));

    // Fetch all recurring series for this account
    const allRecurring = await db
      .select()
      .from(recurringTransactions)
      .where(eq(recurringTransactions.accountId, accountId));

    const existingNames = new Set(
      allRecurring.map((r) => r.name.trim().toLowerCase()),
    );

    // ---------------------------------------------------------------------------
    // Step 1: Detect new patterns
    // ---------------------------------------------------------------------------

    const rawTxs: RawTransaction[] = txRows.map((t) => ({
      tellerId: t.id,
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

    // ---------------------------------------------------------------------------
    // Step 2: Expire stale active recurring series
    // A series is stale when its nextDate + grace period is still in the past,
    // meaning no occurrence has been seen for longer than the grace window.
    // ---------------------------------------------------------------------------

    const staleIds: string[] = [];
    const staleEndDates: Record<string, string> = {};

    for (const r of allRecurring) {
      if (r.status !== 'active') continue;
      const graceDays = STALE_GRACE_DAYS[r.frequency] ?? 90;
      const cutoff = addDaysToDateStr(String(r.nextDate), graceDays);
      if (cutoff < serverToday) {
        staleIds.push(r.id);
        staleEndDates[r.id] = String(r.nextDate);
      }
    }

    if (staleIds.length > 0) {
      // Update each stale series individually to set the correct endDate per row
      for (const id of staleIds) {
        await db
          .update(recurringTransactions)
          .set({ status: 'ended', endDate: staleEndDates[id]!, updatedAt: new Date() })
          .where(eq(recurringTransactions.id, id));
      }
    }

    logger.info('POST /recurring/detect completed', {
      accountId,
      detected: insertedCount,
      expired: staleIds.length,
    });

    res.json({ data: { detected: insertedCount, expired: staleIds.length }, error: null });
  } catch (err) {
    logger.error('POST /recurring/detect failed', { message: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ data: null, error: 'Internal server error' });
  }
});

// PATCH /recurring/:id
router.patch('/:id', async (req: Request, res: Response) => {
  const paramParsed = UuidParamSchema.safeParse(req.params);
  if (!paramParsed.success) {
    return res.status(400).json({ data: null, error: 'Invalid recurring transaction id' });
  }

  const bodyParsed = UpdateRecurringSchema.safeParse(req.body);
  if (!bodyParsed.success) {
    return res.status(400).json({ data: null, error: bodyParsed.error.flatten() });
  }

  if (Object.keys(bodyParsed.data).length === 0) {
    return res.status(400).json({ data: null, error: 'No fields to update' });
  }

  try {
    const db = getDb();

    const existing = await db
      .select()
      .from(recurringTransactions)
      .where(eq(recurringTransactions.id, paramParsed.data.id))
      .limit(1);

    if (existing.length === 0) {
      return res.status(404).json({ data: null, error: 'Recurring transaction not found' });
    }

    const setFields = { updatedAt: new Date() } as Record<string, unknown>;
    if (bodyParsed.data.name !== undefined) setFields['name'] = bodyParsed.data.name;
    if (bodyParsed.data.amount !== undefined) setFields['amount'] = bodyParsed.data.amount;
    if (bodyParsed.data.frequency !== undefined) setFields['frequency'] = bodyParsed.data.frequency;
    if (bodyParsed.data.nextDate !== undefined) setFields['nextDate'] = bodyParsed.data.nextDate;
    if (bodyParsed.data.endDate !== undefined) setFields['endDate'] = bodyParsed.data.endDate;
    if (bodyParsed.data.status !== undefined) setFields['status'] = bodyParsed.data.status;

    const rows = await db
      .update(recurringTransactions)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .set(setFields as any)
      .where(eq(recurringTransactions.id, paramParsed.data.id))
      .returning();

    res.json({ data: rows[0], error: null });
  } catch (err) {
    logger.error('PATCH /recurring/:id failed', { message: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ data: null, error: 'Internal server error' });
  }
});

// DELETE /recurring/:id (soft delete via status=ended)
router.delete('/:id', async (req: Request, res: Response) => {
  const paramParsed = UuidParamSchema.safeParse(req.params);
  if (!paramParsed.success) {
    return res.status(400).json({ data: null, error: 'Invalid recurring transaction id' });
  }

  try {
    const db = getDb();

    const existing = await db
      .select()
      .from(recurringTransactions)
      .where(eq(recurringTransactions.id, paramParsed.data.id))
      .limit(1);

    if (existing.length === 0) {
      return res.status(404).json({ data: null, error: 'Recurring transaction not found' });
    }

    await db
      .update(recurringTransactions)
      .set({ status: 'ended', updatedAt: new Date() })
      .where(eq(recurringTransactions.id, paramParsed.data.id));

    res.status(204).send();
  } catch (err) {
    logger.error('DELETE /recurring/:id failed', { message: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ data: null, error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// Recurring overrides (single-instance edits)
// ---------------------------------------------------------------------------

// GET /recurring/:id/overrides
router.get('/:id/overrides', async (req: Request, res: Response) => {
  const paramParsed = UuidParamSchema.safeParse(req.params);
  if (!paramParsed.success) {
    return res.status(400).json({ data: null, error: 'Invalid recurring transaction id' });
  }

  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(recurringOverrides)
      .where(eq(recurringOverrides.recurringTransactionId, paramParsed.data.id))
      .orderBy(recurringOverrides.originalDate);

    res.json({ data: rows, error: null });
  } catch (err) {
    logger.error('GET /recurring/:id/overrides failed', { message: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ data: null, error: 'Internal server error' });
  }
});

// POST /recurring/:id/overrides/:originalDate
router.post('/:id/overrides/:originalDate', async (req: Request, res: Response) => {
  const paramParsed = OverrideParamSchema.safeParse(req.params);
  if (!paramParsed.success) {
    return res.status(400).json({ data: null, error: 'Invalid id or date format (expected YYYY-MM-DD)' });
  }

  const bodyParsed = CreateOverrideSchema.safeParse(req.body);
  if (!bodyParsed.success) {
    return res.status(400).json({ data: null, error: bodyParsed.error.flatten() });
  }

  const { id, originalDate } = paramParsed.data;

  try {
    const db = getDb();

    // Verify parent recurring transaction exists
    const existing = await db
      .select()
      .from(recurringTransactions)
      .where(eq(recurringTransactions.id, id))
      .limit(1);

    if (existing.length === 0) {
      return res.status(404).json({ data: null, error: 'Recurring transaction not found' });
    }

    // Upsert override — one per (recurringId, originalDate)
    await db
      .insert(recurringOverrides)
      .values({
        recurringTransactionId: id,
        originalDate,
        overrideType: bodyParsed.data.overrideType,
        ...(bodyParsed.data.overrideDate !== undefined ? { overrideDate: bodyParsed.data.overrideDate } : {}),
        ...(bodyParsed.data.overrideAmount !== undefined ? { overrideAmount: bodyParsed.data.overrideAmount } : {}),
        ...(bodyParsed.data.overrideName !== undefined ? { overrideName: bodyParsed.data.overrideName } : {}),
      })
      .onConflictDoNothing();

    const rows = await db
      .select()
      .from(recurringOverrides)
      .where(
        and(
          eq(recurringOverrides.recurringTransactionId, id),
          eq(recurringOverrides.originalDate, originalDate)
        )
      )
      .limit(1);

    res.status(201).json({ data: rows[0], error: null });
  } catch (err) {
    logger.error('POST /recurring/:id/overrides/:date failed', { message: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ data: null, error: 'Internal server error' });
  }
});

// DELETE /recurring/:id/overrides/:originalDate
router.delete('/:id/overrides/:originalDate', async (req: Request, res: Response) => {
  const paramParsed = OverrideParamSchema.safeParse(req.params);
  if (!paramParsed.success) {
    return res.status(400).json({ data: null, error: 'Invalid id or date format (expected YYYY-MM-DD)' });
  }

  const { id, originalDate } = paramParsed.data;

  try {
    const db = getDb();
    await db
      .delete(recurringOverrides)
      .where(
        and(
          eq(recurringOverrides.recurringTransactionId, id),
          eq(recurringOverrides.originalDate, originalDate)
        )
      );

    res.status(204).send();
  } catch (err) {
    logger.error('DELETE /recurring/:id/overrides/:date failed', { message: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ data: null, error: 'Internal server error' });
  }
});

export default router;
