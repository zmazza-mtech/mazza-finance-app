import { Router, Request, Response } from 'express';
import { and, eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import { recurringTransactions, recurringOverrides } from '../db/schema';
import {
  CreateRecurringSchema,
  UpdateRecurringSchema,
  CreateOverrideSchema,
} from '../lib/validate';
import { logger } from '../lib/logger';

const router = Router();

// ---------------------------------------------------------------------------
// Recurring transactions
// ---------------------------------------------------------------------------

// GET /recurring?accountId=
router.get('/', async (req: Request, res: Response) => {
  const { accountId } = req.query as Record<string, string | undefined>;

  if (!accountId) {
    return res.status(400).json({ data: null, error: 'accountId is required' });
  }

  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(recurringTransactions)
      .where(eq(recurringTransactions.accountId, accountId))
      .orderBy(recurringTransactions.name);

    res.json({ data: rows, error: null });
  } catch (err) {
    logger.error('GET /recurring failed', { err });
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
        ...parsed.data,
        source: 'manual',
        status: 'active',
      })
      .returning();

    res.status(201).json({ data: rows[0], error: null });
  } catch (err) {
    logger.error('POST /recurring failed', { err });
    res.status(500).json({ data: null, error: 'Internal server error' });
  }
});

// PATCH /recurring/:id
router.patch('/:id', async (req: Request, res: Response) => {
  const parsed = UpdateRecurringSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ data: null, error: parsed.error.flatten() });
  }

  if (Object.keys(parsed.data).length === 0) {
    return res.status(400).json({ data: null, error: 'No fields to update' });
  }

  try {
    const db = getDb();

    const existing = await db
      .select()
      .from(recurringTransactions)
      .where(eq(recurringTransactions.id, req.params.id!))
      .limit(1);

    if (existing.length === 0) {
      return res.status(404).json({ data: null, error: 'Recurring transaction not found' });
    }

    const rows = await db
      .update(recurringTransactions)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(recurringTransactions.id, req.params.id!))
      .returning();

    res.json({ data: rows[0], error: null });
  } catch (err) {
    logger.error('PATCH /recurring/:id failed', { err });
    res.status(500).json({ data: null, error: 'Internal server error' });
  }
});

// DELETE /recurring/:id (soft delete via status=ended)
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const db = getDb();

    const existing = await db
      .select()
      .from(recurringTransactions)
      .where(eq(recurringTransactions.id, req.params.id!))
      .limit(1);

    if (existing.length === 0) {
      return res.status(404).json({ data: null, error: 'Recurring transaction not found' });
    }

    await db
      .update(recurringTransactions)
      .set({ status: 'ended', updatedAt: new Date() })
      .where(eq(recurringTransactions.id, req.params.id!));

    res.status(204).send();
  } catch (err) {
    logger.error('DELETE /recurring/:id failed', { err });
    res.status(500).json({ data: null, error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// Recurring overrides (single-instance edits)
// ---------------------------------------------------------------------------

// GET /recurring/:id/overrides
router.get('/:id/overrides', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(recurringOverrides)
      .where(eq(recurringOverrides.recurringTransactionId, req.params.id!))
      .orderBy(recurringOverrides.originalDate);

    res.json({ data: rows, error: null });
  } catch (err) {
    logger.error('GET /recurring/:id/overrides failed', { err });
    res.status(500).json({ data: null, error: 'Internal server error' });
  }
});

// POST /recurring/:id/overrides/:originalDate
router.post('/:id/overrides/:originalDate', async (req: Request, res: Response) => {
  const parsed = CreateOverrideSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ data: null, error: parsed.error.flatten() });
  }

  const { id, originalDate } = req.params as { id: string; originalDate: string };

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
        ...parsed.data,
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
    logger.error('POST /recurring/:id/overrides/:date failed', { err });
    res.status(500).json({ data: null, error: 'Internal server error' });
  }
});

// DELETE /recurring/:id/overrides/:originalDate
router.delete('/:id/overrides/:originalDate', async (req: Request, res: Response) => {
  const { id, originalDate } = req.params as { id: string; originalDate: string };

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
    logger.error('DELETE /recurring/:id/overrides/:date failed', { err });
    res.status(500).json({ data: null, error: 'Internal server error' });
  }
});

export default router;
