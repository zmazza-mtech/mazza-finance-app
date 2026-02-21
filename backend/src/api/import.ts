import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { and, eq, gte, lte } from 'drizzle-orm';
import { getDb } from '../db/client';
import { accounts, transactions } from '../db/schema';
import { logger } from '../lib/logger';

const router = Router();

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD');

const decimalAmount = z
  .string()
  .regex(/^-?\d+(\.\d{1,2})?$/, 'Must be a decimal amount (e.g. "-15.99")');

const ImportRowSchema = z.object({
  date: dateString,
  description: z.string().min(1).max(255),
  amount: decimalAmount,
});

const ImportCsvBodySchema = z.object({
  accountId: z.string().uuid(),
  transactions: z.array(ImportRowSchema).min(1).max(5000),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalize an amount string to 2 decimal places for dedup key comparison.
 * Uses parseFloat intentionally — this is comparison only, not financial math.
 */
function normalizeAmount(amount: string): string {
  return parseFloat(amount).toFixed(2);
}

// ---------------------------------------------------------------------------
// POST /import/csv
// ---------------------------------------------------------------------------

router.post('/csv', async (req: Request, res: Response) => {
  const parsed = ImportCsvBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ data: null, error: parsed.error.flatten() });
  }

  const { accountId, transactions: rows } = parsed.data;

  try {
    const db = getDb();

    // Verify the account exists before attempting any inserts.
    const accountRows = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.id, accountId));
    if (accountRows.length === 0) {
      return res.status(400).json({ data: null, error: 'Account not found' });
    }

    // Get the date range covered by this import for an efficient dedup query.
    const sortedDates = [...rows].map((r) => r.date).sort();
    const minDate = sortedDates[0]!;
    const maxDate = sortedDates[sortedDates.length - 1]!;

    // Fetch existing transactions in the date range to deduplicate.
    const existing = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.accountId, accountId),
          gte(transactions.date, minDate),
          lte(transactions.date, maxDate),
        ),
      );

    // Build a set keyed by "date|description|normalized-amount".
    const existingKeys = new Set(
      existing.map(
        (t) =>
          `${String(t.date)}|${t.description}|${normalizeAmount(String(t.amount))}`,
      ),
    );

    let skipped = 0;
    const toInsert: Array<{
      accountId: string;
      date: string;
      description: string;
      amount: string;
      type: 'manual';
      status: 'posted';
    }> = [];

    for (const row of rows) {
      const key = `${row.date}|${row.description}|${normalizeAmount(row.amount)}`;
      if (existingKeys.has(key)) {
        skipped++;
      } else {
        toInsert.push({
          accountId,
          date: row.date,
          description: row.description,
          amount: row.amount,
          type: 'manual',
          status: 'posted',
        });
      }
    }

    if (toInsert.length > 0) {
      await db.insert(transactions).values(toInsert);
    }

    logger.info('CSV import complete', {
      accountId,
      imported: toInsert.length,
      skipped,
    });

    res.json({
      data: { imported: toInsert.length, skipped, errors: [] },
      error: null,
    });
  } catch (err) {
    logger.error('POST /import/csv failed', {
      message: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ data: null, error: 'Internal server error' });
  }
});

export default router;
