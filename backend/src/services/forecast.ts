import Decimal from 'decimal.js';

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

  // Walk day by day
  let runningBalance = new Decimal(seedBalance);
  const days = datesInRange(startDate, endDate);

  return days.map((date) => {
    const dayTransactions = allTransactions
      .filter((t) => t.date === date)
      .sort((a, b) => a.id.localeCompare(b.id));

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
