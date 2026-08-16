import { describe, it, expect } from 'vitest';
import {
  formatDayGroup,
  formatShortDate,
  formatAxisDate,
  formatMonthTitle,
  lastDayOfMonth,
  todayIso,
  formatFullDate,
  formatDateRange,
} from '@/lib/dates';

describe('formatShortDate', () => {
  it('renders a month abbreviation and day', () => {
    expect(formatShortDate('2026-08-31')).toBe('Aug 31');
  });

  it('drops the leading zero from a single-digit day', () => {
    expect(formatShortDate('2026-08-05')).toBe('Aug 5');
  });

  it('handles January 1 without slipping to the previous year', () => {
    // new Date('2026-01-01') is UTC midnight and renders as Dec 31 in any
    // negative-offset timezone.
    expect(formatShortDate('2026-01-01')).toBe('Jan 1');
  });

  it('handles December 31', () => {
    expect(formatShortDate('2025-12-31')).toBe('Dec 31');
  });
});

describe('formatAxisDate', () => {
  it('renders uppercase for the chart axis', () => {
    expect(formatAxisDate('2026-08-01')).toBe('AUG 1');
  });

  it('handles the first of January', () => {
    expect(formatAxisDate('2026-01-01')).toBe('JAN 1');
  });
});

describe('formatMonthTitle', () => {
  it('renders the full month name from a YYYY-MM value', () => {
    expect(formatMonthTitle('2026-08')).toBe('August');
  });

  it('handles every month', () => {
    expect(formatMonthTitle('2026-01')).toBe('January');
    expect(formatMonthTitle('2026-12')).toBe('December');
  });
});

describe('lastDayOfMonth', () => {
  it('returns 31 for a 31-day month', () => {
    expect(lastDayOfMonth('2026-08')).toBe('2026-08-31');
  });

  it('returns 30 for a 30-day month', () => {
    expect(lastDayOfMonth('2026-04')).toBe('2026-04-30');
  });

  it('returns 28 for a common-year February', () => {
    expect(lastDayOfMonth('2026-02')).toBe('2026-02-28');
  });

  it('returns 29 for a leap-year February', () => {
    expect(lastDayOfMonth('2024-02')).toBe('2024-02-29');
  });

  it('returns 28 for a century year that is not a leap year', () => {
    expect(lastDayOfMonth('1900-02')).toBe('1900-02-28');
  });

  it('returns 29 for a 400-divisible century year', () => {
    expect(lastDayOfMonth('2000-02')).toBe('2000-02-29');
  });

  it('handles December without rolling into the next year', () => {
    expect(lastDayOfMonth('2026-12')).toBe('2026-12-31');
  });
});

describe('todayIso', () => {
  it('reports the local calendar date, not the UTC one', () => {
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    expect(todayIso()).toBe(expected);
  });

  it('returns a YYYY-MM-DD string', () => {
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('formatFullDate', () => {
  it('renders weekday, month and day', () => {
    expect(formatFullDate('2026-08-15')).toBe('Saturday, August 15');
  });

  it('drops the leading zero from a single-digit day', () => {
    expect(formatFullDate('2026-08-01')).toBe('Saturday, August 1');
  });

  it('gets the weekday right across a year boundary', () => {
    expect(formatFullDate('2026-01-01')).toBe('Thursday, January 1');
    expect(formatFullDate('2025-12-31')).toBe('Wednesday, December 31');
  });

  it('gets the weekday right on a leap day', () => {
    expect(formatFullDate('2024-02-29')).toBe('Thursday, February 29');
  });
});

describe('formatDateRange', () => {
  it('states the year once when both ends share a month', () => {
    expect(formatDateRange('2026-08-01', '2026-08-31')).toBe('Aug 1 – Aug 31, 2026');
  });

  it('states the year once when both ends share a year', () => {
    expect(formatDateRange('2026-08-01', '2026-09-30')).toBe('Aug 1 – Sep 30, 2026');
  });

  it('states both years when the range crosses a year boundary', () => {
    expect(formatDateRange('2025-12-01', '2026-01-31')).toBe('Dec 1, 2025 – Jan 31, 2026');
  });

  it('drops leading zeroes from single-digit days', () => {
    expect(formatDateRange('2026-08-01', '2026-08-09')).toBe('Aug 1 – Aug 9, 2026');
  });

  it('collapses a single-day range to one date', () => {
    expect(formatDateRange('2026-08-15', '2026-08-15')).toBe('Aug 15, 2026');
  });
});

describe('formatDayGroup', () => {
  it('names the weekday and the short date', () => {
    // 2026-08-15 is a Saturday.
    expect(formatDayGroup('2026-08-15')).toBe('Sat · Aug 15');
  });

  it('covers every weekday across one week', () => {
    expect(formatDayGroup('2026-08-09')).toBe('Sun · Aug 9');
    expect(formatDayGroup('2026-08-10')).toBe('Mon · Aug 10');
    expect(formatDayGroup('2026-08-11')).toBe('Tue · Aug 11');
    expect(formatDayGroup('2026-08-12')).toBe('Wed · Aug 12');
    expect(formatDayGroup('2026-08-13')).toBe('Thu · Aug 13');
    expect(formatDayGroup('2026-08-14')).toBe('Fri · Aug 14');
    expect(formatDayGroup('2026-08-15')).toBe('Sat · Aug 15');
  });

  it('gets the weekday right across a leap day', () => {
    // 2028-02-29 is a Tuesday. A naive day-count that skips leap years lands
    // on the wrong weekday for the rest of that year.
    expect(formatDayGroup('2028-02-29')).toBe('Tue · Feb 29');
    expect(formatDayGroup('2028-03-01')).toBe('Wed · Mar 1');
  });

  it('does not shift a date west of Greenwich', () => {
    // The whole reason this module splits strings instead of parsing them:
    // `new Date('2026-01-01')` is UTC midnight, which is Dec 31 locally.
    expect(formatDayGroup('2026-01-01')).toBe('Thu · Jan 1');
  });
});
