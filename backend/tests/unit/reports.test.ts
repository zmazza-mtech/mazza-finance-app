import { describe, it, expect } from 'vitest';
import {
  compareMonths,
  computeTrendBuckets,
  groupUncategorized,
  monthBounds,
  monthRange,
  splitByCategory,
} from '../../src/services/reports';
import { normalizeDescription } from '../../src/services/categorize';

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

describe('groupUncategorized', () => {
  it('collapses descriptions that differ only in a stripped card prefix', () => {
    const result = groupUncategorized([
      { description: 'DBT CRD 0407 27105864 TSTDRIP KITCHEN', amount: '-12.00' },
      { description: 'DBT CRD 0937 88104412 TSTDRIP KITCHEN', amount: '-18.00' },
    ]);

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].count).toBe(2);
  });

  it('sums a group as an exact decimal string', () => {
    const result = groupUncategorized([
      { description: 'POS DEBIT 1234 PEPO SHOP', amount: '-0.10' },
      { description: 'POS DEBIT 5678 PEPO SHOP', amount: '-0.20' },
    ]);

    expect(result.groups[0].total).toBe('-0.30');
  });

  it('keeps distinct merchants in separate groups', () => {
    const result = groupUncategorized([
      { description: 'ACH DEBIT PEPO SHOP', amount: '-12.00' },
      { description: 'ACH DEBIT ODDS AND ENDS', amount: '-18.00' },
    ]);

    expect(result.groups).toHaveLength(2);
  });

  it('groups case-insensitively, matching what batch-categorize matches on', () => {
    const result = groupUncategorized([
      { description: 'pepo shop', amount: '-12.00' },
      { description: 'PEPO SHOP', amount: '-18.00' },
    ]);

    expect(result.groups).toHaveLength(1);
  });

  it('orders groups by the size of the amount, largest first', () => {
    const result = groupUncategorized([
      { description: 'SMALL CO', amount: '-5.00' },
      { description: 'BIG CO', amount: '-500.00' },
      { description: 'MID CO', amount: '-50.00' },
    ]);

    expect(result.groups.map((g) => g.description)).toEqual(['BIG CO', 'MID CO', 'SMALL CO']);
  });

  it('ranks a large deposit above a small charge, ignoring sign', () => {
    const result = groupUncategorized([
      { description: 'SMALL CO', amount: '-5.00' },
      { description: 'MYSTERY DEPOSIT', amount: '900.00' },
    ]);

    expect(result.groups[0].description).toBe('MYSTERY DEPOSIT');
  });

  it('reports the description in the form batch-categorize will re-normalize to the same group', () => {
    const result = groupUncategorized([
      { description: 'DBT CRD 0407 27105864 TSTDRIP KITCHEN', amount: '-12.00' },
    ]);

    expect(normalizeDescription(result.groups[0].description).toLowerCase()).toBe(
      normalizeDescription('DBT CRD 0407 27105864 TSTDRIP KITCHEN').toLowerCase(),
    );
  });

  it('totals every group into one figure as a decimal string', () => {
    const result = groupUncategorized([
      { description: 'SMALL CO', amount: '-5.05' },
      { description: 'BIG CO', amount: '-500.50' },
    ]);

    expect(result.total).toBe('-505.55');
  });

  it('reports an empty set as a zero total and no groups', () => {
    expect(groupUncategorized([])).toEqual({ total: '0.00', groups: [] });
  });

  it('breaks a tie on total alphabetically, so the order is stable', () => {
    const result = groupUncategorized([
      { description: 'ZEBRA CO', amount: '-10.00' },
      { description: 'ALPHA CO', amount: '-10.00' },
    ]);

    expect(result.groups.map((g) => g.description)).toEqual(['ALPHA CO', 'ZEBRA CO']);
  });
});

describe('monthRange', () => {
  it('returns a single month when start and end are the same', () => {
    expect(monthRange('2026-08', '2026-08')).toEqual(['2026-08']);
  });

  it('returns every month between the two, oldest first', () => {
    expect(monthRange('2026-06', '2026-09')).toEqual([
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
    ]);
  });

  it('crosses a year boundary', () => {
    expect(monthRange('2025-11', '2026-02')).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ]);
  });

  it('returns nothing when the end precedes the start', () => {
    expect(monthRange('2026-09', '2026-06')).toEqual([]);
  });
});

describe('monthBounds', () => {
  it('runs from the first of the month to its last day', () => {
    expect(monthBounds('2026-08')).toEqual({
      startDate: '2026-08-01',
      endDate: '2026-08-31',
    });
  });

  it('ends a 30-day month on the 30th', () => {
    expect(monthBounds('2026-09').endDate).toBe('2026-09-30');
  });

  it('ends February on the 28th in a common year', () => {
    expect(monthBounds('2026-02').endDate).toBe('2026-02-28');
  });

  it('ends February on the 29th in a leap year', () => {
    expect(monthBounds('2028-02').endDate).toBe('2028-02-29');
  });
});

describe('compareMonths', () => {
  const groceries = (total: string) => ({ category: 'Groceries', total });

  it('keeps a category total exactly as the query returned it', () => {
    const result = compareMonths([{ month: '2026-08', categories: [groceries('-812.40')] }]);
    expect(result[0].categories[0].total).toBe('-812.40');
  });

  it('leaves the earliest month without a change figure', () => {
    const result = compareMonths([{ month: '2026-08', categories: [groceries('-812.40')] }]);
    expect(result[0].categories[0].change).toBeNull();
    expect(result[0].categories[0].changePercent).toBeNull();
  });

  it('reports a rise in spending as a positive change', () => {
    const result = compareMonths([
      { month: '2026-07', categories: [groceries('-690.10')] },
      { month: '2026-08', categories: [groceries('-812.40')] },
    ]);
    expect(result[1].categories[0].change).toBe('122.30');
  });

  it('reports a fall in spending as a negative change', () => {
    const result = compareMonths([
      { month: '2026-07', categories: [groceries('-318.55')] },
      { month: '2026-08', categories: [groceries('-244.19')] },
    ]);
    expect(result[1].categories[0].change).toBe('-74.36');
  });

  it('states the change as a percent of the prior month', () => {
    const result = compareMonths([
      { month: '2026-07', categories: [groceries('-100.00')] },
      { month: '2026-08', categories: [groceries('-117.70')] },
    ]);
    expect(result[1].categories[0].changePercent).toBe('17.7');
  });

  it('gives no percent when the prior month was zero, rather than infinity', () => {
    const result = compareMonths([
      { month: '2026-07', categories: [groceries('0.00')] },
      { month: '2026-08', categories: [groceries('-40.00')] },
    ]);
    expect(result[1].categories[0].change).toBe('40.00');
    expect(result[1].categories[0].changePercent).toBeNull();
  });

  it('gives no change at all for a category the prior month never had', () => {
    const result = compareMonths([
      { month: '2026-07', categories: [] },
      { month: '2026-08', categories: [groceries('-40.00')] },
    ]);
    expect(result[1].categories[0].change).toBeNull();
    expect(result[1].categories[0].changePercent).toBeNull();
  });

  it('reports no change when the amount held steady', () => {
    const result = compareMonths([
      { month: '2026-07', categories: [groceries('-198.00')] },
      { month: '2026-08', categories: [groceries('-198.00')] },
    ]);
    expect(result[1].categories[0].change).toBe('0.00');
    expect(result[1].categories[0].changePercent).toBe('0.0');
  });

  it('compares magnitudes, so a bigger charge reads as an increase', () => {
    // Both months are money out. -812.40 is more spending than -690.10, and a
    // signed subtraction would call that a decrease.
    const result = compareMonths([
      { month: '2026-07', categories: [groceries('-690.10')] },
      { month: '2026-08', categories: [groceries('-812.40')] },
    ]);
    expect(result[1].categories[0].change?.startsWith('-')).toBe(false);
  });

  it('carries every month through, including one with no transactions', () => {
    const result = compareMonths([
      { month: '2026-06', categories: [groceries('-100.00')] },
      { month: '2026-07', categories: [] },
      { month: '2026-08', categories: [groceries('-100.00')] },
    ]);
    expect(result.map((m) => m.month)).toEqual(['2026-06', '2026-07', '2026-08']);
    expect(result[1].categories).toEqual([]);
  });

  it('compares against the month immediately before, empty or not', () => {
    const result = compareMonths([
      { month: '2026-06', categories: [groceries('-100.00')] },
      { month: '2026-07', categories: [] },
      { month: '2026-08', categories: [groceries('-100.00')] },
    ]);
    // July had no Groceries at all, so August has nothing to compare against —
    // reaching back to June would invent a comparison the data does not make.
    expect(result[2].categories[0].change).toBeNull();
  });

  it('keeps the percent exact rather than routing it through a float', () => {
    const result = compareMonths([
      { month: '2026-07', categories: [groceries('-0.03')] },
      { month: '2026-08', categories: [groceries('-0.04')] },
    ]);
    expect(result[1].categories[0].changePercent).toBe('33.3');
  });
});
