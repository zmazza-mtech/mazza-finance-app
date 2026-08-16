import Decimal from 'decimal.js';

export interface CategoryTotal {
  category: string;
  total: string;
}

export interface CategorySplit {
  income: CategoryTotal[];
  expenses: CategoryTotal[];
  transfers: CategoryTotal[];
}

export interface TrendBucket {
  /** YYYY-MM */
  month: string;
  /** YYYY-MM-DD, always the first of the month */
  startDate: string;
  /** YYYY-MM-DD, the same day-of-month as asOf, clamped to the month length */
  endDate: string;
}

/** Row shape as it comes back from the grouped transaction query. */
interface RawCategoryRow {
  category: string | null;
  total: string | null;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** Days in a 1-based month. Uses UTC so the host timezone cannot shift it. */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Builds the trailing month buckets behind biggest-mover and
 * spend-vs-average.
 *
 * Each bucket runs from the first of its month through the same day-of-month
 * as `asOf`, so a mid-month comparison is like-for-like: Aug 1–15 against
 * Jul 1–15, not against all of July. The end day is clamped to the month's
 * length, which is what keeps an asOf of the 31st from producing a February
 * 31st.
 *
 * Buckets are returned newest first; bucket 0 contains `asOf`.
 *
 * Dates are handled as integers rather than parsed into `Date`, because
 * `new Date('2026-01-01')` is UTC midnight and slips to the previous day in
 * any negative-offset timezone.
 */
export function computeTrendBuckets(asOf: string, months: number): TrendBucket[] {
  const parts = asOf.split('-');
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  const buckets: TrendBucket[] = [];

  for (let offset = 0; offset < months; offset += 1) {
    // Month arithmetic in a zero-based index, so a negative value borrows
    // cleanly from the previous year.
    const absolute = year * 12 + (month - 1) - offset;
    const bucketYear = Math.floor(absolute / 12);
    const bucketMonth = (absolute % 12) + 1;
    const endDay = Math.min(day, daysInMonth(bucketYear, bucketMonth));

    const prefix = `${bucketYear}-${pad(bucketMonth)}`;
    buckets.push({
      month: prefix,
      startDate: `${prefix}-01`,
      endDate: `${prefix}-${pad(endDay)}`,
    });
  }

  return buckets;
}

/**
 * Splits grouped category totals into income, expenses and transfers.
 *
 * Transfers are internal money movement and belong to neither side. A total of
 * exactly zero is dropped: it is neither money in nor money out, and showing
 * it would put a meaningless row in both summaries.
 *
 * Classification is a `Decimal` sign test. The amounts are money and never
 * pass through float arithmetic.
 */
export function splitByCategory(rows: RawCategoryRow[]): CategorySplit {
  const income: CategoryTotal[] = [];
  const expenses: CategoryTotal[] = [];
  const transfers: CategoryTotal[] = [];

  for (const row of rows) {
    const category = row.category ?? 'Other';
    const total = row.total ?? '0';
    const value = new Decimal(total);

    if (category === 'Transfers') {
      transfers.push({ category, total });
    } else if (value.isPositive() && !value.isZero()) {
      income.push({ category, total });
    } else if (value.isNegative() && !value.isZero()) {
      expenses.push({ category, total });
    }
  }

  return { income, expenses, transfers };
}
