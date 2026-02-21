import { describe, it, expect } from 'vitest';
import {
  normalizeForGrouping,
  groupByDescription,
  detectFrequency,
  detectRecurring,
  type RawTransaction,
} from '../../src/services/detection';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function tx(overrides: Partial<RawTransaction> = {}): RawTransaction {
  return {
    tellerId: 'teller_001',
    accountId: 'acct_001',
    date: '2024-01-01',
    description: 'Netflix',
    amount: '-15.99',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// normalizeForGrouping
// ---------------------------------------------------------------------------

describe('normalizeForGrouping', () => {
  it('lowercases and trims', () => {
    expect(normalizeForGrouping('  NETFLIX  ')).toBe('netflix');
  });

  it('strips a trailing long numeric reference number', () => {
    expect(normalizeForGrouping('PAYMENT SYNCHRONY BANK WEB 603459008368611')).toBe(
      'payment synchrony bank web'
    );
  });

  it('strips a trailing 6-digit date identifier', () => {
    expect(normalizeForGrouping('DIRECT DEP EMPLOYER PAYROLL 022125')).toBe(
      'direct dep employer payroll'
    );
  });

  it('strips trailing alphanumeric identifiers starting with a digit', () => {
    // Trailing "0131000570270O" — 14 chars, starts with digit
    expect(normalizeForGrouping('LOAN-TELEPHONE D WEB 0131000570270O')).toBe(
      'loan-telephone d web'
    );
  });

  it('strips a leading 10-digit phone number', () => {
    expect(normalizeForGrouping('8885214089 LOAN-TELEPHONE D WEB')).toBe(
      'loan-telephone d web'
    );
  });

  it('strips both a leading phone number and a trailing identifier', () => {
    expect(normalizeForGrouping('8885214089 LOAN-TELEPHONE D WEB 0131000570270O')).toBe(
      'loan-telephone d web'
    );
  });

  it('preserves descriptions with no variable parts', () => {
    expect(normalizeForGrouping('CABLE SVCS COMCAST-XFINITY ZACHARY *MAZZA')).toBe(
      'cable svcs comcast-xfinity zachary *mazza'
    );
  });

  it('preserves short numeric tokens that are likely part of the name', () => {
    // "800-71" has a hyphen so is not treated as a pure-digit token
    expect(normalizeForGrouping('AVANT.COM AVANT LLC 800-71 ZACHARY MAZZA')).toBe(
      'avant.com avant llc 800-71 zachary mazza'
    );
  });

  it('collapses internal double-spaces from ACH descriptions', () => {
    expect(normalizeForGrouping('INST XFER  PAYPAL WEB CRUNCHYROLL')).toBe(
      'inst xfer paypal web crunchyroll'
    );
  });

  it('strips multiple trailing numeric tokens iteratively', () => {
    expect(normalizeForGrouping('LOAN PYMT ONE FINANCE, INC WEB 9910927058372')).toBe(
      'loan pymt one finance, inc web'
    );
  });
});

// ---------------------------------------------------------------------------
// groupByDescription
// ---------------------------------------------------------------------------

describe('groupByDescription', () => {
  it('groups identical descriptions together', () => {
    const transactions = [
      tx({ tellerId: 'a', date: '2024-01-01', description: 'Netflix' }),
      tx({ tellerId: 'b', date: '2024-02-01', description: 'Netflix' }),
      tx({ tellerId: 'c', date: '2024-03-01', description: 'Netflix' }),
    ];

    const groups = groupByDescription(transactions);
    expect(groups.get('netflix')).toHaveLength(3);
  });

  it('normalizes description for grouping (trims whitespace, lowercases)', () => {
    const transactions = [
      tx({ tellerId: 'a', description: '  Netflix  ' }),
      tx({ tellerId: 'b', description: 'NETFLIX' }),
      tx({ tellerId: 'c', description: 'netflix' }),
    ];

    const groups = groupByDescription(transactions);
    expect(groups.size).toBe(1);
    const group = [...groups.values()][0];
    expect(group).toHaveLength(3);
  });

  it('keeps distinct descriptions in separate groups', () => {
    const transactions = [
      tx({ tellerId: 'a', description: 'Netflix' }),
      tx({ tellerId: 'b', description: 'Spotify' }),
      tx({ tellerId: 'c', description: 'Netflix' }),
    ];

    const groups = groupByDescription(transactions);
    expect(groups.size).toBe(2);
  });

  it('returns empty map for empty input', () => {
    expect(groupByDescription([])).toEqual(new Map());
  });

  it('groups descriptions that differ only in trailing reference numbers', () => {
    // Same payee, varying ACH reference each month
    const transactions = [
      tx({ tellerId: 'a', description: 'DIRECT DEP EMPLOYER 012125' }),
      tx({ tellerId: 'b', description: 'DIRECT DEP EMPLOYER 022125' }),
      tx({ tellerId: 'c', description: 'DIRECT DEP EMPLOYER 030725' }),
    ];

    const groups = groupByDescription(transactions);
    expect(groups.size).toBe(1);
    const group = [...groups.values()][0]!;
    expect(group).toHaveLength(3);
  });

  it('keeps semantically distinct descriptions in separate groups even after normalization', () => {
    // "PAYMENT SYNCHRONY BANK WEB 603..." and "PAYMENT SUPERIOR SANITAT ZAC MAZZA"
    // normalize to different keys — they must NOT collapse into one group
    const transactions = [
      tx({ tellerId: 'a', description: 'PAYMENT SYNCHRONY BANK WEB 603459008368611' }),
      tx({ tellerId: 'b', description: 'PAYMENT SUPERIOR SANITAT ZAC MAZZA' }),
    ];

    const groups = groupByDescription(transactions);
    expect(groups.size).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// detectFrequency
// ---------------------------------------------------------------------------

describe('detectFrequency', () => {
  it('detects weekly frequency (7-day intervals)', () => {
    const dates = ['2024-01-01', '2024-01-08', '2024-01-15', '2024-01-22'];
    expect(detectFrequency(dates)).toBe('weekly');
  });

  it('detects biweekly frequency (14-day intervals)', () => {
    const dates = ['2024-01-01', '2024-01-15', '2024-01-29', '2024-02-12'];
    expect(detectFrequency(dates)).toBe('biweekly');
  });

  it('detects biweekly with real-world pay cycle drift (18-19 day intervals)', () => {
    // Pay periods shift around weekends/holidays; actual gaps can be 18-19 days
    const dates = ['2024-01-03', '2024-01-21', '2024-02-08', '2024-02-27'];
    // gaps: 18, 18, 19 — all within ±5 of 14
    expect(detectFrequency(dates)).toBe('biweekly');
  });

  it('detects monthly frequency (~30-day intervals)', () => {
    const dates = ['2024-01-15', '2024-02-15', '2024-03-15', '2024-04-15'];
    expect(detectFrequency(dates)).toBe('monthly');
  });

  it('detects monthly with real-world calendar drift (28-36 day intervals)', () => {
    // Monthly payments can shift ±6 days due to weekends, short months, etc.
    const dates = ['2025-02-10', '2025-03-10', '2025-04-07', '2025-05-12'];
    // Feb→Mar=28, Mar→Apr=28, Apr→May=35 — all within ±6 of 30
    expect(detectFrequency(dates)).toBe('monthly');
  });

  it('detects monthly with slight date drift (28-31 day intervals)', () => {
    // Real-world bank postings shift slightly month to month
    const dates = ['2024-01-31', '2024-02-29', '2024-03-31', '2024-04-30'];
    expect(detectFrequency(dates)).toBe('monthly');
  });

  it('detects yearly frequency (~365-day intervals)', () => {
    const dates = ['2022-03-01', '2023-03-01', '2024-03-01'];
    expect(detectFrequency(dates)).toBe('yearly');
  });

  it('returns null for inconsistent intervals', () => {
    const dates = ['2024-01-01', '2024-01-10', '2024-02-20', '2024-04-01'];
    expect(detectFrequency(dates)).toBeNull();
  });

  it('returns null for fewer than 2 dates', () => {
    expect(detectFrequency(['2024-01-01'])).toBeNull();
    expect(detectFrequency([])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// detectRecurring
// ---------------------------------------------------------------------------

describe('detectRecurring', () => {
  it('detects a monthly recurring subscription', () => {
    const transactions = [
      tx({ tellerId: 'a', date: '2024-01-15', description: 'Spotify', amount: '-9.99' }),
      tx({ tellerId: 'b', date: '2024-02-15', description: 'Spotify', amount: '-9.99' }),
      tx({ tellerId: 'c', date: '2024-03-15', description: 'Spotify', amount: '-9.99' }),
      tx({ tellerId: 'd', date: '2024-04-15', description: 'Spotify', amount: '-9.99' }),
    ];

    const results = detectRecurring(transactions, '2024-04-30');
    expect(results).toHaveLength(1);
    expect(results[0]!.name).toBe('Spotify');
    expect(results[0]!.frequency).toBe('monthly');
    expect(results[0]!.amount).toBe('-9.99');
    expect(results[0]!.nextDate).toBe('2024-05-15');
  });

  it('does not detect recurring with fewer than 3 unique occurrence dates', () => {
    const transactions = [
      tx({ tellerId: 'a', date: '2024-01-15', description: 'Spotify' }),
      tx({ tellerId: 'b', date: '2024-02-15', description: 'Spotify' }),
    ];

    const results = detectRecurring(transactions, '2024-02-28');
    expect(results).toHaveLength(0);
  });

  it('does not detect recurring for highly inconsistent amounts (CV > 15%)', () => {
    // $120, $87, $210, $95 — CV ~34%, well above threshold
    const transactions = [
      tx({ tellerId: 'a', date: '2024-01-15', description: 'Electric Bill', amount: '-120.00' }),
      tx({ tellerId: 'b', date: '2024-02-15', description: 'Electric Bill', amount: '-87.00' }),
      tx({ tellerId: 'c', date: '2024-03-15', description: 'Electric Bill', amount: '-210.00' }),
      tx({ tellerId: 'd', date: '2024-04-15', description: 'Electric Bill', amount: '-95.00' }),
    ];

    const results = detectRecurring(transactions, '2024-04-30');
    expect(results).toHaveLength(0);
  });

  it('does not detect recurring for inconsistent intervals', () => {
    const transactions = [
      tx({ tellerId: 'a', date: '2024-01-01', description: 'Random' }),
      tx({ tellerId: 'b', date: '2024-01-10', description: 'Random' }),
      tx({ tellerId: 'c', date: '2024-02-20', description: 'Random' }),
    ];

    const results = detectRecurring(transactions, '2024-03-01');
    expect(results).toHaveLength(0);
  });

  it('uses the most common amount when amounts are consistent', () => {
    const transactions = [
      tx({ tellerId: 'a', date: '2024-01-15', description: 'Netflix', amount: '-15.49' }),
      tx({ tellerId: 'b', date: '2024-02-15', description: 'Netflix', amount: '-15.49' }),
      tx({ tellerId: 'c', date: '2024-03-15', description: 'Netflix', amount: '-15.49' }),
      tx({ tellerId: 'd', date: '2024-04-15', description: 'Netflix', amount: '-15.49' }),
    ];

    const results = detectRecurring(transactions, '2024-04-30');
    expect(results).toHaveLength(1);
    expect(results[0]!.amount).toBe('-15.49');
  });

  it('correctly computes nextDate for weekly recurring', () => {
    const transactions = [
      tx({ tellerId: 'a', date: '2024-04-01', description: 'Gym', amount: '-10.00' }),
      tx({ tellerId: 'b', date: '2024-04-08', description: 'Gym', amount: '-10.00' }),
      tx({ tellerId: 'c', date: '2024-04-15', description: 'Gym', amount: '-10.00' }),
    ];

    const results = detectRecurring(transactions, '2024-04-20');
    expect(results).toHaveLength(1);
    expect(results[0]!.frequency).toBe('weekly');
    expect(results[0]!.nextDate).toBe('2024-04-22');
  });

  it('returns empty array for empty input', () => {
    expect(detectRecurring([], '2024-01-31')).toHaveLength(0);
  });

  it('does not produce duplicate detections for transactions already known', () => {
    const transactions = [
      tx({ tellerId: 'a', date: '2024-01-15', description: 'Spotify', amount: '-9.99' }),
      tx({ tellerId: 'b', date: '2024-02-15', description: 'Spotify', amount: '-9.99' }),
      tx({ tellerId: 'c', date: '2024-03-15', description: 'Spotify', amount: '-9.99' }),
      tx({ tellerId: 'd', date: '2024-04-15', description: 'Spotify', amount: '-9.99' }),
    ];

    const results = detectRecurring(transactions, '2024-04-30', new Set(['spotify']));
    expect(results).toHaveLength(0);
  });

  it('detects recurring when descriptions have varying trailing reference numbers', () => {
    const transactions = [
      tx({ tellerId: 'a', date: '2024-01-15', description: 'DIRECT DEP EMPLOYER 011525', amount: '2100.00' }),
      tx({ tellerId: 'b', date: '2024-02-15', description: 'DIRECT DEP EMPLOYER 021525', amount: '2100.00' }),
      tx({ tellerId: 'c', date: '2024-03-15', description: 'DIRECT DEP EMPLOYER 031525', amount: '2100.00' }),
      tx({ tellerId: 'd', date: '2024-04-15', description: 'DIRECT DEP EMPLOYER 041525', amount: '2100.00' }),
    ];

    const results = detectRecurring(transactions, '2024-04-30');
    expect(results).toHaveLength(1);
    expect(results[0]!.frequency).toBe('monthly');
    expect(results[0]!.amount).toBe('2100.00');
    expect(results[0]!.name).toBe('DIRECT DEP EMPLOYER 011525');
  });

  it('excludes already-known series even when stored name contains the identifier that would be stripped', () => {
    const transactions = [
      tx({ tellerId: 'a', date: '2024-01-15', description: 'DIRECT DEP EMPLOYER 011525', amount: '2100.00' }),
      tx({ tellerId: 'b', date: '2024-02-15', description: 'DIRECT DEP EMPLOYER 021525', amount: '2100.00' }),
      tx({ tellerId: 'c', date: '2024-03-15', description: 'DIRECT DEP EMPLOYER 031525', amount: '2100.00' }),
    ];

    const existingNames = new Set(['DIRECT DEP EMPLOYER 011525']);
    const results = detectRecurring(transactions, '2024-03-31', existingNames);
    expect(results).toHaveLength(0);
  });

  it('deduplicates same-date transactions and sums their amounts', () => {
    // Multiple postings on the same date (e.g. ACH batch from same source)
    // collapse to one occurrence; amounts are summed to reflect true total.
    // 3 postings × $246.00 = $738.00 per month.
    const transactions = [
      tx({ tellerId: 'a1', date: '2024-01-15', description: 'BENEFIT PAYMENT', amount: '246.00' }),
      tx({ tellerId: 'a2', date: '2024-01-15', description: 'BENEFIT PAYMENT', amount: '246.00' }),
      tx({ tellerId: 'a3', date: '2024-01-15', description: 'BENEFIT PAYMENT', amount: '246.00' }),
      tx({ tellerId: 'b1', date: '2024-02-15', description: 'BENEFIT PAYMENT', amount: '246.00' }),
      tx({ tellerId: 'b2', date: '2024-02-15', description: 'BENEFIT PAYMENT', amount: '246.00' }),
      tx({ tellerId: 'b3', date: '2024-02-15', description: 'BENEFIT PAYMENT', amount: '246.00' }),
      tx({ tellerId: 'c1', date: '2024-03-15', description: 'BENEFIT PAYMENT', amount: '246.00' }),
      tx({ tellerId: 'c2', date: '2024-03-15', description: 'BENEFIT PAYMENT', amount: '246.00' }),
      tx({ tellerId: 'c3', date: '2024-03-15', description: 'BENEFIT PAYMENT', amount: '246.00' }),
    ];

    const results = detectRecurring(transactions, '2024-03-31');
    expect(results).toHaveLength(1);
    expect(results[0]!.frequency).toBe('monthly');
    expect(results[0]!.amount).toBe('738.00');
  });

  it('detects biweekly payroll despite a single bonus outlier (5% trimming)', () => {
    // 20 normal biweekly pays at ~$6502, one bonus at $22622.50, one partial at $5382.
    // The outlier trimming (5% each side = 1 entry) removes both extremes,
    // leaving the consistent core salary pattern detectable.
    const base = [
      '2025-03-05', '2025-03-19', '2025-04-02', '2025-04-16', '2025-04-30',
      '2025-05-14', '2025-05-28', '2025-06-11', '2025-06-25', '2025-07-09',
      '2025-07-23', '2025-08-06', '2025-08-20', '2025-09-03', '2025-09-17',
      '2025-10-01', '2025-10-15', '2025-10-29', '2025-11-12', '2025-11-26',
    ];
    const normalTxs = base.map((date, i) =>
      tx({ tellerId: `p${i}`, date, description: 'PAYROLL EMPLOYER', amount: '6502.28' })
    );
    // Outliers: first partial pay + one bonus
    const partial = tx({ tellerId: 'p_partial', date: '2025-02-19', description: 'PAYROLL EMPLOYER', amount: '5382.07' });
    const bonus   = tx({ tellerId: 'p_bonus',   date: '2025-12-10', description: 'PAYROLL EMPLOYER', amount: '22622.50' });

    const results = detectRecurring([partial, ...normalTxs, bonus], '2025-12-15');
    expect(results).toHaveLength(1);
    expect(results[0]!.frequency).toBe('biweekly');
    expect(results[0]!.amount).toBe('6502.28');
  });

  it('detects monthly recurring with COLA-style amount increase (CV within 15%)', () => {
    // Benefit amount increases mid-year — still a recurring pattern
    const transactions = [
      tx({ tellerId: 'a', date: '2025-02-10', description: 'BENEFIT PAYMENT', amount: '246.00' }),
      tx({ tellerId: 'b', date: '2025-03-10', description: 'BENEFIT PAYMENT', amount: '246.00' }),
      tx({ tellerId: 'c', date: '2025-04-07', description: 'BENEFIT PAYMENT', amount: '246.00' }),
      tx({ tellerId: 'd', date: '2025-05-12', description: 'BENEFIT PAYMENT', amount: '246.00' }),
      tx({ tellerId: 'e', date: '2025-06-09', description: 'BENEFIT PAYMENT', amount: '246.00' }),
      tx({ tellerId: 'f', date: '2025-07-07', description: 'BENEFIT PAYMENT', amount: '246.00' }),
      tx({ tellerId: 'g', date: '2025-08-11', description: 'BENEFIT PAYMENT', amount: '246.00' }),
      tx({ tellerId: 'h', date: '2025-09-08', description: 'BENEFIT PAYMENT', amount: '246.00' }),
      tx({ tellerId: 'i', date: '2025-10-06', description: 'BENEFIT PAYMENT', amount: '246.00' }),
      tx({ tellerId: 'j', date: '2025-11-07', description: 'BENEFIT PAYMENT', amount: '246.00' }),
    ];

    const results = detectRecurring(transactions, '2025-11-30');
    expect(results).toHaveLength(1);
    expect(results[0]!.frequency).toBe('monthly');
  });
});
