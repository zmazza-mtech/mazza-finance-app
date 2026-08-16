import Decimal from 'decimal.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IncomingTransaction {
  id: string; // external ID (simplefin_id)
  accountId: string;
  date: string; // YYYY-MM-DD
  description: string;
  amount: string; // decimal string
  status: 'posted' | 'pending';
}

export interface StoredTransaction {
  id: string; // internal UUID
  simplefinId: string | null;
  accountId: string;
  date: string;
  description: string;
  amount: string;
  type: 'actual' | 'manual';
  status: 'posted' | 'pending';
}

export interface TransactionUpdate {
  id: string; // internal UUID to update
  simplefinId: string;
  updates: Partial<{
    description: string;
    amount: string;
    status: 'posted' | 'pending';
    date: string;
  }>;
}

export interface ReconciliationResult {
  toInsert: IncomingTransaction[];
  toUpdate: TransactionUpdate[];
  unchanged: StoredTransaction[];
}

// ---------------------------------------------------------------------------
// reconcileTransactions
// ---------------------------------------------------------------------------

/**
 * Compares incoming bank transactions against stored transactions and
 * produces a set of inserts and updates to bring the DB up to date.
 *
 * - Manual transactions (simplefinId === null) are never touched.
 * - A stored transaction is considered unchanged if description, amount,
 *   status, and date all match the incoming value.
 */
export function reconcileTransactions(
  incoming: IncomingTransaction[],
  existing: StoredTransaction[]
): ReconciliationResult {
  // Build index of stored actual transactions keyed by simplefinId
  const storedByExternalId = new Map<string, StoredTransaction>();
  for (const tx of existing) {
    if (tx.simplefinId !== null && tx.type === 'actual') {
      storedByExternalId.set(tx.simplefinId, tx);
    }
  }

  const toInsert: IncomingTransaction[] = [];
  const toUpdate: TransactionUpdate[] = [];
  const unchanged: StoredTransaction[] = [];

  for (const tx of incoming) {
    const stored = storedByExternalId.get(tx.id);

    if (!stored) {
      toInsert.push(tx);
      continue;
    }

    // Detect field-level changes
    const updates: TransactionUpdate['updates'] = {};

    if (tx.description !== stored.description) {
      updates.description = tx.description;
    }

    // Compare amounts as Decimal to avoid string-formatting differences
    if (!new Decimal(tx.amount).eq(new Decimal(stored.amount))) {
      updates.amount = tx.amount;
    }

    if (tx.status !== stored.status) {
      updates.status = tx.status;
    }

    if (tx.date !== stored.date) {
      updates.date = tx.date;
    }

    if (Object.keys(updates).length > 0) {
      toUpdate.push({ id: stored.id, simplefinId: tx.id, updates });
    } else {
      unchanged.push(stored);
    }
  }

  return { toInsert, toUpdate, unchanged };
}

// ---------------------------------------------------------------------------
// matchInstancesToActuals — PRD §7 auto-reconciliation
// ---------------------------------------------------------------------------

/** A forecast recurring instance, as expanded by `expandRecurringSeries`. */
export interface MatchableInstance {
  recurringId: string;
  date: string; // YYYY-MM-DD
  amount: string; // decimal string
}

/** A posted actual transaction, as stored. */
export interface MatchableActual {
  id: string;
  date: string; // YYYY-MM-DD
  amount: string; // decimal string
}

export interface InstanceMatch<
  I extends MatchableInstance = MatchableInstance,
  A extends MatchableActual = MatchableActual,
> {
  instance: I;
  actual: A;
  /** actual minus forecast, as a decimal string. Zero when the bill was exact. */
  delta: string;
}

export interface InstanceMatchResult<
  I extends MatchableInstance = MatchableInstance,
  A extends MatchableActual = MatchableActual,
> {
  matches: InstanceMatch<I, A>[];
  unmatchedInstances: I[];
  unmatchedActuals: A[];
}

/** An actual may post a day either side of the forecast date. */
const MATCH_DATE_WINDOW_DAYS = 1;

/**
 * An amount is close enough when it is within the greater of these two of the
 * forecast amount. The floor carries small recurring charges, where a percentage
 * is too tight to absorb a normal price change; the rate carries large ones,
 * where a fixed dollar window is too tight to absorb an escrow or rate
 * adjustment. Taking the greater covers both shapes of drift.
 *
 * Tune against real sync history — these are the whole matching rule.
 */
const MATCH_TOLERANCE_FLOOR = new Decimal('5.00');
const MATCH_TOLERANCE_RATE = new Decimal('0.10');

/** Whole days between two YYYY-MM-DD dates, ignoring order. */
function daysApart(a: string, b: string): number {
  const msPerDay = 86_400_000;
  const aMs = Date.parse(a + 'T00:00:00Z');
  const bMs = Date.parse(b + 'T00:00:00Z');
  return Math.abs(aMs - bMs) / msPerDay;
}

/** The amount window an actual must fall inside to resolve this instance. */
function toleranceFor(forecastAmount: string): Decimal {
  const proportional = new Decimal(forecastAmount).abs().times(MATCH_TOLERANCE_RATE);
  return Decimal.max(MATCH_TOLERANCE_FLOOR, proportional);
}

interface Candidate {
  instanceIndex: number;
  actualIndex: number;
  absDelta: Decimal;
  daysApart: number;
}

/**
 * Pairs forecast recurring instances with the actual transactions that fulfilled
 * them, per PRD §7.
 *
 * An instance matches an actual on the same account when their dates are within
 * `MATCH_DATE_WINDOW_DAYS` and their amounts within `toleranceFor` the forecast.
 * Matching is one-to-one: an actual resolves at most one instance, and an
 * instance is resolved by at most one actual.
 *
 * Pairing is deterministic. Candidates are taken closest-amount first, then
 * closest-date, then by instance and actual identity, so the result does not
 * depend on the order the inputs arrived in.
 *
 * Callers are responsible for scoping both sides to a single account.
 */
export function matchInstancesToActuals<
  I extends MatchableInstance,
  A extends MatchableActual,
>(instances: I[], actuals: A[]): InstanceMatchResult<I, A> {
  const candidates: Candidate[] = [];

  for (let i = 0; i < instances.length; i++) {
    const instance = instances[i]!;
    const tolerance = toleranceFor(instance.amount);
    const forecastAmount = new Decimal(instance.amount);

    for (let a = 0; a < actuals.length; a++) {
      const actual = actuals[a]!;

      const gap = daysApart(instance.date, actual.date);
      if (gap > MATCH_DATE_WINDOW_DAYS) continue;

      const absDelta = new Decimal(actual.amount).minus(forecastAmount).abs();
      if (absDelta.gt(tolerance)) continue;

      candidates.push({ instanceIndex: i, actualIndex: a, absDelta, daysApart: gap });
    }
  }

  // Closest amount wins, then closest date. Identity breaks the remaining ties so
  // that shuffling the inputs cannot change which pairs are taken.
  candidates.sort((x, y) => {
    if (!x.absDelta.eq(y.absDelta)) return x.absDelta.cmp(y.absDelta);
    if (x.daysApart !== y.daysApart) return x.daysApart - y.daysApart;

    const xi = instances[x.instanceIndex]!;
    const yi = instances[y.instanceIndex]!;
    const instanceKey = `${xi.recurringId}|${xi.date}`.localeCompare(`${yi.recurringId}|${yi.date}`);
    if (instanceKey !== 0) return instanceKey;

    return actuals[x.actualIndex]!.id.localeCompare(actuals[y.actualIndex]!.id);
  });

  const takenInstances = new Set<number>();
  const takenActuals = new Set<number>();
  const matches: InstanceMatch<I, A>[] = [];

  for (const candidate of candidates) {
    if (takenInstances.has(candidate.instanceIndex)) continue;
    if (takenActuals.has(candidate.actualIndex)) continue;

    takenInstances.add(candidate.instanceIndex);
    takenActuals.add(candidate.actualIndex);

    const instance = instances[candidate.instanceIndex]!;
    const actual = actuals[candidate.actualIndex]!;

    matches.push({
      instance,
      actual,
      delta: new Decimal(actual.amount).minus(new Decimal(instance.amount)).toFixed(2),
    });
  }

  return {
    matches,
    unmatchedInstances: instances.filter((_, i) => !takenInstances.has(i)),
    unmatchedActuals: actuals.filter((_, a) => !takenActuals.has(a)),
  };
}
