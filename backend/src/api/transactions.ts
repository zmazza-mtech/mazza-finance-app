import { Router, Request, Response } from 'express';
import { and, asc, desc, eq, gte, isNull, lte } from 'drizzle-orm';
import { getDb } from '../db/client';
import { transactions } from '../db/schema';
import { categorize, normalizeDescription } from '../services/categorize';
import {
  CreateManualTransactionSchema,
  UpdateManualTransactionSchema,
  BatchCategorizeSchema,
  TransactionsQuerySchema,
  UuidParamSchema,
} from '../lib/validate';
import { logger } from '../lib/logger';

const router = Router();

// Column map for dynamic ORDER BY
const SORT_COLUMNS = {
  date: transactions.date,
  amount: transactions.amount,
  description: transactions.description,
  category: transactions.category,
} as const;

// GET /transactions?accountId=&startDate=&endDate=&sortBy=&sortDir=&category=
router.get('/', async (req: Request, res: Response) => {
  const parsed = TransactionsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ data: null, error: parsed.error.flatten() });
  }

  const { accountId, startDate, endDate, sortBy, sortDir, category } = parsed.data;

  try {
    const db = getDb();
    const conditions = [];
    if (accountId) conditions.push(eq(transactions.accountId, accountId));
    if (startDate) conditions.push(gte(transactions.date, startDate));
    if (endDate) conditions.push(lte(transactions.date, endDate));
    if (category) conditions.push(eq(transactions.category, category));

    const orderCol = sortBy && sortBy in SORT_COLUMNS
      ? SORT_COLUMNS[sortBy as keyof typeof SORT_COLUMNS]
      : transactions.date;
    const orderFn = sortDir === 'asc' ? asc : desc;

    const rows = await db
      .select()
      .from(transactions)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(orderFn(orderCol));

    res.json({ data: rows, error: null });
  } catch (err) {
    logger.error('GET /transactions failed', { message: err instanceof Error ? err.message : String(err) });
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
        category: parsed.data.category ?? categorize(parsed.data.description),
        type: 'manual',
        status: 'posted',
      })
      .returning();

    res.status(201).json({ data: rows[0], error: null });
  } catch (err) {
    logger.error('POST /transactions failed', { message: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ data: null, error: 'Internal server error' });
  }
});

// PATCH /transactions/:id
// Category can be updated on any transaction type.
// Date, description, and amount can only be updated on manual transactions.
router.patch('/:id', async (req: Request, res: Response) => {
  const paramParsed = UuidParamSchema.safeParse(req.params);
  if (!paramParsed.success) {
    return res.status(400).json({ data: null, error: 'Invalid transaction id' });
  }

  const parsed = UpdateManualTransactionSchema.safeParse(req.body);
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
      .from(transactions)
      .where(eq(transactions.id, paramParsed.data.id))
      .limit(1);

    if (existing.length === 0) {
      return res.status(404).json({ data: null, error: 'Transaction not found' });
    }

    const hasDataFields =
      parsed.data.date !== undefined ||
      parsed.data.description !== undefined ||
      parsed.data.amount !== undefined;

    if (existing[0]!.type !== 'manual' && hasDataFields) {
      return res.status(403).json({ data: null, error: 'Only category can be edited on bank transactions' });
    }

    const setFields = { updatedAt: new Date() } as Record<string, unknown>;
    if (parsed.data.date !== undefined) setFields['date'] = parsed.data.date;
    if (parsed.data.description !== undefined) setFields['description'] = parsed.data.description;
    if (parsed.data.amount !== undefined) setFields['amount'] = parsed.data.amount;
    if ('category' in parsed.data) setFields['category'] = parsed.data.category;

    const rows = await db
      .update(transactions)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .set(setFields as any)
      .where(eq(transactions.id, paramParsed.data.id))
      .returning();

    res.json({ data: rows[0], error: null });
  } catch (err) {
    logger.error('PATCH /transactions/:id failed', { message: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ data: null, error: 'Internal server error' });
  }
});

// DELETE /transactions/:id (manual entries only)
router.delete('/:id', async (req: Request, res: Response) => {
  const paramParsed = UuidParamSchema.safeParse(req.params);
  if (!paramParsed.success) {
    return res.status(400).json({ data: null, error: 'Invalid transaction id' });
  }

  try {
    const db = getDb();

    const existing = await db
      .select()
      .from(transactions)
      .where(eq(transactions.id, paramParsed.data.id))
      .limit(1);

    if (existing.length === 0) {
      return res.status(404).json({ data: null, error: 'Transaction not found' });
    }

    if (existing[0]!.type !== 'manual') {
      return res.status(403).json({ data: null, error: 'Only manual transactions can be deleted' });
    }

    await db.delete(transactions).where(eq(transactions.id, paramParsed.data.id));
    res.status(204).send();
  } catch (err) {
    logger.error('DELETE /transactions/:id failed', { message: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ data: null, error: 'Internal server error' });
  }
});

// POST /transactions/batch-categorize — update all transactions whose normalized
// description matches, so "DBT CRD 0407 ... TSTDRIP KITCHEN" and
// "DBT CRD 0937 ... TSTDRIP KITCHEN" both get categorized.
router.post('/batch-categorize', async (req: Request, res: Response) => {
  const parsed = BatchCategorizeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ data: null, error: parsed.error.flatten() });
  }

  const { description, category } = parsed.data;
  const targetNormalized = normalizeDescription(description).toLowerCase();

  try {
    const db = getDb();

    // Fetch all transaction IDs + descriptions, filter by normalized match in JS
    const all = await db
      .select({ id: transactions.id, description: transactions.description })
      .from(transactions);

    const matchingIds = all
      .filter((t) => normalizeDescription(t.description).toLowerCase() === targetNormalized)
      .map((t) => t.id);

    if (matchingIds.length === 0) {
      return res.json({ data: { updated: 0 }, error: null });
    }

    let updated = 0;
    for (const id of matchingIds) {
      await db
        .update(transactions)
        .set({ category, updatedAt: new Date() })
        .where(eq(transactions.id, id));
      updated++;
    }

    res.json({ data: { updated }, error: null });
  } catch (err) {
    logger.error('POST /transactions/batch-categorize failed', { message: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ data: null, error: 'Internal server error' });
  }
});

// POST /transactions/backfill-categories — one-time backfill for existing data
router.post('/backfill-categories', async (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const uncategorized = await db
      .select({ id: transactions.id, description: transactions.description })
      .from(transactions)
      .where(isNull(transactions.category));

    let updated = 0;
    for (const row of uncategorized) {
      const cat = categorize(row.description);
      if (cat) {
        await db
          .update(transactions)
          .set({ category: cat, updatedAt: new Date() })
          .where(eq(transactions.id, row.id));
        updated++;
      }
    }

    res.json({ data: { updated, total: uncategorized.length }, error: null });
  } catch (err) {
    logger.error('POST /transactions/backfill-categories failed', { message: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ data: null, error: 'Internal server error' });
  }
});

export default router;
