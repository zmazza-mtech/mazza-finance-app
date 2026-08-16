import { describe, it, expect } from 'vitest';
import { formatCompactBalance } from '@/lib/balance';

/**
 * The phone calendar cell is 62px tall and about 50px wide. `$3,142.00` does
 * not fit; `3,142` does. Cents are the first thing to go — the cell is a
 * shape-of-the-month glance, and the exact figure is one tap away in the day
 * sheet.
 */
describe('formatCompactBalance', () => {
  it('drops the cents and the currency symbol', () => {
    expect(formatCompactBalance('3142.00')).toBe('3,142');
  });

  it('groups thousands', () => {
    expect(formatCompactBalance('1234567.89')).toBe('1,234,568');
  });

  it('leaves values under a thousand ungrouped', () => {
    expect(formatCompactBalance('842.10')).toBe('842');
  });

  it('marks a negative balance with a true minus sign', () => {
    // U+2212, matching every other amount in the design — a hyphen reads as a
    // hyphen next to mono digits.
    expect(formatCompactBalance('-1204.66')).toBe('−1,205');
  });

  it('renders zero without a sign', () => {
    expect(formatCompactBalance('0.00')).toBe('0');
  });

  it('does not render negative zero', () => {
    // −0.40 rounds to zero. Showing "−0" would imply an overdraft that the
    // balance does not have.
    expect(formatCompactBalance('-0.40')).toBe('0');
  });

  it('rounds rather than truncating', () => {
    expect(formatCompactBalance('999.50')).toBe('1,000');
    expect(formatCompactBalance('999.49')).toBe('999');
  });

  it('rounds a negative away from zero symmetrically', () => {
    expect(formatCompactBalance('-999.50')).toBe('−1,000');
  });
});
