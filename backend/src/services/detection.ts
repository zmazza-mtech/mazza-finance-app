import Decimal from 'decimal.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RawTransaction {
  tellerId: string;
  accountId: string;
  date: string; // YYYY-MM-DD
  description: string;
  amount: string; // decimal string, negative = debit
}

export interface DetectedRecurring {
  accountId: string;
  name: string; // canonical description (trimmed, original casing preserved)
  amount: string; // most common amount seen
  frequency: 'weekly' | 'biweekly' | 'monthly' | 'yearly';
  nextDate: string; // projected next occurrence
}

type Frequency = 'weekly' | 'biweekly' | 'monthly' | 'yearly';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Minimum occurrences to consider a pattern recurring
const MIN_OCCURRENCES = 3;

// Allowable variance in days when detecting interval (± days around ideal)
const INTERVAL_TOLERANCE: Record<Frequency, number> = {
  weekly: 2,
  biweekly: 3,
  monthly: 4,
  yearly: 10,
};

// Ideal interval in days for each frequency
const IDEAL_INTERVAL: Record<Frequency, number> = {
  weekly: 7,
  biweekly: 14,
  monthly: 30,
  yearly: 365,
};

// Maximum coefficient of variation for amounts to be considered consistent
// CV = stddev / mean — 0.05 = 5% variance allowed
const AMOUNT_CV_THRESHOLD = 0.05;

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

function daysBetween(a: string, b: string): number {
  const msPerDay = 86_400_000;
  return Math.round(
    (new Date(b + 'T00:00:00Z').getTime() - new Date(a + 'T00:00:00Z').getTime()) / msPerDay
  );
}

function projectNext(lastDate: string, frequency: Frequency): string {
  switch (frequency) {
    case 'weekly': return addDays(lastDate, 7);
    case 'biweekly': return addDays(lastDate, 14);
    case 'monthly': return addMonths(lastDate, 1);
    case 'yearly': return addYears(lastDate, 1);
  }
}

// ---------------------------------------------------------------------------
// groupByDescription
// ---------------------------------------------------------------------------

/**
 * Groups transactions by normalized description (trimmed, lowercased).
 * Keys are the normalized form; values are the original transaction objects.
 */
export function groupByDescription(
  transactions: RawTransaction[]
): Map<string, RawTransaction[]> {
  const groups = new Map<string, RawTransaction[]>();

  for (const tx of transactions) {
    const key = tx.description.trim().toLowerCase();
    const existing = groups.get(key);
    if (existing) {
      existing.push(tx);
    } else {
      groups.set(key, [tx]);
    }
  }

  return groups;
}

// ---------------------------------------------------------------------------
// detectFrequency
// ---------------------------------------------------------------------------

/**
 * Given a list of YYYY-MM-DD date strings (sorted ascending), determines
 * whether the intervals match a known frequency. Returns the matched
 * frequency or null if no consistent pattern is found.
 */
export function detectFrequency(dates: string[]): Frequency | null {
  if (dates.length < 2) return null;

  const sorted = [...dates].sort();
  const intervals: number[] = [];

  for (let i = 1; i < sorted.length; i++) {
    intervals.push(daysBetween(sorted[i - 1]!, sorted[i]!));
  }

  // Try each frequency from most specific to least
  const candidates: Frequency[] = ['weekly', 'biweekly', 'monthly', 'yearly'];

  for (const freq of candidates) {
    const ideal = IDEAL_INTERVAL[freq];
    const tolerance = INTERVAL_TOLERANCE[freq];
    const allMatch = intervals.every((d) => Math.abs(d - ideal) <= tolerance);
    if (allMatch) return freq;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Amount consistency check
// ---------------------------------------------------------------------------

function isAmountConsistent(amounts: string[]): boolean {
  if (amounts.length === 0) return false;

  const decimals = amounts.map((a) => new Decimal(a).abs());
  const mean = decimals
    .reduce((sum, v) => sum.plus(v), new Decimal(0))
    .div(decimals.length);

  if (mean.isZero()) return true;

  const variance = decimals
    .map((v) => v.minus(mean).pow(2))
    .reduce((sum, v) => sum.plus(v), new Decimal(0))
    .div(decimals.length);

  const stddev = variance.sqrt();
  const cv = stddev.div(mean).toNumber();

  return cv <= AMOUNT_CV_THRESHOLD;
}

function mostCommonAmount(amounts: string[]): string {
  const freq = new Map<string, number>();
  for (const a of amounts) {
    const key = new Decimal(a).toFixed(2);
    freq.set(key, (freq.get(key) ?? 0) + 1);
  }

  let best = amounts[0]!;
  let bestCount = 0;
  for (const [key, count] of freq) {
    if (count > bestCount) {
      bestCount = count;
      best = key;
    }
  }

  return best;
}

// ---------------------------------------------------------------------------
// detectRecurring
// ---------------------------------------------------------------------------

/**
 * Analyzes a list of transactions (covering at least 90 days of history)
 * and returns detected recurring patterns.
 *
 * @param transactions    All historical transactions for an account
 * @param asOfDate        The "today" date used to compute nextDate
 * @param existingNames   Normalized names of recurring series already in DB
 *                        (prevents re-detecting already-known series)
 */
export function detectRecurring(
  transactions: RawTransaction[],
  asOfDate: string,
  existingNames: Set<string> = new Set()
): DetectedRecurring[] {
  if (transactions.length === 0) return [];

  const groups = groupByDescription(transactions);
  const results: DetectedRecurring[] = [];

  for (const [normalizedKey, group] of groups) {
    // Skip if already known
    if (existingNames.has(normalizedKey)) continue;

    // Need minimum occurrences
    if (group.length < MIN_OCCURRENCES) continue;

    const sorted = [...group].sort((a, b) => a.date.localeCompare(b.date));
    const dates = sorted.map((t) => t.date);
    const amounts = sorted.map((t) => t.amount);

    // Check frequency pattern
    const frequency = detectFrequency(dates);
    if (!frequency) continue;

    // Check amount consistency
    if (!isAmountConsistent(amounts)) continue;

    const amount = mostCommonAmount(amounts);
    const lastDate = sorted[sorted.length - 1]!.date;
    const nextDate = projectNext(lastDate, frequency);

    // Use original casing from first occurrence for the name
    const canonicalName = sorted[0]!.description.trim();

    results.push({
      accountId: group[0]!.accountId,
      name: canonicalName,
      amount,
      frequency,
      nextDate,
    });
  }

  return results;
}
