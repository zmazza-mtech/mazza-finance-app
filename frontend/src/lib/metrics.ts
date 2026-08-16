import Decimal from 'decimal.js';
import type { ForecastDay } from '@/api/types';

/**
 * Derived values behind the projection panel and the calendar spend bars.
 *
 * Every money value is a decimal string in and a decimal string out — these
 * feed a financial forecast and never pass through float arithmetic. The two
 * exceptions are `spendIntensity` and `spendLevel`, which produce a ratio for
 * pixel geometry.
 */

export type SpendLevel = 'heavy' | 'moderate' | 'light';

export interface LowPoint {
  date: string;
  balance: string;
}

/**
 * What a day cost: the absolute sum of its negative amounts.
 *
 * Income does not offset it. A day with a $2,400 paycheque and a $50 grocery
 * run spent $50, not nothing — the spend bar is about outflow, and netting the
 * two would hide it.
 */
export function daySpend(day: ForecastDay): string {
  const total = day.transactions.reduce((sum, t) => {
    const amount = new Decimal(t.amount);
    return amount.isNegative() ? sum.plus(amount.abs()) : sum;
  }, new Decimal(0));

  return total.toString();
}

/** The heaviest single day in the range. Zero when nothing was spent. */
export function maxDailySpend(days: ForecastDay[]): string {
  const max = days.reduce((highest, day) => {
    const spend = new Decimal(daySpend(day));
    return spend.greaterThan(highest) ? spend : highest;
  }, new Decimal(0));

  return max.toString();
}

/** Total spend from the start of the range through `throughDate`, inclusive. */
export function spentThrough(days: ForecastDay[], throughDate: string): string {
  const total = days.reduce((sum, day) => {
    // ISO dates compare correctly as strings.
    return day.date <= throughDate ? sum.plus(daySpend(day)) : sum;
  }, new Decimal(0));

  return total.toString();
}

/**
 * Average spend per elapsed day. Null when no days have elapsed, which the
 * panel renders as an em dash rather than a divide-by-zero.
 */
export function burnRate(spent: string, daysElapsed: number): string | null {
  if (daysElapsed <= 0) return null;
  return new Decimal(spent).dividedBy(daysElapsed).toDecimalPlaces(2).toString();
}

/**
 * Whole days the projected end balance covers at the current burn rate.
 *
 * Null when there is no burn rate to divide by. Zero — not a negative number —
 * once the end balance is at or below zero, because "minus three days of
 * runway" is not a thing a reader can act on.
 */
export function runway(endBalanceValue: string, rate: string | null): number | null {
  if (rate === null) return null;

  const burn = new Decimal(rate);
  if (burn.isZero()) return null;

  const balance = new Decimal(endBalanceValue);
  if (balance.lessThanOrEqualTo(0)) return 0;

  return balance.dividedBy(burn).floor().toNumber();
}

/** The lowest the balance gets, and when. Ties resolve to the earliest date. */
export function lowPoint(days: ForecastDay[]): LowPoint | null {
  let lowest: LowPoint | null = null;

  for (const day of days) {
    if (lowest === null || new Decimal(day.runningBalance).lessThan(lowest.balance)) {
      lowest = { date: day.date, balance: day.runningBalance };
    }
  }

  return lowest;
}

/** The balance the range ends on. */
export function endBalance(days: ForecastDay[]): string | null {
  return days.length === 0 ? null : days[days.length - 1].runningBalance;
}

/**
 * A day's spend as a fraction of the heaviest day, for the spend-bar height.
 * Float, because it resolves to a pixel measurement.
 */
export function spendIntensity(spend: string, maxSpend: string): number {
  const max = new Decimal(maxSpend);
  if (max.isZero()) return 0;
  return new Decimal(spend).dividedBy(max).toNumber();
}

/** Bands the spend-bar colour. Thresholds are exclusive, per the design. */
export function spendLevel(ratio: number): SpendLevel {
  if (ratio > 0.55) return 'heavy';
  if (ratio > 0.25) return 'moderate';
  return 'light';
}
