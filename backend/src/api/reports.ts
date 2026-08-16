import { Router, Request, Response } from 'express';
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import { transactions } from '../db/schema';
import { ReportQuerySchema, CategoryTrendQuerySchema } from '../lib/validate';
import { computeTrendBuckets, splitByCategory } from '../services/reports';
import { logger } from '../lib/logger';

const router = Router();

/** Category totals for one account over one inclusive date range. */
async function categoryTotals(accountId: string, startDate: string, endDate: string) {
  const db = getDb();
  return db
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
}

// GET /reports/category-summary?accountId=&startDate=&endDate=
router.get('/category-summary', async (req: Request, res: Response) => {
  const parsed = ReportQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ data: null, error: parsed.error.flatten() });
  }

  const { accountId, startDate, endDate } = parsed.data;

  try {
    const rows = await categoryTotals(accountId, startDate, endDate);
    res.json({ data: splitByCategory(rows), error: null });
  } catch (err) {
    logger.error('GET /reports/category-summary failed', { message: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ data: null, error: 'Internal server error' });
  }
});

// GET /reports/category-trend?accountId=&asOf=&months=
//
// Trailing category totals over same-day-of-month spans, so a mid-month
// comparison is like-for-like. Feeds the projection panel's biggest-mover and
// spend-vs-average figures from a single request.
router.get('/category-trend', async (req: Request, res: Response) => {
  const parsed = CategoryTrendQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ data: null, error: parsed.error.flatten() });
  }

  const { accountId, asOf, months: monthCount } = parsed.data;

  try {
    const buckets = computeTrendBuckets(asOf, monthCount);
    const months = await Promise.all(
      buckets.map(async (bucket) => {
        const rows = await categoryTotals(accountId, bucket.startDate, bucket.endDate);
        return { ...bucket, ...splitByCategory(rows) };
      }),
    );

    res.json({ data: { months }, error: null });
  } catch (err) {
    logger.error('GET /reports/category-trend failed', { message: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ data: null, error: 'Internal server error' });
  }
});

export default router;
