import { describe, it, expect } from 'vitest';
import { toTransaction } from '@/api/mappers';
import type { ApiTransaction } from '@/api/types';

/**
 * A row exactly as `GET /transactions` returns it. The key set is the one
 * `backend/tests/integration/api.test.ts` locks, so this fixture and the real
 * endpoint cannot drift apart silently — the fixture the old tests used was
 * typed against `Transaction`, which is what let the mismatch through (#34).
 */
function apiRow(overrides: Partial<ApiTransaction> = {}): ApiTransaction {
  return {
    id: 'b3f1c0de-0000-4000-8000-000000000001',
    accountId: 'acc1c0de-0000-4000-8000-000000000001',
    simplefinId: 'sf-118',
    date: '2026-08-15',
    description: 'KROGER 118',
    amount: '-84.21',
    category: 'Groceries',
    categorySource: 'auto',
    type: 'actual',
    status: 'posted',
    createdAt: '2026-08-15T12:00:00.000Z',
    updatedAt: '2026-08-15T12:00:00.000Z',
    ...overrides,
  };
}

describe('toTransaction', () => {
  it('reads a bank row as an actual source', () => {
    expect(toTransaction(apiRow()).source).toBe('actual');
  });

  it('reads a hand-entered row as a manual source', () => {
    expect(toTransaction(apiRow({ type: 'manual' })).source).toBe('manual');
  });

  it('carries the fields the wire and the client agree on', () => {
    const result = toTransaction(apiRow());

    expect(result).toMatchObject({
      id: 'b3f1c0de-0000-4000-8000-000000000001',
      accountId: 'acc1c0de-0000-4000-8000-000000000001',
      date: '2026-08-15',
      description: 'KROGER 118',
      amount: '-84.21',
      category: 'Groceries',
      categorySource: 'auto',
    });
  });

  it('leaves the amount as the decimal string the API sent', () => {
    // Not parsed, not rounded — the string is the value.
    expect(toTransaction(apiRow({ amount: '-0.30' })).amount).toBe('-0.30');
  });

  it('keeps an uncategorized row uncategorized', () => {
    const result = toTransaction(apiRow({ category: null }));

    expect(result.category).toBeNull();
    expect(result.categorySource).toBe('auto');
  });

  it('produces no field the API did not send', () => {
    // `recurringId` was declared on `Transaction` and never returned by the
    // endpoint. Inventing it here would put the same hole back.
    expect('recurringId' in toTransaction(apiRow())).toBe(false);
  });

  it('produces a defined source for every row the endpoint can return', () => {
    const rows = [apiRow({ type: 'actual' }), apiRow({ type: 'manual' })];

    for (const row of rows.map(toTransaction)) {
      expect(row.source).toBeDefined();
    }
  });
});
