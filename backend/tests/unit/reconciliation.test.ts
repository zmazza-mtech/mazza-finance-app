import { describe, it, expect } from 'vitest';
import {
  reconcileTransactions,
  matchInstancesToActuals,
  type StoredTransaction,
  type IncomingTransaction,
  type MatchableActual,
  type MatchableInstance,
} from '../../src/services/reconciliation';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeIncoming(overrides: Partial<IncomingTransaction> = {}): IncomingTransaction {
  return {
    id: 'sfin_001',
    accountId: 'acct_001',
    date: '2024-01-15',
    description: 'Netflix',
    amount: '-15.99',
    status: 'posted',
    ...overrides,
  };
}

function stored(overrides: Partial<StoredTransaction> = {}): StoredTransaction {
  return {
    id: 'uuid_001',
    simplefinId: 'sfin_001',
    accountId: 'acct_001',
    date: '2024-01-15',
    description: 'Netflix',
    amount: '-15.99',
    type: 'actual',
    status: 'posted',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// reconcileTransactions
// ---------------------------------------------------------------------------

describe('reconcileTransactions', () => {
  it('returns toInsert for new incoming transactions not in DB', () => {
    const incomingTxs = [makeIncoming({ id: 'sfin_new' })];
    const existing: StoredTransaction[] = [];

    const result = reconcileTransactions(incomingTxs, existing);

    expect(result.toInsert).toHaveLength(1);
    expect(result.toInsert[0]!.id).toBe('sfin_new'); // IncomingTransaction uses .id
    expect(result.toUpdate).toHaveLength(0);
    expect(result.unchanged).toHaveLength(0);
  });

  it('returns unchanged when incoming transaction matches stored exactly', () => {
    const incomingTxs = [makeIncoming()];
    const existing = [stored()];

    const result = reconcileTransactions(incomingTxs, existing);

    expect(result.toInsert).toHaveLength(0);
    expect(result.toUpdate).toHaveLength(0);
    expect(result.unchanged).toHaveLength(1);
  });

  it('returns toUpdate when amount differs from stored', () => {
    const incomingTxs = [makeIncoming({ amount: '-16.99' })];
    const existing = [stored({ amount: '-15.99' })];

    const result = reconcileTransactions(incomingTxs, existing);

    expect(result.toUpdate).toHaveLength(1);
    expect(result.toUpdate[0]!.updates.amount).toBe('-16.99');
  });

  it('returns toUpdate when status changes from pending to posted', () => {
    const incomingTxs = [makeIncoming({ status: 'posted' })];
    const existing = [stored({ status: 'pending' })];

    const result = reconcileTransactions(incomingTxs, existing);

    expect(result.toUpdate).toHaveLength(1);
    expect(result.toUpdate[0]!.updates.status).toBe('posted');
  });

  it('returns toUpdate when description changes', () => {
    const incomingTxs = [makeIncoming({ description: 'NETFLIX.COM' })];
    const existing = [stored({ description: 'Netflix' })];

    const result = reconcileTransactions(incomingTxs, existing);

    expect(result.toUpdate).toHaveLength(1);
    expect(result.toUpdate[0]!.updates.description).toBe('NETFLIX.COM');
  });

  it('does not include manual transactions in toUpdate or toInsert', () => {
    // Manual transactions (no simplefinId) are ignored by reconciliation
    const incomingTxs = [makeIncoming()];
    const existing = [
      stored(),
      stored({ id: 'manual_uuid', simplefinId: null, type: 'manual', date: '2024-01-20' }),
    ];

    const result = reconcileTransactions(incomingTxs, existing);

    expect(result.toInsert).toHaveLength(0);
    expect(result.toUpdate).toHaveLength(0);
    expect(result.unchanged).toHaveLength(1);
  });

  it('handles multiple transactions in a single call', () => {
    const incomingTxs = [
      makeIncoming({ id: 't1', description: 'Netflix', amount: '-15.99' }),
      makeIncoming({ id: 't2', description: 'Spotify', amount: '-9.99' }),
      makeIncoming({ id: 't3', description: 'New charge', amount: '-25.00' }),
    ];
    const existing = [
      stored({ simplefinId: 't1', description: 'Netflix', amount: '-15.99' }),
      stored({ simplefinId: 't2', description: 'Spotify', amount: '-10.99' }), // amount changed
    ];

    const result = reconcileTransactions(incomingTxs, existing);

    expect(result.toInsert).toHaveLength(1);
    expect(result.toInsert[0]!.id).toBe('t3'); // IncomingTransaction uses .id
    expect(result.toUpdate).toHaveLength(1);
    expect(result.toUpdate[0]!.simplefinId).toBe('t2'); // TransactionUpdate uses .simplefinId
    expect(result.unchanged).toHaveLength(1);
    expect(result.unchanged[0]!.simplefinId).toBe('t1'); // StoredTransaction uses .simplefinId
  });

  it('preserves the existing row id in toUpdate results', () => {
    const incomingTxs = [makeIncoming({ amount: '-20.00' })];
    const existing = [stored({ id: 'my-uuid', amount: '-15.99' })];

    const result = reconcileTransactions(incomingTxs, existing);

    expect(result.toUpdate[0]!.id).toBe('my-uuid');
  });

  it('never carries a category, so a correction survives a re-sync that touches the row', () => {
    // The bank revised the description, so this row is re-synced and updated.
    // The update must stay off the category column: writing it here would
    // revert a correction made through PATCH /transactions/:id, which is the
    // one failure the correction feature exists to prevent.
    const { toUpdate } = reconcileTransactions(
      [makeIncoming({ description: 'NETFLIX.COM MONTHLY' })],
      [stored({ description: 'Netflix' })],
    );

    expect(toUpdate).toHaveLength(1);
    expect(Object.keys(toUpdate[0]!.updates)).toEqual(['description']);
  });

  it('returns empty results for empty inputs', () => {
    const result = reconcileTransactions([], []);
    expect(result.toInsert).toHaveLength(0);
    expect(result.toUpdate).toHaveLength(0);
    expect(result.unchanged).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// matchInstancesToActuals — PRD §7 auto-reconciliation
// ---------------------------------------------------------------------------

function instance(overrides: Partial<MatchableInstance> = {}): MatchableInstance {
  return {
    recurringId: 'rec_001',
    date: '2026-01-15',
    amount: '-100.00',
    ...overrides,
  };
}

function actual(overrides: Partial<MatchableActual> = {}): MatchableActual {
  return {
    id: 'tx_001',
    date: '2026-01-15',
    amount: '-100.00',
    ...overrides,
  };
}

describe('matchInstancesToActuals', () => {
  describe('amount comparison', () => {
    it('matches an actual whose amount equals the forecast, with a zero delta', () => {
      const result = matchInstancesToActuals([instance()], [actual()]);

      expect(result.matches).toHaveLength(1);
      expect(result.matches[0]!.instance.recurringId).toBe('rec_001');
      expect(result.matches[0]!.actual.id).toBe('tx_001');
      expect(result.matches[0]!.delta).toBe('0.00');
      expect(result.unmatchedInstances).toHaveLength(0);
      expect(result.unmatchedActuals).toHaveLength(0);
    });

    it('matches a drifted amount inside the percentage tolerance and reports the delta', () => {
      // -100.00 forecast, tolerance is max($5.00, 10%) = $10.00. A $10.00 rate
      // increase is the boundary and must still resolve.
      const result = matchInstancesToActuals(
        [instance({ amount: '-100.00' })],
        [actual({ amount: '-110.00' })],
      );

      expect(result.matches).toHaveLength(1);
      expect(result.matches[0]!.delta).toBe('-10.00');
    });

    it('matches a small-amount drift under the absolute floor, where a percentage alone would not', () => {
      // -15.99 forecast: 10% is only $1.60, so the $5.00 floor is what carries a
      // subscription going from $15.99 to $17.99.
      const result = matchInstancesToActuals(
        [instance({ amount: '-15.99' })],
        [actual({ amount: '-17.99' })],
      );

      expect(result.matches).toHaveLength(1);
      expect(result.matches[0]!.delta).toBe('-2.00');
    });

    it('does not match beyond the tolerance, and leaves both sides visible', () => {
      // A cent past the $10.00 window. Neither side may be swallowed — the
      // discrepancy has to survive for the mismatch indicator to flag it.
      const result = matchInstancesToActuals(
        [instance({ amount: '-100.00' })],
        [actual({ amount: '-110.01' })],
      );

      expect(result.matches).toHaveLength(0);
      expect(result.unmatchedInstances).toHaveLength(1);
      expect(result.unmatchedActuals).toHaveLength(1);
    });

    it('does not match a credit against a debit of the same magnitude', () => {
      const result = matchInstancesToActuals(
        [instance({ amount: '-100.00' })],
        [actual({ amount: '100.00' })],
      );

      expect(result.matches).toHaveLength(0);
    });
  });

  describe('date window', () => {
    it('matches an actual posting one day early', () => {
      const result = matchInstancesToActuals(
        [instance({ date: '2026-01-15' })],
        [actual({ date: '2026-01-14' })],
      );

      expect(result.matches).toHaveLength(1);
    });

    it('matches an actual posting one day late', () => {
      const result = matchInstancesToActuals(
        [instance({ date: '2026-01-15' })],
        [actual({ date: '2026-01-16' })],
      );

      expect(result.matches).toHaveLength(1);
    });

    it('does not match two days out', () => {
      const result = matchInstancesToActuals(
        [instance({ date: '2026-01-15' })],
        [actual({ date: '2026-01-17' })],
      );

      expect(result.matches).toHaveLength(0);
      expect(result.unmatchedInstances).toHaveLength(1);
      expect(result.unmatchedActuals).toHaveLength(1);
    });

    it('spans a month boundary rather than comparing day numbers', () => {
      const result = matchInstancesToActuals(
        [instance({ date: '2026-02-01' })],
        [actual({ date: '2026-01-31' })],
      );

      expect(result.matches).toHaveLength(1);
    });
  });

  describe('one-to-one consumption', () => {
    it('gives an instance to the closest actual by amount, leaving the other unmatched', () => {
      const result = matchInstancesToActuals(
        [instance({ amount: '-100.00' })],
        [
          actual({ id: 'tx_far', amount: '-108.00' }),
          actual({ id: 'tx_near', amount: '-101.00' }),
        ],
      );

      expect(result.matches).toHaveLength(1);
      expect(result.matches[0]!.actual.id).toBe('tx_near');
      expect(result.unmatchedActuals).toHaveLength(1);
      expect(result.unmatchedActuals[0]!.id).toBe('tx_far');
    });

    it('does not let one actual resolve two instances', () => {
      const result = matchInstancesToActuals(
        [
          instance({ recurringId: 'rec_a', amount: '-100.00' }),
          instance({ recurringId: 'rec_b', amount: '-100.00' }),
        ],
        [actual({ amount: '-100.00' })],
      );

      expect(result.matches).toHaveLength(1);
      expect(result.unmatchedInstances).toHaveLength(1);
      expect(result.unmatchedActuals).toHaveLength(0);
    });

    it('prefers the closer date when two instances are equally close on amount', () => {
      const result = matchInstancesToActuals(
        [
          instance({ recurringId: 'rec_far', date: '2026-01-14' }),
          instance({ recurringId: 'rec_same', date: '2026-01-15' }),
        ],
        [actual({ date: '2026-01-15' })],
      );

      expect(result.matches).toHaveLength(1);
      expect(result.matches[0]!.instance.recurringId).toBe('rec_same');
    });
  });

  describe('determinism', () => {
    it('produces the same pairings regardless of input order', () => {
      const instances = [
        instance({ recurringId: 'rec_a', date: '2026-01-10', amount: '-50.00' }),
        instance({ recurringId: 'rec_b', date: '2026-01-15', amount: '-100.00' }),
        instance({ recurringId: 'rec_c', date: '2026-01-20', amount: '-25.00' }),
      ];
      const actuals = [
        actual({ id: 'tx_a', date: '2026-01-10', amount: '-52.00' }),
        actual({ id: 'tx_b', date: '2026-01-16', amount: '-104.00' }),
        actual({ id: 'tx_c', date: '2026-01-20', amount: '-25.00' }),
      ];

      const forward = matchInstancesToActuals(instances, actuals);
      const reversed = matchInstancesToActuals(
        [...instances].reverse(),
        [...actuals].reverse(),
      );

      const pairs = (r: ReturnType<typeof matchInstancesToActuals>) =>
        r.matches
          .map((m) => `${m.instance.recurringId}->${m.actual.id}`)
          .sort();

      expect(pairs(forward)).toEqual(['rec_a->tx_a', 'rec_b->tx_b', 'rec_c->tx_c']);
      expect(pairs(reversed)).toEqual(pairs(forward));
    });
  });

  it('returns empty results for empty inputs', () => {
    const result = matchInstancesToActuals([], []);

    expect(result.matches).toHaveLength(0);
    expect(result.unmatchedInstances).toHaveLength(0);
    expect(result.unmatchedActuals).toHaveLength(0);
  });
});
