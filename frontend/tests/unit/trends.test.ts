import { describe, it, expect } from 'vitest';
import type { CategoryTrendMonth, CategorySummaryItem } from '@/api/types';
import { bucketSpend, averageSpend, spendVsAverage, biggestMover } from '@/lib/trends';

function bucket(month: string, expenses: Array<[string, string]>): CategoryTrendMonth {
  const items: CategorySummaryItem[] = expenses.map(([category, total]) => ({
    category,
    total,
  }));
  return {
    month,
    startDate: `${month}-01`,
    endDate: `${month}-15`,
    income: [],
    expenses: items,
    transfers: [],
  };
}

describe('bucketSpend', () => {
  it('totals expense categories as a positive magnitude', () => {
    const b = bucket('2026-08', [['Groceries', '-412.18'], ['Dining', '-187.82']]);
    expect(bucketSpend(b)).toBe('600');
  });

  it('returns zero for a bucket with no expenses', () => {
    expect(bucketSpend(bucket('2026-08', []))).toBe('0');
  });

  it('ignores income and transfers', () => {
    const b = bucket('2026-08', [['Groceries', '-100.00']]);
    b.income = [{ category: 'Income', total: '4837.32' }];
    b.transfers = [{ category: 'Transfers', total: '-500.00' }];
    expect(bucketSpend(b)).toBe('100');
  });

  it('sums exact decimals without float drift', () => {
    const b = bucket('2026-08', [['Dining', '-0.10'], ['Shopping', '-0.20']]);
    expect(bucketSpend(b)).toBe('0.3');
  });
});

describe('averageSpend', () => {
  it('averages spend across the given buckets', () => {
    const months = [
      bucket('2026-07', [['Groceries', '-300.00']]),
      bucket('2026-06', [['Groceries', '-200.00']]),
      bucket('2026-05', [['Groceries', '-100.00']]),
    ];
    expect(averageSpend(months)).toBe('200');
  });

  it('returns null when there are no buckets', () => {
    expect(averageSpend([])).toBeNull();
  });

  it('returns zero when every bucket is empty', () => {
    expect(averageSpend([bucket('2026-07', []), bucket('2026-06', [])])).toBe('0');
  });

  it('divides exactly rather than through float arithmetic', () => {
    const months = [
      bucket('2026-07', [['Groceries', '-100.00']]),
      bucket('2026-06', [['Groceries', '-100.00']]),
      bucket('2026-05', [['Groceries', '-100.01']]),
    ];
    expect(averageSpend(months)).toBe('100');
  });
});

describe('spendVsAverage', () => {
  it('reports an increase as a rounded percentage above', () => {
    expect(spendVsAverage('224', '200')).toEqual({ direction: 'above', percent: 12 });
  });

  it('reports a decrease as below', () => {
    expect(spendVsAverage('150', '200')).toEqual({ direction: 'below', percent: 25 });
  });

  it('reports an exact match as even', () => {
    expect(spendVsAverage('200', '200')).toEqual({ direction: 'even', percent: 0 });
  });

  it('returns null when there is no average', () => {
    expect(spendVsAverage('224', null)).toBeNull();
  });

  it('returns null when the average is zero, rather than an infinite percentage', () => {
    expect(spendVsAverage('224', '0')).toBeNull();
  });

  it('rounds to the nearest whole percent', () => {
    expect(spendVsAverage('201', '200')?.percent).toBe(1);
    expect(spendVsAverage('200.99', '200')?.percent).toBe(0);
  });
});

describe('biggestMover', () => {
  it('finds the category whose spend moved most', () => {
    const months = [
      bucket('2026-08', [['Dining', '-380.00'], ['Groceries', '-410.00']]),
      bucket('2026-07', [['Dining', '-200.00'], ['Groceries', '-400.00']]),
    ];
    expect(biggestMover(months)).toEqual({
      category: 'Dining',
      change: '180',
      previousMonth: '2026-07',
    });
  });

  it('reports a decrease as a negative change', () => {
    const months = [
      bucket('2026-08', [['Dining', '-100.00']]),
      bucket('2026-07', [['Dining', '-250.00']]),
    ];
    expect(biggestMover(months)?.change).toBe('-150');
  });

  it('treats a category absent from the previous month as having spent nothing', () => {
    const months = [
      bucket('2026-08', [['Healthcare', '-500.00'], ['Dining', '-100.00']]),
      bucket('2026-07', [['Dining', '-90.00']]),
    ];
    expect(biggestMover(months)?.category).toBe('Healthcare');
    expect(biggestMover(months)?.change).toBe('500');
  });

  it('treats a category absent from the current month as having spent nothing', () => {
    const months = [
      bucket('2026-08', []),
      bucket('2026-07', [['Insurance', '-320.00']]),
    ];
    expect(biggestMover(months)).toEqual({
      category: 'Insurance',
      change: '-320',
      previousMonth: '2026-07',
    });
  });

  it('ranks by absolute change, so a large drop beats a small rise', () => {
    const months = [
      bucket('2026-08', [['Dining', '-10.00'], ['Housing', '-100.00']]),
      bucket('2026-07', [['Dining', '-5.00'], ['Housing', '-900.00']]),
    ];
    expect(biggestMover(months)?.category).toBe('Housing');
  });

  it('resolves ties to the larger current spend', () => {
    const months = [
      bucket('2026-08', [['Dining', '-300.00'], ['Groceries', '-150.00']]),
      bucket('2026-07', [['Dining', '-200.00'], ['Groceries', '-50.00']]),
    ];
    expect(biggestMover(months)?.category).toBe('Dining');
  });

  it('returns null when there is no previous month to compare against', () => {
    expect(biggestMover([bucket('2026-08', [['Dining', '-100.00']])])).toBeNull();
  });

  it('returns null for an empty range', () => {
    expect(biggestMover([])).toBeNull();
  });

  it('returns null when nothing moved at all', () => {
    const months = [
      bucket('2026-08', [['Dining', '-100.00']]),
      bucket('2026-07', [['Dining', '-100.00']]),
    ];
    expect(biggestMover(months)).toBeNull();
  });
});
