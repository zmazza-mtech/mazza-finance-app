import { describe, it, expect } from 'vitest';
import {
  reconcileTransactions,
  type StoredTransaction,
  type IncomingTransaction,
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

  it('returns empty results for empty inputs', () => {
    const result = reconcileTransactions([], []);
    expect(result.toInsert).toHaveLength(0);
    expect(result.toUpdate).toHaveLength(0);
    expect(result.unchanged).toHaveLength(0);
  });
});
