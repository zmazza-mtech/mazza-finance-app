import { Router, Request, Response } from 'express';
import { and, eq, gte, lte } from 'drizzle-orm';
import { getDb } from '../db/client';
import { transactions } from '../db/schema';
import {
  CreateManualTransactionSchema,
  UpdateManualTransactionSchema,
} from '../lib/validate';
import { logger } from '../lib/logger';

const router = Router();

// GET /transactions?accountId=&startDate=&endDate=
router.get('/', async (req: Request, res: Response) => {
  const { accountId, startDate, endDate } = req.query as Record<string, string | undefined>;

  if (!accountId) {
    return res.status(400).json({ data: null, error: 'accountId is required' });
  }

  try {
    const db = getDb();
    const conditions = [eq(transactions.accountId, accountId)];
    if (startDate) conditions.push(gte(transactions.date, startDate));
    if (endDate) conditions.push(lte(transactions.date, endDate));

    const rows = await db
      .select()
      .from(transactions)
      .where(and(...conditions))
      .orderBy(transactions.date);

    res.json({ data: rows, error: null });
  } catch (err) {
    logger.error('GET /transactions failed', { err });
    res.status(500).json({ data: null, error: 'Internal server error' });
  }
});

// POST /transactions (manual entries only)
router.post('/', async (req: Request, res: Response) => {
  const parsed = CreateManualTransactionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ data: null, error: parsed.error.flatten() });
  }

  try {
    const db = getDb();
    const rows = await db
      .insert(transactions)
      .values({
        ...parsed.data,
        type: 'manual',
        status: 'posted',
      })
      .returning();

    res.status(201).json({ data: rows[0], error: null });
  } catch (err) {
    logger.error('POST /transactions failed', { err });
    res.status(500).json({ data: null, error: 'Internal server error' });
  }
});

// PATCH /transactions/:id (manual entries only)
router.patch('/:id', async (req: Request, res: Response) => {
  const parsed = UpdateManualTransactionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ data: null, error: parsed.error.flatten() });
  }

  if (Object.keys(parsed.data).length === 0) {
    return res.status(400).json({ data: null, error: 'No fields to update' });
  }

  try {
    const db = getDb();

    // Verify it exists and is manual
    const existing = await db
      .select()
      .from(transactions)
      .where(eq(transactions.id, req.params.id!))
      .limit(1);

    if (existing.length === 0) {
      return res.status(404).json({ data: null, error: 'Transaction not found' });
    }

    if (existing[0]!.type !== 'manual') {
      return res.status(403).json({ data: null, error: 'Only manual transactions can be edited' });
    }

    const rows = await db
      .update(transactions)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(transactions.id, req.params.id!))
      .returning();

    res.json({ data: rows[0], error: null });
  } catch (err) {
    logger.error('PATCH /transactions/:id failed', { err });
    res.status(500).json({ data: null, error: 'Internal server error' });
  }
});

// DELETE /transactions/:id (manual entries only)
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const db = getDb();

    const existing = await db
      .select()
      .from(transactions)
      .where(eq(transactions.id, req.params.id!))
      .limit(1);

    if (existing.length === 0) {
      return res.status(404).json({ data: null, error: 'Transaction not found' });
    }

    if (existing[0]!.type !== 'manual') {
      return res.status(403).json({ data: null, error: 'Only manual transactions can be deleted' });
    }

    await db.delete(transactions).where(eq(transactions.id, req.params.id!));
    res.status(204).send();
  } catch (err) {
    logger.error('DELETE /transactions/:id failed', { err });
    res.status(500).json({ data: null, error: 'Internal server error' });
  }
});

export default router;
