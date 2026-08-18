import { describe, it, expect } from 'vitest';
import {
  describeSeriesCounts,
  nextOccurrenceAfter,
  parseForecastInstanceId,
} from '@/lib/recurring';

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

// ---------------------------------------------------------------------------
// nextOccurrenceAfter — #43 Defect 4
// ---------------------------------------------------------------------------

describe('nextOccurrenceAfter', () => {
  it('rolls a stale date forward to the next future occurrence', () => {
    // Reactivating a series with its old nextDate would leave it instantly
    // stale again, and its overdue occurrences would flood the calendar.
    expect(nextOccurrenceAfter('2026-03-05', 'biweekly', '2026-08-16')).toBe('2026-08-20');
    expect(nextOccurrenceAfter('2026-03-23', 'monthly', '2026-08-16')).toBe('2026-08-23');
  });

  it('leaves a date that is already in the future alone', () => {
    expect(nextOccurrenceAfter('2026-09-13', 'monthly', '2026-08-16')).toBe('2026-09-13');
  });

  it('moves a date landing exactly on today to the following occurrence', () => {
    expect(nextOccurrenceAfter('2026-08-16', 'monthly', '2026-08-16')).toBe('2026-09-16');
  });

  it('handles weekly and yearly', () => {
    expect(nextOccurrenceAfter('2026-08-01', 'weekly', '2026-08-16')).toBe('2026-08-22');
    expect(nextOccurrenceAfter('2024-02-10', 'yearly', '2026-08-16')).toBe('2027-02-10');
  });

  it('clamps a month-end date rather than overflowing', () => {
    // January 31 + 1 month is not March 3.
    expect(nextOccurrenceAfter('2026-01-31', 'monthly', '2026-02-10')).toBe('2026-02-28');
  });

  it('does not shift a date west of Greenwich', () => {
    expect(nextOccurrenceAfter('2026-01-01', 'monthly', '2026-01-15')).toBe('2026-02-01');
  });
});

// ---------------------------------------------------------------------------
// parseForecastInstanceId
// ---------------------------------------------------------------------------

describe('parseForecastInstanceId', () => {
  const UUID = '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';

  it('splits a forecast row id back into its series and its date', () => {
    // computeForecast builds the id as `recurring_${recurringId}_${date}`, and
    // the day panel needs both halves to write an override for that occurrence.
    expect(parseForecastInstanceId(`recurring_${UUID}_2026-09-15`)).toEqual({
      recurringId: UUID,
      originalDate: '2026-09-15',
    });
  });

  it('returns null for an actual transaction id', () => {
    expect(parseForecastInstanceId(UUID)).toBeNull();
  });

  it('returns null when the trailing segment is not a date', () => {
    expect(parseForecastInstanceId(`recurring_${UUID}_september`)).toBeNull();
  });

  it('returns null for an empty id', () => {
    expect(parseForecastInstanceId('')).toBeNull();
  });
});
