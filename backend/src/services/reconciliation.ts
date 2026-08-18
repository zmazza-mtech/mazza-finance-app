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
// matchInstancesToActuals
// ---------------------------------------------------------------------------

/**
 * A posted transaction, as a candidate for satisfying a forecast instance.
 *
 * Deliberately narrower than `StoredTransaction`: matching depends on account,
 * date and amount only. Descriptions are not compared — a series is already
 * identified by name at detection time, and bank descriptions drift enough
 * (reference numbers, changing rails) that comparing them again here would
 * reject valid matches. See the `INST XFER PAYPAL WEB CRUNCHYROLL` case in #43.
 */
export interface MatchableActual {
  id: string;
  accountId: string;
  date: string; // YYYY-MM-DD
  amount: string; // signed decimal string
}

/** One expanded occurrence of a recurring series. */
export interface MatchableInstance {
  recurringId: string;
  accountId: string;
  date: string; // YYYY-MM-DD
  amount: string; // signed decimal string
}

export interface InstanceMatch {
  instance: MatchableInstance;
  actual: MatchableActual;
}

export interface InstanceMatchResult {
  matches: InstanceMatch[];
  /** Instances with no actual — still forecast. */
  unmatchedInstances: MatchableInstance[];
  /** Actuals satisfying no instance — still shown. */
  unmatchedActuals: MatchableActual[];
}

/**
 * The amount tolerance, as the greater of a flat floor and a share of the
 * forecast amount.
 *
 * PRD §7 originally specified an exact amount. Exact comparison only resolves
 * the case where nothing changed, which is not the case reconciliation exists
 * for: a bill whose amount drifts never matches, so it double-counts forever
 * and its series never advances. Taking the greater of the two covers both
 * shapes of drift — a $15.99 subscription going to $17.99 is 12.5% but only
 * $2.00, while a $2,000 mortgage escrow adjustment is a large sum but a small
 * percentage.
 *
 * The ±1 day window and per-account scoping are what stop this over-matching.
 * These constants are expected to be tuned against real sync history.
 */
export const AMOUNT_TOLERANCE_FLOOR = '5.00';
export const AMOUNT_TOLERANCE_RATE = '0.10';

const MS_PER_DAY = 86_400_000;

/** The date `offset` whole days from `date`, as `YYYY-MM-DD`. */
function shiftDate(date: string, offset: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d) + offset * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Constructed once. It is the same value on every call and is never mutated. */
const TOLERANCE_FLOOR = new Decimal(AMOUNT_TOLERANCE_FLOOR);

function toleranceFor(amount: Decimal): Decimal {
  return Decimal.max(TOLERANCE_FLOOR, amount.abs().times(AMOUNT_TOLERANCE_RATE));
}

/**
 * Pairs forecast instances with the actuals that satisfy them.
 *
 * Matching is one-to-one: an actual consumes at most one instance and an
 * instance is consumed by at most one actual. Candidates are ranked by
 * absolute amount difference, then by date proximity, then by identity — so
 * the result does not depend on the order the inputs arrive in, which is not
 * guaranteed by the database.
 *
 * Nothing is dropped. Whatever does not pair comes back in the unmatched
 * lists, so a discrepancy stays visible to be reported rather than being
 * quietly absorbed.
 */
export function matchInstancesToActuals(
  instances: MatchableInstance[],
  actuals: MatchableActual[]
): InstanceMatchResult {
  interface Candidate {
    instanceIdx: number;
    actualIdx: number;
    amountDiff: Decimal;
    dateDiff: number;
  }

  /*
   * Actuals indexed by the two things that gate a pair: the account, and the
   * day. Only three days can ever satisfy the +/-1 window, so an instance
   * visits those three buckets instead of every actual in the set.
   *
   * The candidate set this produces is identical to the one the full scan
   * produced -- the index removes only pairs the `continue` guards would have
   * rejected anyway -- so the global sort below still decides the pairing, and
   * the result stays independent of the order the inputs arrive in (#67).
   */
  const actualsByDay = new Map<string, number[]>();
  for (let a = 0; a < actuals.length; a++) {
    const act = actuals[a]!;
    const key = `${act.accountId}|${act.date}`;
    const bucket = actualsByDay.get(key);
    if (bucket) bucket.push(a);
    else actualsByDay.set(key, [a]);
  }

  /** One `Decimal` per actual, built on first use: many instances read the same actual. */
  const actualAmounts = new Array<Decimal | undefined>(actuals.length);
  function amountOf(index: number): Decimal {
    const cached = actualAmounts[index];
    if (cached) return cached;
    const built = new Decimal(actuals[index]!.amount);
    actualAmounts[index] = built;
    return built;
  }

  const candidates: Candidate[] = [];

  for (let i = 0; i < instances.length; i++) {
    const inst = instances[i]!;
    const instAmount = new Decimal(inst.amount);
    const tolerance = toleranceFor(instAmount);

    // Ordered nearest-day-first only for readability; the sort below is what
    // actually decides, and it reads `dateDiff` rather than arrival order.
    const windows: [number, string[]][] = [
      [0, [inst.date]],
      [1, [shiftDate(inst.date, -1), shiftDate(inst.date, 1)]],
    ];

    for (const [dateDiff, dates] of windows) {
      for (const date of dates) {
        const bucket = actualsByDay.get(`${inst.accountId}|${date}`);
        if (!bucket) continue;

        for (const a of bucket) {
          // Signed, so a deposit never satisfies a bill of the same magnitude.
          const amountDiff = amountOf(a).minus(instAmount).abs();
          if (amountDiff.greaterThan(tolerance)) continue;

          candidates.push({ instanceIdx: i, actualIdx: a, amountDiff, dateDiff });
        }
      }
    }
  }

  candidates.sort((x, y) => {
    const byAmount = x.amountDiff.comparedTo(y.amountDiff);
    if (byAmount !== 0) return byAmount;
    if (x.dateDiff !== y.dateDiff) return x.dateDiff - y.dateDiff;

    // Identity, not position: two equally good candidates must resolve the
    // same way however the caller ordered its arrays.
    const xi = instances[x.instanceIdx]!;
    const yi = instances[y.instanceIdx]!;
    const byInstance = `${xi.recurringId}|${xi.date}`.localeCompare(`${yi.recurringId}|${yi.date}`);
    if (byInstance !== 0) return byInstance;

    return actuals[x.actualIdx]!.id.localeCompare(actuals[y.actualIdx]!.id);
  });

  const usedInstances = new Set<number>();
  const usedActuals = new Set<number>();
  const matches: InstanceMatch[] = [];

  for (const c of candidates) {
    if (usedInstances.has(c.instanceIdx) || usedActuals.has(c.actualIdx)) continue;
    usedInstances.add(c.instanceIdx);
    usedActuals.add(c.actualIdx);
    matches.push({ instance: instances[c.instanceIdx]!, actual: actuals[c.actualIdx]! });
  }

  return {
    matches,
    unmatchedInstances: instances.filter((_, i) => !usedInstances.has(i)),
    unmatchedActuals: actuals.filter((_, a) => !usedActuals.has(a)),
  };
}
