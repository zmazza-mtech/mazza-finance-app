import { describe, it, expect } from 'vitest';
import {
  groupByDescription,
  detectFrequency,
  detectRecurring,
  type RawTransaction,
} from '../../src/services/detection';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function tx(overrides: Partial<RawTransaction> = {}): RawTransaction {
  return {
    tellerId: 'teller_001',
    accountId: 'acct_001',
    date: '2024-01-01',
    description: 'Netflix',
    amount: '-15.99',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// groupByDescription
// ---------------------------------------------------------------------------

describe('groupByDescription', () => {
  it('groups identical descriptions together', () => {
    const transactions = [
      tx({ tellerId: 'a', date: '2024-01-01', description: 'Netflix' }),
      tx({ tellerId: 'b', date: '2024-02-01', description: 'Netflix' }),
      tx({ tellerId: 'c', date: '2024-03-01', description: 'Netflix' }),
    ];

    const groups = groupByDescription(transactions);
    // Keys are normalized to lowercase
    expect(groups.get('netflix')).toHaveLength(3);
  });

  it('normalizes description for grouping (trims whitespace, lowercases)', () => {
    const transactions = [
      tx({ tellerId: 'a', description: '  Netflix  ' }),
      tx({ tellerId: 'b', description: 'NETFLIX' }),
      tx({ tellerId: 'c', description: 'netflix' }),
    ];

    const groups = groupByDescription(transactions);
    // All three should end up in the same group
    expect(groups.size).toBe(1);
    const group = [...groups.values()][0];
    expect(group).toHaveLength(3);
  });

  it('keeps distinct descriptions in separate groups', () => {
    const transactions = [
      tx({ tellerId: 'a', description: 'Netflix' }),
      tx({ tellerId: 'b', description: 'Spotify' }),
      tx({ tellerId: 'c', description: 'Netflix' }),
    ];

    const groups = groupByDescription(transactions);
    expect(groups.size).toBe(2);
  });

  it('returns empty map for empty input', () => {
    expect(groupByDescription([])).toEqual(new Map());
  });
});

// ---------------------------------------------------------------------------
// detectFrequency
// ---------------------------------------------------------------------------

describe('detectFrequency', () => {
  it('detects weekly frequency (7-day intervals)', () => {
    const dates = ['2024-01-01', '2024-01-08', '2024-01-15', '2024-01-22'];
    expect(detectFrequency(dates)).toBe('weekly');
  });

  it('detects biweekly frequency (14-day intervals)', () => {
    const dates = ['2024-01-01', '2024-01-15', '2024-01-29', '2024-02-12'];
    expect(detectFrequency(dates)).toBe('biweekly');
  });

  it('detects monthly frequency (~30-day intervals)', () => {
    const dates = ['2024-01-15', '2024-02-15', '2024-03-15', '2024-04-15'];
    expect(detectFrequency(dates)).toBe('monthly');
  });

  it('detects monthly with slight date drift (28-31 day intervals)', () => {
    // Real-world bank postings shift slightly month to month
    const dates = ['2024-01-31', '2024-02-29', '2024-03-31', '2024-04-30'];
    expect(detectFrequency(dates)).toBe('monthly');
  });

  it('detects yearly frequency (~365-day intervals)', () => {
    const dates = ['2022-03-01', '2023-03-01', '2024-03-01'];
    expect(detectFrequency(dates)).toBe('yearly');
  });

  it('returns null for inconsistent intervals', () => {
    const dates = ['2024-01-01', '2024-01-10', '2024-02-20', '2024-04-01'];
    expect(detectFrequency(dates)).toBeNull();
  });

  it('returns null for fewer than 2 dates', () => {
    expect(detectFrequency(['2024-01-01'])).toBeNull();
    expect(detectFrequency([])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// detectRecurring
// ---------------------------------------------------------------------------

describe('detectRecurring', () => {
  it('detects a monthly recurring subscription', () => {
    const transactions = [
      tx({ tellerId: 'a', date: '2024-01-15', description: 'Spotify', amount: '-9.99' }),
      tx({ tellerId: 'b', date: '2024-02-15', description: 'Spotify', amount: '-9.99' }),
      tx({ tellerId: 'c', date: '2024-03-15', description: 'Spotify', amount: '-9.99' }),
      tx({ tellerId: 'd', date: '2024-04-15', description: 'Spotify', amount: '-9.99' }),
    ];

    const results = detectRecurring(transactions, '2024-04-30');
    expect(results).toHaveLength(1);
    expect(results[0]!.name).toBe('Spotify');
    expect(results[0]!.frequency).toBe('monthly');
    expect(results[0]!.amount).toBe('-9.99');
    expect(results[0]!.nextDate).toBe('2024-05-15');
  });

  it('does not detect recurring with fewer than 3 occurrences', () => {
    const transactions = [
      tx({ tellerId: 'a', date: '2024-01-15', description: 'Spotify' }),
      tx({ tellerId: 'b', date: '2024-02-15', description: 'Spotify' }),
    ];

    const results = detectRecurring(transactions, '2024-02-28');
    expect(results).toHaveLength(0);
  });

  it('does not detect recurring for inconsistent amounts', () => {
    // If the amount changes significantly, it is not confidently recurring
    const transactions = [
      tx({ tellerId: 'a', date: '2024-01-15', description: 'Electric Bill', amount: '-120.00' }),
      tx({ tellerId: 'b', date: '2024-02-15', description: 'Electric Bill', amount: '-87.00' }),
      tx({ tellerId: 'c', date: '2024-03-15', description: 'Electric Bill', amount: '-210.00' }),
      tx({ tellerId: 'd', date: '2024-04-15', description: 'Electric Bill', amount: '-95.00' }),
    ];

    const results = detectRecurring(transactions, '2024-04-30');
    expect(results).toHaveLength(0);
  });

  it('does not detect recurring for inconsistent intervals', () => {
    const transactions = [
      tx({ tellerId: 'a', date: '2024-01-01', description: 'Random' }),
      tx({ tellerId: 'b', date: '2024-01-10', description: 'Random' }),
      tx({ tellerId: 'c', date: '2024-02-20', description: 'Random' }),
    ];

    const results = detectRecurring(transactions, '2024-03-01');
    expect(results).toHaveLength(0);
  });

  it('uses the most common amount when amounts are consistent', () => {
    // Slight amount drift still consistent within tolerance
    const transactions = [
      tx({ tellerId: 'a', date: '2024-01-15', description: 'Netflix', amount: '-15.49' }),
      tx({ tellerId: 'b', date: '2024-02-15', description: 'Netflix', amount: '-15.49' }),
      tx({ tellerId: 'c', date: '2024-03-15', description: 'Netflix', amount: '-15.49' }),
      tx({ tellerId: 'd', date: '2024-04-15', description: 'Netflix', amount: '-15.49' }),
    ];

    const results = detectRecurring(transactions, '2024-04-30');
    expect(results).toHaveLength(1);
    expect(results[0]!.amount).toBe('-15.49');
  });

  it('correctly computes nextDate for weekly recurring', () => {
    const transactions = [
      tx({ tellerId: 'a', date: '2024-04-01', description: 'Gym', amount: '-10.00' }),
      tx({ tellerId: 'b', date: '2024-04-08', description: 'Gym', amount: '-10.00' }),
      tx({ tellerId: 'c', date: '2024-04-15', description: 'Gym', amount: '-10.00' }),
    ];

    const results = detectRecurring(transactions, '2024-04-20');
    expect(results).toHaveLength(1);
    expect(results[0]!.frequency).toBe('weekly');
    expect(results[0]!.nextDate).toBe('2024-04-22');
  });

  it('returns empty array for empty input', () => {
    expect(detectRecurring([], '2024-01-31')).toHaveLength(0);
  });

  it('does not produce duplicate detections for transactions already known', () => {
    // detectRecurring should exclude any tellerId in existingTellerIds
    const transactions = [
      tx({ tellerId: 'a', date: '2024-01-15', description: 'Spotify', amount: '-9.99' }),
      tx({ tellerId: 'b', date: '2024-02-15', description: 'Spotify', amount: '-9.99' }),
      tx({ tellerId: 'c', date: '2024-03-15', description: 'Spotify', amount: '-9.99' }),
      tx({ tellerId: 'd', date: '2024-04-15', description: 'Spotify', amount: '-9.99' }),
    ];

    // Pass existing recurring names so they get filtered
    const results = detectRecurring(transactions, '2024-04-30', new Set(['spotify']));
    expect(results).toHaveLength(0);
  });
});
