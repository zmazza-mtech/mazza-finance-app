import { describe, it, expect } from 'vitest';
import {
  getBalanceHealth,
  getBalanceHealthClasses,
  getBalanceHealthLabel,
  formatAmount,
  formatCurrency,
  isNegative,
  BalanceHealth,
} from '@/lib/balance';

describe('getBalanceHealth', () => {
  it('returns "good" when balance is above green threshold', () => {
    const result = getBalanceHealth('5000', '1000', '500');
    expect(result).toBe<BalanceHealth>('good');
  });

  it('returns "warning" when balance is at or below green threshold but above critical', () => {
    const result = getBalanceHealth('999', '1000', '500');
    expect(result).toBe<BalanceHealth>('warning');
  });

  it('returns "warning" when balance equals the green threshold exactly', () => {
    const result = getBalanceHealth('1000', '1000', '500');
    expect(result).toBe<BalanceHealth>('warning');
  });

  it('returns "critical" when balance is at or below the critical threshold', () => {
    const result = getBalanceHealth('500', '1000', '500');
    expect(result).toBe<BalanceHealth>('critical');
  });

  it('returns "critical" when balance is below critical threshold', () => {
    const result = getBalanceHealth('100', '1000', '500');
    expect(result).toBe<BalanceHealth>('critical');
  });

  it('returns "critical" when balance is negative', () => {
    const result = getBalanceHealth('-100', '1000', '500');
    expect(result).toBe<BalanceHealth>('critical');
  });

  it('uses default thresholds when settings values are not provided', () => {
    // Default: green > 1000, critical <= 200
    const good = getBalanceHealth('1500');
    expect(good).toBe<BalanceHealth>('good');

    const warning = getBalanceHealth('800');
    expect(warning).toBe<BalanceHealth>('warning');

    const critical = getBalanceHealth('100');
    expect(critical).toBe<BalanceHealth>('critical');
  });

  it('handles decimal string balances precisely', () => {
    // 999.99 should be warning when green threshold is 1000
    const result = getBalanceHealth('999.99', '1000', '500');
    expect(result).toBe<BalanceHealth>('warning');
  });

  it('handles decimal string balances at boundary', () => {
    // 500.01 should be warning (above critical=500, at or below green=1000)
    const result = getBalanceHealth('500.01', '1000', '500');
    expect(result).toBe<BalanceHealth>('warning');
  });
});

describe('formatAmount', () => {
  it('formats positive decimal string to two decimals', () => {
    expect(formatAmount('1234.5')).toBe('1,234.50');
  });

  it('formats negative decimal string (strips sign)', () => {
    expect(formatAmount('-50.00')).toBe('50.00');
  });

  it('formats zero', () => {
    expect(formatAmount('0')).toBe('0.00');
  });

  it('handles large amounts', () => {
    expect(formatAmount('9999999.99')).toBe('9,999,999.99');
  });
});

describe('formatCurrency', () => {
  it('formats as dollar amount with sign', () => {
    expect(formatCurrency('100.00')).toBe('$100.00');
  });

  it('formats negative as dollar with negative sign', () => {
    expect(formatCurrency('-50.25')).toBe('-$50.25');
  });

  it('formats zero', () => {
    expect(formatCurrency('0')).toBe('$0.00');
  });
});

describe('getBalanceHealthClasses', () => {
  const healths: BalanceHealth[] = ['good', 'warning', 'critical'];

  it('maps each health state to its Momoski balance token', () => {
    expect(getBalanceHealthClasses('good')).toBe('text-balance-good');
    expect(getBalanceHealthClasses('warning')).toBe('text-balance-warning');
    expect(getBalanceHealthClasses('critical')).toBe('text-balance-critical');
  });

  it('carries no dark-mode variants — dark is deferred to a later slice', () => {
    for (const health of healths) {
      expect(getBalanceHealthClasses(health)).not.toContain('dark:');
    }
  });

  it('gives every health state a distinct class', () => {
    const classes = healths.map(getBalanceHealthClasses);
    expect(new Set(classes).size).toBe(healths.length);
  });
});

describe('getBalanceHealthLabel', () => {
  it('pairs every health state with a text label so color is never the sole signal', () => {
    expect(getBalanceHealthLabel('good')).toBe('Good');
    expect(getBalanceHealthLabel('warning')).toBe('Low');
    expect(getBalanceHealthLabel('critical')).toBe('Critical');
  });
});

describe('isNegative', () => {
  it('returns true for negative decimal strings', () => {
    expect(isNegative('-10.00')).toBe(true);
  });

  it('returns false for positive decimal strings', () => {
    expect(isNegative('10.00')).toBe(false);
  });

  it('returns false for zero', () => {
    expect(isNegative('0')).toBe(false);
  });
});
