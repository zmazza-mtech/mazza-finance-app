import { describe, it, expect } from 'vitest';
import { computeTrendBuckets, splitByCategory } from '../../src/services/reports';

describe('computeTrendBuckets', () => {
  it('returns a single bucket running month-start through asOf', () => {
    expect(computeTrendBuckets('2026-08-15', 1)).toEqual([
      { month: '2026-08', startDate: '2026-08-01', endDate: '2026-08-15' },
    ]);
  });

  it('returns buckets newest first', () => {
    const buckets = computeTrendBuckets('2026-08-15', 4);
    expect(buckets.map((b) => b.month)).toEqual(['2026-08', '2026-07', '2026-06', '2026-05']);
  });

  it('holds the same day-of-month across every bucket', () => {
    const buckets = computeTrendBuckets('2026-08-15', 4);
    expect(buckets.map((b) => b.endDate)).toEqual([
      '2026-08-15',
      '2026-07-15',
      '2026-06-15',
      '2026-05-15',
    ]);
  });

  it('starts every bucket on the first of its month', () => {
    const buckets = computeTrendBuckets('2026-08-15', 4);
    for (const bucket of buckets) {
      expect(bucket.startDate.endsWith('-01')).toBe(true);
    }
  });

  it('clamps the end date into a short month', () => {
    // Asking as of Aug 31 must not produce a February 31st.
    const buckets = computeTrendBuckets('2026-08-31', 7);
    const february = buckets.find((b) => b.month === '2026-02');
    expect(february).toEqual({
      month: '2026-02',
      startDate: '2026-02-01',
      endDate: '2026-02-28',
    });
  });

  it('clamps to February 29 in a leap year', () => {
    const buckets = computeTrendBuckets('2024-08-31', 7);
    const february = buckets.find((b) => b.month === '2024-02');
    expect(february?.endDate).toBe('2024-02-29');
  });

  it('clamps a 30th into February without touching 30-day months', () => {
    const buckets = computeTrendBuckets('2026-03-30', 2);
    expect(buckets).toEqual([
      { month: '2026-03', startDate: '2026-03-01', endDate: '2026-03-30' },
      { month: '2026-02', startDate: '2026-02-01', endDate: '2026-02-28' },
    ]);
  });

  it('leaves a 31st intact in months that have one', () => {
    const buckets = computeTrendBuckets('2026-08-31', 2);
    expect(buckets.map((b) => b.endDate)).toEqual(['2026-08-31', '2026-07-31']);
  });

  it('rolls back across a year boundary', () => {
    const buckets = computeTrendBuckets('2026-02-15', 4);
    expect(buckets.map((b) => b.month)).toEqual(['2026-02', '2026-01', '2025-12', '2025-11']);
  });

  it('zero-pads single-digit months and days', () => {
    const buckets = computeTrendBuckets('2026-01-05', 2);
    expect(buckets).toEqual([
      { month: '2026-01', startDate: '2026-01-01', endDate: '2026-01-05' },
      { month: '2025-12', startDate: '2025-12-01', endDate: '2025-12-05' },
    ]);
  });

  it('is unaffected by the host timezone', () => {
    // A naive `new Date('2026-01-01')` parses as UTC midnight and can slip to
    // the previous day in a negative-offset zone.
    const buckets = computeTrendBuckets('2026-01-01', 1);
    expect(buckets[0]).toEqual({
      month: '2026-01',
      startDate: '2026-01-01',
      endDate: '2026-01-01',
    });
  });
});

describe('splitByCategory', () => {
  it('sorts positive totals into income', () => {
    const result = splitByCategory([{ category: 'Income', total: '4837.32' }]);
    expect(result.income).toEqual([{ category: 'Income', total: '4837.32' }]);
    expect(result.expenses).toEqual([]);
  });

  it('sorts negative totals into expenses', () => {
    const result = splitByCategory([{ category: 'Groceries', total: '-412.18' }]);
    expect(result.expenses).toEqual([{ category: 'Groceries', total: '-412.18' }]);
    expect(result.income).toEqual([]);
  });

  it('sorts transfers separately regardless of sign', () => {
    const result = splitByCategory([
      { category: 'Transfers', total: '500.00' },
      { category: 'Transfers', total: '-500.00' },
    ]);
    expect(result.transfers).toHaveLength(2);
    expect(result.income).toEqual([]);
    expect(result.expenses).toEqual([]);
  });

  it('treats a null category as Other', () => {
    const result = splitByCategory([{ category: null, total: '-10.00' }]);
    expect(result.expenses).toEqual([{ category: 'Other', total: '-10.00' }]);
  });

  it('treats a null total as zero', () => {
    const result = splitByCategory([{ category: 'Dining', total: null }]);
    expect(result.income).toEqual([]);
    expect(result.expenses).toEqual([]);
    expect(result.transfers).toEqual([]);
  });

  it('drops a zero total from both income and expenses', () => {
    const result = splitByCategory([{ category: 'Dining', total: '0.00' }]);
    expect(result.income).toEqual([]);
    expect(result.expenses).toEqual([]);
  });

  it('treats a negative zero as zero rather than an expense', () => {
    const result = splitByCategory([{ category: 'Dining', total: '-0.00' }]);
    expect(result.expenses).toEqual([]);
  });

  it('classifies by exact decimal value, not float approximation', () => {
    // A value that loses its sign under naive float handling must still land
    // in expenses.
    const result = splitByCategory([{ category: 'Shopping', total: '-0.01' }]);
    expect(result.expenses).toEqual([{ category: 'Shopping', total: '-0.01' }]);
  });

  it('preserves the decimal string exactly as stored', () => {
    const result = splitByCategory([{ category: 'Housing', total: '-1850.00' }]);
    expect(result.expenses[0].total).toBe('-1850.00');
  });
});
