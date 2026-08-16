import Decimal from 'decimal.js';
import type { CategoryTrendMonth } from '@/api/types';

/**
 * Month-over-month comparisons behind the projection panel's "Spent MTD" and
 * "Biggest mover" figures.
 *
 * Input is the trailing buckets from `GET /reports/category-trend`, newest
 * first, each covering the same day-of-month span so mid-month comparisons are
 * like-for-like.
 */

export type Direction = 'above' | 'below' | 'even';

export interface SpendComparison {
  direction: Direction;
  /** Whole percent difference from the average. */
  percent: number;
}

export interface Mover {
  category: string;
  /** Signed decimal string: positive means more was spent than last month. */
  change: string;
  /** The month compared against, as YYYY-MM. */
  previousMonth: string;
}

/** Total expense spend in a bucket, as a positive magnitude. */
export function bucketSpend(month: CategoryTrendMonth): string {
  const total = month.expenses.reduce(
    (sum, item) => sum.plus(new Decimal(item.total).abs()),
    new Decimal(0),
  );
  return total.toString();
}

/** Mean spend across the given buckets. Null when there are none. */
export function averageSpend(months: CategoryTrendMonth[]): string | null {
  if (months.length === 0) return null;

  const total = months.reduce(
    (sum, month) => sum.plus(bucketSpend(month)),
    new Decimal(0),
  );

  return total.dividedBy(months.length).toDecimalPlaces(2).toString();
}

/**
 * How current spend compares with the trailing average.
 *
 * Null when there is no average to compare against, including an average of
 * zero — the panel hides the sub-line rather than rendering an infinite
 * percentage.
 */
export function spendVsAverage(current: string, average: string | null): SpendComparison | null {
  if (average === null) return null;

  const mean = new Decimal(average);
  if (mean.isZero()) return null;

  const spend = new Decimal(current);
  if (spend.equals(mean)) return { direction: 'even', percent: 0 };

  const percent = spend.minus(mean).dividedBy(mean).abs().times(100).toDecimalPlaces(0).toNumber();

  return {
    direction: spend.greaterThan(mean) ? 'above' : 'below',
    percent,
  };
}

/** Per-category spend magnitudes for one bucket. */
function spendByCategory(month: CategoryTrendMonth): Map<string, Decimal> {
  const totals = new Map<string, Decimal>();

  for (const item of month.expenses) {
    const running = totals.get(item.category) ?? new Decimal(0);
    totals.set(item.category, running.plus(new Decimal(item.total).abs()));
  }

  return totals;
}

/**
 * The category whose spend moved most between the two most recent buckets.
 *
 * Ranked by absolute change, so a large drop outranks a small rise. Ties go to
 * the larger current spend. A category present in only one bucket is treated
 * as having spent nothing in the other.
 *
 * Null when there is no previous bucket to compare against, or when nothing
 * moved — there is no mover to name.
 */
export function biggestMover(months: CategoryTrendMonth[]): Mover | null {
  if (months.length < 2) return null;

  const current = spendByCategory(months[0]);
  const previous = spendByCategory(months[1]);
  const categories = new Set([...current.keys(), ...previous.keys()]);

  let best: { category: string; change: Decimal; current: Decimal } | null = null;

  for (const category of categories) {
    const now = current.get(category) ?? new Decimal(0);
    const then = previous.get(category) ?? new Decimal(0);
    const change = now.minus(then);

    if (change.isZero()) continue;

    const beatsBest =
      best === null ||
      change.abs().greaterThan(best.change.abs()) ||
      (change.abs().equals(best.change.abs()) && now.greaterThan(best.current));

    if (beatsBest) {
      best = { category, change, current: now };
    }
  }

  if (best === null) return null;

  return {
    category: best.category,
    change: best.change.toString(),
    previousMonth: months[1].month,
  };
}
