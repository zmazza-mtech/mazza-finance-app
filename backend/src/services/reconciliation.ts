import Decimal from 'decimal.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TellerTransaction {
  id: string; // teller_id
  accountId: string;
  date: string; // YYYY-MM-DD
  description: string;
  amount: string; // decimal string
  status: 'posted' | 'pending';
}

export interface StoredTransaction {
  id: string; // internal UUID
  tellerId: string | null;
  accountId: string;
  date: string;
  description: string;
  amount: string;
  type: 'actual' | 'manual';
  status: 'posted' | 'pending';
}

export interface TransactionUpdate {
  id: string; // internal UUID to update
  tellerId: string;
  updates: Partial<{
    description: string;
    amount: string;
    status: 'posted' | 'pending';
    date: string;
  }>;
}

export interface ReconciliationResult {
  toInsert: TellerTransaction[];
  toUpdate: TransactionUpdate[];
  unchanged: StoredTransaction[];
}

// ---------------------------------------------------------------------------
// reconcileTransactions
// ---------------------------------------------------------------------------

/**
 * Compares incoming teller.io transactions against stored transactions and
 * produces a set of inserts and updates to bring the DB up to date.
 *
 * - Manual transactions (tellerId === null) are never touched.
 * - A stored transaction is considered unchanged if description, amount,
 *   status, and date all match the incoming value.
 */
export function reconcileTransactions(
  incoming: TellerTransaction[],
  existing: StoredTransaction[]
): ReconciliationResult {
  // Build index of stored actual transactions keyed by tellerId
  const storedByTellerId = new Map<string, StoredTransaction>();
  for (const tx of existing) {
    if (tx.tellerId !== null && tx.type === 'actual') {
      storedByTellerId.set(tx.tellerId, tx);
    }
  }

  const toInsert: TellerTransaction[] = [];
  const toUpdate: TransactionUpdate[] = [];
  const unchanged: StoredTransaction[] = [];

  for (const tx of incoming) {
    const stored = storedByTellerId.get(tx.id);

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
      toUpdate.push({ id: stored.id, tellerId: tx.id, updates });
    } else {
      unchanged.push(stored);
    }
  }

  return { toInsert, toUpdate, unchanged };
}
