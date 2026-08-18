import Decimal from 'decimal.js';
import { matchInstancesToActuals } from './reconciliation.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Frequency = 'weekly' | 'biweekly' | 'monthly' | 'yearly';
export type RecurringStatus = 'active' | 'disabled' | 'pending_review' | 'ended';

export interface RecurringDef {
  id: string;
  accountId: string;
  name: string;
  amount: string; // decimal string
  frequency: Frequency;
  nextDate: string; // YYYY-MM-DD
  endDate: string | null;
  status: RecurringStatus;
}

export interface OverrideDef {
  recurringTransactionId: string;
  originalDate: string;
  overrideType: 'modified' | 'deleted';
  overrideDate: string | null;
  overrideAmount: string | null;
  overrideName: string | null;
}

export interface ActualTransaction {
  id: string;
  date: string;
  description: string;
  amount: string; // decimal string
  type: 'actual' | 'manual';
}

export interface ForecastTransaction {
  id: string;
  date: string;
  description: string;
  amount: string;
  source: 'actual' | 'forecast' | 'manual';
}

export interface ForecastDay {
  date: string;
  transactions: ForecastTransaction[];
  dailyNet: string;
  runningBalance: string;
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

function addYears(dateStr: string, years: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}

function nextOccurrence(date: string, frequency: Frequency): string {
  switch (frequency) {
    case 'weekly': return addDays(date, 7);
    case 'biweekly': return addDays(date, 14);
    case 'monthly': return addMonths(date, 1);
    case 'yearly': return addYears(date, 1);
  }
}

function datesInRange(start: string, end: string): string[] {
  const dates: string[] = [];
  let current = start;
  while (current <= end) {
    dates.push(current);
    current = addDays(current, 1);
  }
  return dates;
}

// ---------------------------------------------------------------------------
// expandRecurringSeries
// ---------------------------------------------------------------------------

export interface RecurringInstance {
  recurringId: string;
  date: string;
  name: string;
  amount: string;
}

export function expandRecurringSeries(
  series: RecurringDef,
  startDate: string,
  endDate: string
): RecurringInstance[] {
  // Only expand active series
  if (series.status !== 'active') return [];

  const instances: RecurringInstance[] = [];
  let current = series.nextDate;

  while (current <= endDate) {
    // Stop if past end date of the series
    if (series.endDate && current > series.endDate) break;

    if (current >= startDate) {
      instances.push({
        recurringId: series.id,
        date: current,
        name: series.name,
        amount: series.amount,
      });
    }
    current = nextOccurrence(current, series.frequency);
  }

  return instances;
}

// ---------------------------------------------------------------------------
// applyOverrides
// ---------------------------------------------------------------------------

export function applyOverrides(
  instances: RecurringInstance[],
  overrides: OverrideDef[]
): RecurringInstance[] {
  const result: RecurringInstance[] = [];

  for (const instance of instances) {
    const override = overrides.find(
      (o) =>
        o.recurringTransactionId === instance.recurringId &&
        o.originalDate === instance.date
    );

    if (!override) {
      result.push(instance);
      continue;
    }

    if (override.overrideType === 'deleted') {
      // Skip this instance
      continue;
    }

    // Modified — apply changes
    result.push({
      ...instance,
      date: override.overrideDate ?? instance.date,
      amount: override.overrideAmount ?? instance.amount,
      name: override.overrideName ?? instance.name,
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// computeForecast
// ---------------------------------------------------------------------------

export function computeForecast(
  actuals: ActualTransaction[],
  recurringInstances: RecurringInstance[],
  manualTransactions: ActualTransaction[],
  startDate: string,
  endDate: string,
  seedBalance: string
): ForecastDay[] {
  // Merge all transaction sources
  const allTransactions: ForecastTransaction[] = [
    ...actuals.map((t) => ({ ...t, source: t.type as 'actual' | 'manual' })),
    ...recurringInstances.map((r) => ({
      id: `recurring_${r.recurringId}_${r.date}`,
      date: r.date,
      description: r.name,
      amount: r.amount,
      source: 'forecast' as const,
    })),
    ...manualTransactions
      .filter((t) => t.type === 'manual')
      .map((t) => ({ ...t, source: 'manual' as const })),
  ];

  /*
   * Bucket by date once rather than filtering the whole set per day.
   *
   * The walk below visits 226 days on a typical window and the merged set runs
   * to four figures, so the filter it replaced was quadratic — and it is the
   * single largest cost in the pipeline under the Workers CPU budget (#67).
   * Days outside the window are simply never read, which is the same thing the
   * filter accomplished by never matching them.
   */
  const byDate = new Map<string, ForecastTransaction[]>();
  for (const t of allTransactions) {
    const bucket = byDate.get(t.date);
    if (bucket) bucket.push(t);
    else byDate.set(t.date, [t]);
  }

  // Walk day by day
  let runningBalance = new Decimal(seedBalance);
  const days = datesInRange(startDate, endDate);

  return days.map((date) => {
    // Sorted in place: each date is visited exactly once, and the bucket is
    // handed straight to the caller as that day's transactions.
    const dayTransactions = (byDate.get(date) ?? []).sort((a, b) =>
      a.id.localeCompare(b.id),
    );

    const dailyNet = dayTransactions.reduce(
      (sum, t) => sum.plus(new Decimal(t.amount)),
      new Decimal(0)
    );

    runningBalance = runningBalance.plus(dailyNet);

    return {
      date,
      transactions: dayTransactions,
      dailyNet: dailyNet.toFixed(2),
      runningBalance: runningBalance.toFixed(2),
    };
  });
}

// ---------------------------------------------------------------------------
// reconcileInstances
// ---------------------------------------------------------------------------

/**
 * Removes forecast instances that a posted transaction already accounts for.
 *
 * Without this the forecast merges actuals and expanded instances with no
 * suppression, so a bill that was predicted and then actually paid appears
 * twice on its day and is counted twice in the running balance. The error is
 * per-occurrence and compounds across every series and month in view, which
 * defeats the only thing the calendar is for.
 *
 * Only `actual` transactions suppress. A manual entry is something the user
 * added deliberately rather than a bank record of the forecast bill, so it
 * stands alongside the instance instead of replacing it.
 *
 * Anything that does not pair is returned unchanged: an instance whose amount
 * drifted beyond tolerance stays visible next to its actual, so the
 * discrepancy is there to be reported rather than quietly absorbed.
 */
export function reconcileInstances(
  accountId: string,
  actuals: ActualTransaction[],
  instances: RecurringInstance[]
): RecurringInstance[] {
  const posted = actuals.filter((t) => t.type === 'actual');
  if (posted.length === 0 || instances.length === 0) return instances;

  const { unmatchedInstances } = matchInstancesToActuals(
    instances.map((i) => ({
      recurringId: i.recurringId,
      accountId,
      date: i.date,
      amount: i.amount,
    })),
    posted.map((t) => ({ id: t.id, accountId, date: t.date, amount: t.amount }))
  );

  // Map back to the full instances, which carry the name the matcher does not.
  const kept = new Set(unmatchedInstances.map((i) => `${i.recurringId}|${i.date}`));
  return instances.filter((i) => kept.has(`${i.recurringId}|${i.date}`));
}

// ---------------------------------------------------------------------------
// advanceSeriesDate
// ---------------------------------------------------------------------------

/**
 * The date a series should next be expected, given the payments actually seen.
 *
 * `POST /recurring/detect` ends any active series whose `nextDate` plus a
 * grace period is in the past, on the reading that no occurrence has been seen
 * for longer than the grace window. That reading is only true if something
 * advances `nextDate` when a payment matches — and until this, nothing did. So
 * `nextDate` stayed frozen at approval and every series crossed its own cutoff
 * on a fixed timer whether or not the bill was still being paid, was marked
 * `ended`, and was then blocked from re-detection by name.
 *
 * Returns `null` when nothing matched, which leaves `nextDate` untouched. That
 * matters: a series with no evidence behind it *should* still go stale, so the
 * staleness check keeps its meaning rather than being defeated wholesale.
 *
 * The returned date is always in the future — the next occurrence owed, not
 * the last one paid — or the series would be stale again immediately.
 */
export function advanceSeriesDate(
  series: RecurringDef,
  actuals: ActualTransaction[],
  today: string
): string | null {
  if (series.status !== 'active') return null;

  // Expand a little past today so a payment that arrived a day early still has
  // an instance to match against.
  const horizon = addDays(today, 1);
  const due = expandRecurringSeries(series, series.nextDate, horizon);
  if (due.length === 0) return null;

  const kept = new Set(
    reconcileInstances(series.accountId, actuals, due).map((i) => i.date)
  );
  const matched = due.filter((i) => !kept.has(i.date));
  if (matched.length === 0) return null;

  // Exactly one interval past the last occurrence that was actually paid —
  // deliberately not rolled forward to today. If January was paid and it is
  // now March, February and March are owed and unpaid, and they must stay in
  // the forecast. Advancing to the next future date would erase two bills the
  // user still owes.
  //
  // A series that has genuinely stopped therefore keeps a past `nextDate` and
  // still goes stale after its grace window, which is the correct outcome.
  return nextOccurrence(matched[matched.length - 1]!.date, series.frequency);
}
