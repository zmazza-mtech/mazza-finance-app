import { describe, it, expect } from 'vitest';
import type { ForecastDay, ForecastTransaction } from '@/api/types';
import {
  daySpend,
  maxDailySpend,
  spentThrough,
  burnRate,
  runway,
  lowPoint,
  endBalance,
  spendIntensity,
  spendLevel,
} from '@/lib/metrics';

function tx(amount: string, description = 'Item'): ForecastTransaction {
  return {
    id: `${description}-${amount}`,
    date: '2026-08-01',
    description,
    amount,
    source: 'actual',
    category: null,
  };
}

function day(
  date: string,
  runningBalance: string,
  transactions: ForecastTransaction[] = [],
): ForecastDay {
  const dailyNet = transactions
    .reduce((sum, t) => sum + Number(t.amount), 0)
    .toFixed(2);
  return { date, transactions, dailyNet, runningBalance };
}

describe('daySpend', () => {
  it('sums negative amounts as a positive magnitude', () => {
    expect(daySpend(day('2026-08-01', '1000', [tx('-40.25'), tx('-9.75')]))).toBe('50');
  });

  it('ignores positive amounts rather than letting them offset spend', () => {
    expect(daySpend(day('2026-08-01', '1000', [tx('-100.00'), tx('500.00')]))).toBe('100');
  });

  it('returns zero for a day with no transactions', () => {
    expect(daySpend(day('2026-08-01', '1000'))).toBe('0');
  });

  it('returns zero for a day of income only', () => {
    expect(daySpend(day('2026-08-01', '1000', [tx('2400.00')]))).toBe('0');
  });

  it('sums exact decimals without float drift', () => {
    // 0.1 + 0.2 !== 0.3 in binary floating point.
    expect(daySpend(day('2026-08-01', '1000', [tx('-0.10'), tx('-0.20')]))).toBe('0.3');
  });
});

describe('maxDailySpend', () => {
  it('returns the largest single-day spend', () => {
    const days = [
      day('2026-08-01', '1000', [tx('-40.00')]),
      day('2026-08-02', '900', [tx('-310.50')]),
      day('2026-08-03', '880', [tx('-20.00')]),
    ];
    expect(maxDailySpend(days)).toBe('310.5');
  });

  it('returns zero for a month with no spend', () => {
    expect(maxDailySpend([day('2026-08-01', '1000', [tx('2400.00')])])).toBe('0');
  });

  it('returns zero for an empty range', () => {
    expect(maxDailySpend([])).toBe('0');
  });
});

describe('spentThrough', () => {
  const days = [
    day('2026-08-01', '1000', [tx('-100.00')]),
    day('2026-08-02', '900', [tx('-50.00')]),
    day('2026-08-03', '850', [tx('-25.00')]),
  ];

  it('sums spend up to and including the given date', () => {
    expect(spentThrough(days, '2026-08-02')).toBe('150');
  });

  it('includes the final day when asked for the whole range', () => {
    expect(spentThrough(days, '2026-08-03')).toBe('175');
  });

  it('excludes days after the given date', () => {
    expect(spentThrough(days, '2026-08-01')).toBe('100');
  });

  it('returns zero when the date precedes every day', () => {
    expect(spentThrough(days, '2026-07-31')).toBe('0');
  });

  it('returns zero for an empty range', () => {
    expect(spentThrough([], '2026-08-15')).toBe('0');
  });
});

describe('burnRate', () => {
  it('divides spend by days elapsed', () => {
    expect(burnRate('3660', 15)).toBe('244');
  });

  it('returns null when no days have elapsed', () => {
    expect(burnRate('3660', 0)).toBeNull();
  });

  it('returns null for a negative day count', () => {
    expect(burnRate('3660', -1)).toBeNull();
  });

  it('returns zero when nothing has been spent', () => {
    expect(burnRate('0', 15)).toBe('0');
  });

  it('divides exactly rather than through float arithmetic', () => {
    expect(burnRate('100', 3)).toBe('33.33');
  });
});

describe('runway', () => {
  it('floors end balance divided by burn rate', () => {
    expect(runway('2440', '244')).toBe(10);
  });

  it('floors a partial day rather than rounding up', () => {
    expect(runway('2500', '244')).toBe(10);
  });

  it('returns null when there is no burn rate', () => {
    expect(runway('2440', null)).toBeNull();
  });

  it('returns null when the burn rate is zero', () => {
    expect(runway('2440', '0')).toBeNull();
  });

  it('returns zero when the end balance is zero', () => {
    expect(runway('0', '244')).toBe(0);
  });

  it('returns zero when the end balance is negative', () => {
    expect(runway('-500', '244')).toBe(0);
  });
});

describe('lowPoint', () => {
  it('finds the minimum running balance with its date', () => {
    const days = [
      day('2026-08-01', '3000'),
      day('2026-08-02', '836.69'),
      day('2026-08-03', '1200'),
    ];
    expect(lowPoint(days)).toEqual({ date: '2026-08-02', balance: '836.69' });
  });

  it('resolves ties to the earliest date', () => {
    const days = [
      day('2026-08-01', '2000'),
      day('2026-08-02', '500.00'),
      day('2026-08-03', '500.00'),
    ];
    expect(lowPoint(days)?.date).toBe('2026-08-02');
  });

  it('handles a negative minimum', () => {
    const days = [day('2026-08-01', '100'), day('2026-08-02', '-250.00')];
    expect(lowPoint(days)).toEqual({ date: '2026-08-02', balance: '-250.00' });
  });

  it('returns null for an empty range', () => {
    expect(lowPoint([])).toBeNull();
  });

  it('compares by decimal value, not string order', () => {
    // '9' sorts after '10' as a string but is the smaller number.
    const days = [day('2026-08-01', '10.00'), day('2026-08-02', '9.00')];
    expect(lowPoint(days)?.balance).toBe('9.00');
  });
});

describe('endBalance', () => {
  it('returns the last day running balance', () => {
    const days = [day('2026-08-01', '3000'), day('2026-08-31', '1174.12')];
    expect(endBalance(days)).toBe('1174.12');
  });

  it('returns null for an empty range', () => {
    expect(endBalance([])).toBeNull();
  });
});

describe('spendIntensity', () => {
  it('returns the ratio of day spend to the month maximum', () => {
    expect(spendIntensity('155.25', '310.50')).toBeCloseTo(0.5, 10);
  });

  it('returns 1 for the heaviest day', () => {
    expect(spendIntensity('310.50', '310.50')).toBe(1);
  });

  it('returns zero when nothing was spent that day', () => {
    expect(spendIntensity('0', '310.50')).toBe(0);
  });

  it('returns zero when the month has no spend, rather than dividing by zero', () => {
    expect(spendIntensity('0', '0')).toBe(0);
  });
});

describe('spendLevel', () => {
  it('calls a ratio above .55 heavy', () => {
    expect(spendLevel(0.56)).toBe('heavy');
  });

  it('calls a ratio above .25 moderate', () => {
    expect(spendLevel(0.26)).toBe('moderate');
  });

  it('calls anything else light', () => {
    expect(spendLevel(0.25)).toBe('light');
    expect(spendLevel(0)).toBe('light');
  });

  it('treats the thresholds as exclusive, matching the design', () => {
    expect(spendLevel(0.55)).toBe('moderate');
    expect(spendLevel(0.25)).toBe('light');
  });
});
