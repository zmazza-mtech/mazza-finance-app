import Decimal from 'decimal.js';
import { normalizeDescription } from './categorize';

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

// ---------------------------------------------------------------------------
// Uncategorized review
// ---------------------------------------------------------------------------

/** A transaction with no useful category, as the review surface needs it. */
export interface UncategorizedRow {
  description: string;
  amount: string;
}

export interface UncategorizedGroup {
  /** Normalized description — the key batch-categorize matches on. */
  description: string;
  count: number;
  total: string;
}

export interface UncategorizedGroups {
  total: string;
  groups: UncategorizedGroup[];
}

/**
 * Collapses uncategorized transactions into one group per merchant.
 *
 * The grouping key is `normalizeDescription` lowercased — the same key
 * `POST /transactions/batch-categorize` matches on. Anything else would let a
 * group report a count that the bulk assignment then fails to honour, so the
 * two must not drift apart.
 *
 * Groups come back largest first by absolute amount: the point of the surface
 * is to put the biggest chunk of unclassified money at the top, and a signed
 * sort would bury a $500 charge under a $5 one. Ties break alphabetically so
 * the order does not wobble between requests.
 */
export function groupUncategorized(rows: UncategorizedRow[]): UncategorizedGroups {
  const byKey = new Map<string, { description: string; count: number; total: Decimal }>();

  for (const row of rows) {
    const normalized = normalizeDescription(row.description);
    const key = normalized.toLowerCase();
    const group = byKey.get(key) ?? { description: normalized, count: 0, total: new Decimal(0) };

    group.count += 1;
    group.total = group.total.plus(new Decimal(row.amount));
    byKey.set(key, group);
  }

  const groups = [...byKey.values()]
    .sort((a, b) => {
      const bySize = b.total.abs().comparedTo(a.total.abs());
      return bySize !== 0 ? bySize : a.description.localeCompare(b.description);
    })
    .map((group) => ({
      description: group.description,
      count: group.count,
      total: group.total.toFixed(2),
    }));

  const total = rows
    .reduce((sum, row) => sum.plus(new Decimal(row.amount)), new Decimal(0))
    .toFixed(2);

  return { total, groups };
}
