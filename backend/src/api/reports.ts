import { Router, Request, Response } from 'express';
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import { transactions } from '../db/schema';
import { ReportQuerySchema } from '../lib/validate';
import { logger } from '../lib/logger';

const router = Router();

// GET /reports/category-summary?accountId=&startDate=&endDate=
router.get('/category-summary', async (req: Request, res: Response) => {
  const parsed = ReportQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ data: null, error: parsed.error.flatten() });
  }

  const { accountId, startDate, endDate } = parsed.data;

  try {
    const db = getDb();
    const rows = await db
      .select({
        category: transactions.category,
        total: sql<string>`SUM(${transactions.amount})`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.accountId, accountId),
          gte(transactions.date, startDate),
          lte(transactions.date, endDate),
        ),
      )
      .groupBy(transactions.category);

    const income: Array<{ category: string; total: string }> = [];
    const expenses: Array<{ category: string; total: string }> = [];

    for (const row of rows) {
      const category = row.category ?? 'Other';
      const total = row.total ?? '0';
      const isPositive = !total.startsWith('-');

      if (isPositive && parseFloat(total) > 0) {
        income.push({ category, total });
      } else if (!isPositive) {
        expenses.push({ category, total });
      }
    }

    res.json({ data: { income, expenses }, error: null });
  } catch (err) {
    logger.error('GET /reports/category-summary failed', { message: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ data: null, error: 'Internal server error' });
  }
});

export default router;
