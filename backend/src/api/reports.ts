import { Router, Request, Response } from 'express';
import Decimal from 'decimal.js';
import { and, asc, eq, gte, isNull, lte, or, sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import { transactions } from '../db/schema';
import {
  ReportQuerySchema,
  CategoryTrendQuerySchema,
  MonthlySummaryQuerySchema,
} from '../lib/validate';
import {
  compareMonths,
  computeTrendBuckets,
  groupUncategorized,
  monthBounds,
  monthRange,
  splitByCategory,
} from '../services/reports';
import { toCsv } from '../lib/csv';
import { logger } from '../lib/logger';

const router = Router();

/** Adds up category totals as money, never as floats. */
function sumTotals(rows: { total: string }[]): Decimal {
  return rows.reduce((sum, row) => sum.plus(new Decimal(row.total)), new Decimal(0));
}

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

/** Sends a CSV document as a download rather than as a page. */
function sendCsv(res: Response, filename: string, body: string): void {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(body);
}

// GET /reports/transactions.csv?accountId=&startDate=&endDate=
//
// The same account and date filters the reports page uses, so what is exported
// is what is displayed. Columns are named for what `POST /import/csv` reads,
// and amounts are written exactly as the API states them — an export that
// prettified them into "$1,250.00" would not import back.
router.get('/transactions.csv', async (req: Request, res: Response) => {
  const parsed = ReportQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ data: null, error: parsed.error.flatten() });
  }

  const { accountId, startDate, endDate } = parsed.data;

  try {
    const db = getDb();
    const rows = await db
      .select({
        date: transactions.date,
        description: transactions.description,
        amount: transactions.amount,
        category: transactions.category,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.accountId, accountId),
          gte(transactions.date, startDate),
          lte(transactions.date, endDate),
        ),
      )
      .orderBy(asc(transactions.date), asc(transactions.description));

    const body = toCsv(
      ['date', 'description', 'amount', 'category'],
      rows.map((row) => [String(row.date), row.description, String(row.amount), row.category ?? '']),
    );

    sendCsv(res, `transactions-${startDate}-to-${endDate}.csv`, body);
  } catch (err) {
    logger.error('GET /reports/transactions.csv failed', { message: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ data: null, error: 'Internal server error' });
  }
});

// GET /reports/category-summary.csv?accountId=&startDate=&endDate=
//
// The same split the reports page renders, with the section named on every row
// so income, expenses and transfers stay distinguishable in a spreadsheet that
// knows nothing about the sign convention.
router.get('/category-summary.csv', async (req: Request, res: Response) => {
  const parsed = ReportQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ data: null, error: parsed.error.flatten() });
  }

  const { accountId, startDate, endDate } = parsed.data;

  try {
    const split = splitByCategory(await categoryTotals(accountId, startDate, endDate));
    const rows = (['income', 'expenses', 'transfers'] as const).flatMap((section) =>
      split[section].map((item) => [section, item.category, item.total]),
    );

    sendCsv(
      res,
      `category-summary-${startDate}-to-${endDate}.csv`,
      toCsv(['section', 'category', 'total'], rows),
    );
  } catch (err) {
    logger.error('GET /reports/category-summary.csv failed', { message: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ data: null, error: 'Internal server error' });
  }
});

// GET /reports/monthly?accountId=&startMonth=&endMonth=
//
// Whole calendar months, every month in the range present whether or not it
// holds anything, each category carrying its movement against the month before.
//
// Transfers are left out of the totals and the category rows alike: they are
// money moving between the household's own accounts, and counting them would
// inflate both sides of a month that only shuffled savings around. That matches
// what the Sankey and the summary tables already do.
router.get('/monthly', async (req: Request, res: Response) => {
  const parsed = MonthlySummaryQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ data: null, error: parsed.error.flatten() });
  }

  const { accountId, startMonth, endMonth } = parsed.data;

  try {
    const buckets = await Promise.all(
      monthRange(startMonth, endMonth).map(async (month) => {
        const { startDate, endDate } = monthBounds(month);
        const { income, expenses } = splitByCategory(
          await categoryTotals(accountId, startDate, endDate),
        );

        // Largest first, ties by name, so the order does not follow whatever
        // GROUP BY happened to return.
        const categories = [...income, ...expenses].sort((a, b) => {
          const bySize = new Decimal(b.total).abs().comparedTo(new Decimal(a.total).abs());
          return bySize !== 0 ? bySize : a.category.localeCompare(b.category);
        });

        return { month, categories, income, expenses };
      }),
    );

    const compared = compareMonths(buckets);
    const months = compared.map((month, index) => {
      const bucket = buckets[index]!;
      const income = sumTotals(bucket.income);
      const expenses = sumTotals(bucket.expenses);

      return {
        ...month,
        income: income.toFixed(2),
        expenses: expenses.toFixed(2),
        net: income.plus(expenses).toFixed(2),
      };
    });

    res.json({ data: { months }, error: null });
  } catch (err) {
    logger.error('GET /reports/monthly failed', { message: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ data: null, error: 'Internal server error' });
  }
});

// GET /reports/uncategorized
//
// Everything with no useful category, grouped by merchant, biggest first.
//
// Deliberately unscoped by account: `POST /transactions/batch-categorize`
// matches on normalized description across every account, so a per-account
// count here would promise a smaller change than the assignment makes.
//
// A row qualifies only while `categorySource` is still 'auto'. A user who
// filed something under Other, or cleared its category outright, has decided —
// re-listing it would nag them about their own choice, the same principle that
// keeps re-categorization off a corrected row.
router.get('/uncategorized', async (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const rows = await db
      .select({
        description: transactions.description,
        amount: transactions.amount,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.categorySource, 'auto'),
          or(isNull(transactions.category), eq(transactions.category, 'Other')),
        ),
      );

    res.json({ data: groupUncategorized(rows), error: null });
  } catch (err) {
    logger.error('GET /reports/uncategorized failed', { message: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ data: null, error: 'Internal server error' });
  }
});

export default router;
