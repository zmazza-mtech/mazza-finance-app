import { describe, it, expect } from 'vitest';
import {
  formatShortDate,
  formatAxisDate,
  formatMonthTitle,
  lastDayOfMonth,
  todayIso,
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
