/**
 * Reports — ported from `backend/src/api/reports.ts` (#68), and the one place
 * the Express app did money arithmetic in the database (#69).
 *
 * `categoryTotals` was `SUM(${transactions.amount})`. On Postgres the column
 * was NUMERIC and that sum was exact. On D1 the column is TEXT, and SQLite
 * coerces TEXT to a float to add it — so the single query the whole reporting
 * surface rests on would return binary floating point for money. It now reads
 * the rows and adds them with decimal.js, which is the invariant this project
 * has held everywhere else since epic #1.
 *
 * The trend and monthly endpoints called that query once per bucket, up to
 * twelve times. They now read their whole span once and bucket in JS: exact,
 * and one query instead of twelve against the free tier's ceiling (#95).
 */
import { Hono } from 'hono';
import Decimal from 'decimal.js';
import { and, asc, eq, gte, isNull, lte, or } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { accounts, transactions } from '../db/schema.js';
import { currentHouseholdId } from '../db/household.js';
import { ok, fail, serverError } from '../lib/envelope.js';
import {
  CategoryTrendQuerySchema,
  MonthlySummaryQuerySchema,
  ReportQuerySchema,
} from '../lib/validate.js';
import {
  computeTrendBuckets,
  splitByCategory,
  monthRange,
  monthBounds,
  compareMonths,
  groupUncategorized,
} from '../../../backend/src/services/reports.js';
import { toCsv } from '../../../backend/src/lib/csv.js';
import type { Env } from '../env.js';

interface DatedRow {
  date: string;
  category: string | null;
  amount: string;
}

/** Adds up category totals as money, never as floats. */
function sumTotals(rows: { total: string }[]): Decimal {
  return rows.reduce((sum, row) => sum.plus(new Decimal(row.total)), new Decimal(0));
}

/**
 * Category totals over the rows handed in, summed with decimal.js.
 *
 * Replaces `SUM(amount)` grouped in SQL. The grouping is trivial; the point is
 * that the addition happens where the project's money rules apply.
 */
function totalsByCategory(rows: { category: string | null; amount: string }[]) {
  const totals = new Map<string | null, Decimal>();
  for (const row of rows) {
    const current = totals.get(row.category) ?? new Decimal(0);
    totals.set(row.category, current.plus(new Decimal(row.amount)));
  }
  return [...totals].map(([category, total]) => ({ category, total: total.toFixed(2) }));
}

/** Rows for one account over one inclusive range, scoped to the household. */
async function rowsInRange(
  env: Env,
  accountId: string,
  startDate: string,
  endDate: string,
): Promise<DatedRow[]> {
  const db = getDb(env.DB);
  return db
    .select({
      date: transactions.date,
      category: transactions.category,
      amount: transactions.amount,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.accountId, accountId),
        eq(transactions.householdId, currentHouseholdId()),
        gte(transactions.date, startDate),
        lte(transactions.date, endDate),
      ),
    );
}

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

/** A CSV document as a download rather than as a page. */
function csvResponse(c: { body: (b: string, s: 200, h: Record<string, string>) => Response }, filename: string, body: string) {
  return c.body(body, 200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
  });
}

const app = new Hono<{ Bindings: Env }>();

// GET /reports/category-summary?accountId=&startDate=&endDate=
app.get('/category-summary', async (c) => {
  const parsed = ReportQuerySchema.safeParse(Object.fromEntries(new URL(c.req.url).searchParams));
  if (!parsed.success) return fail(c, parsed.error.flatten(), 400);

  const { accountId, startDate, endDate } = parsed.data;

  try {
    if (!(await ownedAccount(c.env, accountId))) return fail(c, 'Account not found', 404);
    const rows = await rowsInRange(c.env, accountId, startDate, endDate);
    return ok(c, splitByCategory(totalsByCategory(rows)));
  } catch (err) {
    return serverError(c, 'GET /reports/category-summary', err);
  }
});

// GET /reports/category-trend?accountId=&asOf=&months=
//
// Trailing category totals over same-day-of-month spans, so a mid-month
// comparison is like-for-like.
app.get('/category-trend', async (c) => {
  const parsed = CategoryTrendQuerySchema.safeParse(
    Object.fromEntries(new URL(c.req.url).searchParams),
  );
  if (!parsed.success) return fail(c, parsed.error.flatten(), 400);

  const { accountId, asOf, months: monthCount } = parsed.data;

  try {
    if (!(await ownedAccount(c.env, accountId))) return fail(c, 'Account not found', 404);

    const buckets = computeTrendBuckets(asOf, monthCount);
    // One read across the whole span, bucketed in JS. Express issued one
    // query per bucket — up to twelve of the fifty a Worker invocation gets.
    const span = {
      start: buckets.reduce((min, b) => (b.startDate < min ? b.startDate : min), buckets[0]!.startDate),
      end: buckets.reduce((max, b) => (b.endDate > max ? b.endDate : max), buckets[0]!.endDate),
    };
    const rows = await rowsInRange(c.env, accountId, span.start, span.end);

    const months = buckets.map((bucket) => {
      const inBucket = rows.filter((r) => r.date >= bucket.startDate && r.date <= bucket.endDate);
      return { ...bucket, ...splitByCategory(totalsByCategory(inBucket)) };
    });

    return ok(c, { months });
  } catch (err) {
    return serverError(c, 'GET /reports/category-trend', err);
  }
});

// GET /reports/transactions.csv?accountId=&startDate=&endDate=
//
// The same account and date filters the reports page uses, so what is
// exported is what is displayed. Amounts are written exactly as the API
// states them — an export that prettified them would not import back.
app.get('/transactions.csv', async (c) => {
  const parsed = ReportQuerySchema.safeParse(Object.fromEntries(new URL(c.req.url).searchParams));
  if (!parsed.success) return fail(c, parsed.error.flatten(), 400);

  const { accountId, startDate, endDate } = parsed.data;

  try {
    if (!(await ownedAccount(c.env, accountId))) return fail(c, 'Account not found', 404);

    const db = getDb(c.env.DB);
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
          eq(transactions.householdId, currentHouseholdId()),
          gte(transactions.date, startDate),
          lte(transactions.date, endDate),
        ),
      )
      .orderBy(asc(transactions.date), asc(transactions.description));

    const body = toCsv(
      ['date', 'description', 'amount', 'category'],
      rows.map((row) => [String(row.date), row.description, String(row.amount), row.category ?? '']),
    );

    return csvResponse(c, `transactions-${startDate}-to-${endDate}.csv`, body);
  } catch (err) {
    return serverError(c, 'GET /reports/transactions.csv', err);
  }
});

// GET /reports/category-summary.csv?accountId=&startDate=&endDate=
app.get('/category-summary.csv', async (c) => {
  const parsed = ReportQuerySchema.safeParse(Object.fromEntries(new URL(c.req.url).searchParams));
  if (!parsed.success) return fail(c, parsed.error.flatten(), 400);

  const { accountId, startDate, endDate } = parsed.data;

  try {
    if (!(await ownedAccount(c.env, accountId))) return fail(c, 'Account not found', 404);

    const rows = await rowsInRange(c.env, accountId, startDate, endDate);
    const split = splitByCategory(totalsByCategory(rows));
    const csvRows = (['income', 'expenses', 'transfers'] as const).flatMap((section) =>
      split[section].map((item) => [section, item.category, item.total]),
    );

    return csvResponse(
      c,
      `category-summary-${startDate}-to-${endDate}.csv`,
      toCsv(['section', 'category', 'total'], csvRows),
    );
  } catch (err) {
    return serverError(c, 'GET /reports/category-summary.csv', err);
  }
});

// GET /reports/monthly?accountId=&startMonth=&endMonth=
app.get('/monthly', async (c) => {
  const parsed = MonthlySummaryQuerySchema.safeParse(
    Object.fromEntries(new URL(c.req.url).searchParams),
  );
  if (!parsed.success) return fail(c, parsed.error.flatten(), 400);

  const { accountId, startMonth, endMonth } = parsed.data;

  try {
    if (!(await ownedAccount(c.env, accountId))) return fail(c, 'Account not found', 404);

    const months = monthRange(startMonth, endMonth);
    const span = {
      start: monthBounds(months[0]!).startDate,
      end: monthBounds(months[months.length - 1]!).endDate,
    };
    const rows = await rowsInRange(c.env, accountId, span.start, span.end);

    const buckets = months.map((month) => {
      const { startDate, endDate } = monthBounds(month);
      const inMonth = rows.filter((r) => r.date >= startDate && r.date <= endDate);
      const { income, expenses } = splitByCategory(totalsByCategory(inMonth));

      // Largest first, ties by name, so the order does not follow whatever
      // the grouping happened to produce.
      const categories = [...income, ...expenses].sort((a, b) => {
        const bySize = new Decimal(b.total).abs().comparedTo(new Decimal(a.total).abs());
        return bySize !== 0 ? bySize : a.category.localeCompare(b.category);
      });

      return { month, categories, income, expenses };
    });

    const compared = compareMonths(buckets);
    const result = compared.map((month, index) => {
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

    return ok(c, { months: result });
  } catch (err) {
    return serverError(c, 'GET /reports/monthly', err);
  }
});

// GET /reports/uncategorized
//
// Deliberately unscoped by account: batch-categorize matches on normalized
// description across every account, so a per-account count here would promise
// a smaller change than the assignment makes. Scoped by household, though —
// that boundary is not the same thing as the account one.
//
// A row qualifies only while categorySource is still 'auto'. A user who filed
// something under Other, or cleared its category outright, has decided.
app.get('/uncategorized', async (c) => {
  try {
    const db = getDb(c.env.DB);
    const rows = await db
      .select({
        description: transactions.description,
        amount: transactions.amount,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.householdId, currentHouseholdId()),
          eq(transactions.categorySource, 'auto'),
          or(isNull(transactions.category), eq(transactions.category, 'Other')),
        ),
      );

    return ok(c, groupUncategorized(rows));
  } catch (err) {
    return serverError(c, 'GET /reports/uncategorized', err);
  }
});

export default app;
