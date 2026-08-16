import { describe, it, expect } from 'vitest';
import { describeSeriesCounts } from '@/lib/recurring';

describe('describeSeriesCounts', () => {
  it('states both counts', () => {
    expect(describeSeriesCounts(8, 2)).toBe(
      '8 series drive your forecast. 2 more are waiting on you.',
    );
  });

  it('omits the review sentence when nothing is pending', () => {
    expect(describeSeriesCounts(8, 0)).toBe('8 series drive your forecast.');
  });

  it('agrees the verb with a single active series', () => {
    expect(describeSeriesCounts(1, 0)).toBe('1 series drives your forecast.');
  });

  it('agrees the verb with a single pending series', () => {
    expect(describeSeriesCounts(3, 1)).toBe(
      '3 series drive your forecast. 1 more is waiting on you.',
    );
  });

  it('reads as an empty forecast when nothing is active', () => {
    expect(describeSeriesCounts(0, 0)).toBe('No series drive your forecast yet.');
  });

  it('drops "more" when there is nothing to be more than', () => {
    expect(describeSeriesCounts(0, 3)).toBe(
      'No series drive your forecast yet. 3 are waiting on you.',
    );
  });
});
