import { describe, it, expect } from 'vitest';
import {
  reconcileTransactions,
  type StoredTransaction,
  type TellerTransaction,
} from '../../src/services/reconciliation';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function teller(overrides: Partial<TellerTransaction> = {}): TellerTransaction {
  return {
    id: 'teller_001',
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
    tellerId: 'teller_001',
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
  it('returns toInsert for new teller transactions not in DB', () => {
    const incoming = [teller({ id: 'teller_new' })];
    const existing: StoredTransaction[] = [];

    const result = reconcileTransactions(incoming, existing);

    expect(result.toInsert).toHaveLength(1);
    expect(result.toInsert[0]!.id).toBe('teller_new'); // TellerTransaction uses .id
    expect(result.toUpdate).toHaveLength(0);
    expect(result.unchanged).toHaveLength(0);
  });

  it('returns unchanged when teller transaction matches stored exactly', () => {
    const incoming = [teller()];
    const existing = [stored()];

    const result = reconcileTransactions(incoming, existing);

    expect(result.toInsert).toHaveLength(0);
    expect(result.toUpdate).toHaveLength(0);
    expect(result.unchanged).toHaveLength(1);
  });

  it('returns toUpdate when amount differs from stored', () => {
    const incoming = [teller({ amount: '-16.99' })];
    const existing = [stored({ amount: '-15.99' })];

    const result = reconcileTransactions(incoming, existing);

    expect(result.toUpdate).toHaveLength(1);
    expect(result.toUpdate[0]!.updates.amount).toBe('-16.99');
  });

  it('returns toUpdate when status changes from pending to posted', () => {
    const incoming = [teller({ status: 'posted' })];
    const existing = [stored({ status: 'pending' })];

    const result = reconcileTransactions(incoming, existing);

    expect(result.toUpdate).toHaveLength(1);
    expect(result.toUpdate[0]!.updates.status).toBe('posted');
  });

  it('returns toUpdate when description changes', () => {
    const incoming = [teller({ description: 'NETFLIX.COM' })];
    const existing = [stored({ description: 'Netflix' })];

    const result = reconcileTransactions(incoming, existing);

    expect(result.toUpdate).toHaveLength(1);
    expect(result.toUpdate[0]!.updates.description).toBe('NETFLIX.COM');
  });

  it('does not include manual transactions in toUpdate or toInsert', () => {
    // Manual transactions (no tellerId) are ignored by reconciliation
    const incoming = [teller()];
    const existing = [
      stored(),
      stored({ id: 'manual_uuid', tellerId: null, type: 'manual', date: '2024-01-20' }),
    ];

    const result = reconcileTransactions(incoming, existing);

    expect(result.toInsert).toHaveLength(0);
    expect(result.toUpdate).toHaveLength(0);
    expect(result.unchanged).toHaveLength(1);
  });

  it('handles multiple transactions in a single call', () => {
    const incoming = [
      teller({ id: 't1', description: 'Netflix', amount: '-15.99' }),
      teller({ id: 't2', description: 'Spotify', amount: '-9.99' }),
      teller({ id: 't3', description: 'New charge', amount: '-25.00' }),
    ];
    const existing = [
      stored({ tellerId: 't1', description: 'Netflix', amount: '-15.99' }),
      stored({ tellerId: 't2', description: 'Spotify', amount: '-10.99' }), // amount changed
    ];

    const result = reconcileTransactions(incoming, existing);

    expect(result.toInsert).toHaveLength(1);
    expect(result.toInsert[0]!.id).toBe('t3'); // TellerTransaction uses .id
    expect(result.toUpdate).toHaveLength(1);
    expect(result.toUpdate[0]!.tellerId).toBe('t2'); // TransactionUpdate uses .tellerId
    expect(result.unchanged).toHaveLength(1);
    expect(result.unchanged[0]!.tellerId).toBe('t1'); // StoredTransaction uses .tellerId
  });

  it('preserves the existing row id in toUpdate results', () => {
    const incoming = [teller({ amount: '-20.00' })];
    const existing = [stored({ id: 'my-uuid', amount: '-15.99' })];

    const result = reconcileTransactions(incoming, existing);

    expect(result.toUpdate[0]!.id).toBe('my-uuid');
  });

  it('returns empty results for empty inputs', () => {
    const result = reconcileTransactions([], []);
    expect(result.toInsert).toHaveLength(0);
    expect(result.toUpdate).toHaveLength(0);
    expect(result.unchanged).toHaveLength(0);
  });
});
