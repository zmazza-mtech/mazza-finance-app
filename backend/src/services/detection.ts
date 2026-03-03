import Decimal from 'decimal.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RawTransaction {
  externalId: string;
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

// Minimum unique occurrence dates to consider a pattern recurring
const MIN_OCCURRENCES = 3;

// Allowable variance in days when detecting interval (± days around ideal)
const INTERVAL_TOLERANCE: Record<Frequency, number> = {
  weekly: 2,
  biweekly: 5,  // widened from 3 to handle 18-19 day pay cycles (weekends/holidays)
  monthly: 6,   // widened from 4 to handle calendar drift (28-36 day months)
  yearly: 10,
};

// Ideal interval in days for each frequency
const IDEAL_INTERVAL: Record<Frequency, number> = {
  weekly: 7,
  biweekly: 14,
  monthly: 30,
  yearly: 365,
};

// Maximum coefficient of variation for amounts to be considered consistent.
// 0.15 (15%) allows for annual cost-of-living adjustments and minor payroll
// fluctuations while still filtering genuinely variable/ad-hoc amounts.
const AMOUNT_CV_THRESHOLD = 0.15;

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
// normalizeForGrouping
// ---------------------------------------------------------------------------

/**
 * Normalizes a transaction description for grouping purposes.
 *
 * Bank descriptions frequently embed variable identifiers that change per
 * occurrence: pay-period dates, ACH reference numbers, account numbers, and
 * phone numbers prepended by the originating institution. Stripping these
 * lets us group transactions from the same payee even when the suffix varies.
 *
 * Rules applied in order:
 * 1. Trim whitespace and lowercase.
 * 2. Strip a leading 10-digit phone/reference block (e.g. "8885214089 …").
 * 3. Iteratively strip trailing tokens that look like identifiers:
 *    - Alphanumeric tokens that start with a digit and are ≥6 chars
 *      (catches dates like "022125", reference codes like "0131000570270O",
 *       and long account numbers like "603459008368611").
 *    - Pure-numeric tokens of any length (catches short numeric IDs).
 * 4. Collapse internal whitespace.
 *
 * The original trimmed description (not this normalized form) is stored as
 * the canonical series name so the UI shows a readable label.
 */
export function normalizeForGrouping(description: string): string {
  let s = description.trim().toLowerCase();

  // Strip leading 10-digit phone/reference block
  s = s.replace(/^[0-9]{10}\s+/, '');

  // Iteratively strip trailing identifier tokens until stable.
  // Two patterns are tried on each pass:
  //   (a) token starting with a digit, ≥6 chars (alphanumeric) — catches dates
  //       and reference codes that may end with a letter (e.g. "0131000570270O")
  //   (b) pure-numeric trailing token of any length
  let prev: string;
  do {
    prev = s;
    s = s.replace(/\s+[0-9][a-z0-9]{5,}$/, ''); // long identifier starting with digit
    s = s.replace(/\s+[0-9]+$/, '');              // pure digits (any length)
  } while (s !== prev);

  // Collapse internal whitespace (some ACH descriptions have double-spaces)
  s = s.replace(/\s+/g, ' ').trim();

  // Guard: if everything was stripped return the original lowercased description
  return s || description.trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// groupByDescription
// ---------------------------------------------------------------------------

/**
 * Groups transactions by normalized description.
 * Keys are the normalized form (via normalizeForGrouping); values are the
 * original transaction objects so callers can recover the canonical name.
 */
export function groupByDescription(
  transactions: RawTransaction[]
): Map<string, RawTransaction[]> {
  const groups = new Map<string, RawTransaction[]>();

  for (const tx of transactions) {
    const key = normalizeForGrouping(tx.description);
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

  // Sort by absolute value and trim the top/bottom 5% before computing CV.
  // This makes detection robust to one-off outliers (e.g. a year-end bonus
  // posting alongside normal biweekly pay, or a partial first paycheck).
  const sorted = amounts.map((a) => new Decimal(a).abs()).sort((a, b) => a.cmp(b));
  const trimCount = Math.floor(sorted.length * 0.05);
  const trimmed = trimCount > 0 ? sorted.slice(trimCount, sorted.length - trimCount) : sorted;

  if (trimmed.length === 0) return true;

  const mean = trimmed
    .reduce((sum, v) => sum.plus(v), new Decimal(0))
    .div(trimmed.length);

  if (mean.isZero()) return true;

  const variance = trimmed
    .map((v) => v.minus(mean).pow(2))
    .reduce((sum, v) => sum.plus(v), new Decimal(0))
    .div(trimmed.length);

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
 *                        (prevents re-detecting already-known series).
 *                        May be raw canonical names; they are normalized
 *                        internally before comparison.
 */
export function detectRecurring(
  transactions: RawTransaction[],
  asOfDate: string,
  existingNames: Set<string> = new Set()
): DetectedRecurring[] {
  if (transactions.length === 0) return [];

  // Normalize existing names the same way so descriptions with stripped
  // identifiers correctly match their stored canonical counterparts.
  const normalizedExisting = new Set(
    [...existingNames].map(normalizeForGrouping)
  );

  const groups = groupByDescription(transactions);
  const results: DetectedRecurring[] = [];

  for (const [normalizedKey, group] of groups) {
    // Skip if already known
    if (normalizedExisting.has(normalizedKey)) continue;

    const sorted = [...group].sort((a, b) => a.date.localeCompare(b.date));

    // Deduplicate by date: when multiple transactions share the same date
    // (e.g. several ACH credits from the same source posting on the same
    // business day), treat them as a single occurrence. Amounts are summed
    // so the recurring series reflects the total per-period value (e.g.
    // SSA pays multiple benefit amounts on the same date each month).
    const dateMap = new Map<string, { amount: Decimal; tx: RawTransaction }>();
    for (const t of sorted) {
      const existing = dateMap.get(t.date);
      if (existing) {
        existing.amount = existing.amount.plus(new Decimal(t.amount));
      } else {
        dateMap.set(t.date, { amount: new Decimal(t.amount), tx: t });
      }
    }
    const deduped = [...dateMap.values()]; // preserves date-sort order

    // Need minimum unique occurrence dates
    if (deduped.length < MIN_OCCURRENCES) continue;

    const dates = deduped.map((d) => d.tx.date);
    const amounts = deduped.map((d) => d.amount.toFixed(2));

    // Check frequency pattern
    const frequency = detectFrequency(dates);
    if (!frequency) continue;

    // Check amount consistency
    if (!isAmountConsistent(amounts)) continue;

    const amount = mostCommonAmount(amounts);
    const lastDate = deduped[deduped.length - 1]!.tx.date;
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
