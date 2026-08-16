import { describe, it, expect } from 'vitest';
import {
  expandRecurringSeries,
  applyOverrides,
  computeForecast,
  advanceMatchedSeries,
  type RecurringDef,
  type OverrideDef,
  type ActualTransaction,
  type RecurringInstance,
} from '../../src/services/forecast.js';

// ---------------------------------------------------------------------------
// expandRecurringSeries
// ---------------------------------------------------------------------------
describe('expandRecurringSeries', () => {
  it('expands a monthly series across a 3-month range', () => {
    const series: RecurringDef = {
      id: '1',
      accountId: 'acc1',
      name: 'Netflix',
      amount: '-15.99',
      frequency: 'monthly',
      nextDate: '2026-02-01',
      endDate: null,
      status: 'active',
    };
    const instances = expandRecurringSeries(
      series,
      '2026-02-01',
      '2026-04-30'
    );
    expect(instances.map((i) => i.date)).toEqual([
      '2026-02-01',
      '2026-03-01',
      '2026-04-01',
    ]);
  });

  it('respects end date', () => {
    const series: RecurringDef = {
      id: '1',
      accountId: 'acc1',
      name: 'Loan',
      amount: '-200.00',
      frequency: 'monthly',
      nextDate: '2026-02-01',
      endDate: '2026-03-01',
      status: 'active',
    };
    const instances = expandRecurringSeries(
      series,
      '2026-02-01',
      '2026-04-30'
    );
    expect(instances.map((i) => i.date)).toEqual(['2026-02-01', '2026-03-01']);
  });

  it('expands a weekly series', () => {
    const series: RecurringDef = {
      id: '1',
      accountId: 'acc1',
      name: 'Gym',
      amount: '-30.00',
      frequency: 'weekly',
      nextDate: '2026-02-02',
      endDate: null,
      status: 'active',
    };
    const instances = expandRecurringSeries(
      series,
      '2026-02-01',
      '2026-02-28'
    );
    expect(instances.map((i) => i.date)).toEqual([
      '2026-02-02',
      '2026-02-09',
      '2026-02-16',
      '2026-02-23',
    ]);
  });

  it('excludes disabled and pending_review series', () => {
    const series: RecurringDef = {
      id: '1',
      accountId: 'acc1',
      name: 'Test',
      amount: '-10.00',
      frequency: 'monthly',
      nextDate: '2026-02-01',
      endDate: null,
      status: 'pending_review',
    };
    const instances = expandRecurringSeries(
      series,
      '2026-02-01',
      '2026-04-30'
    );
    expect(instances).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// applyOverrides
// ---------------------------------------------------------------------------
describe('applyOverrides', () => {
  it('removes a deleted instance', () => {
    const instances = [
      { recurringId: '1', date: '2026-02-01', name: 'Netflix', amount: '-15.99' },
      { recurringId: '1', date: '2026-03-01', name: 'Netflix', amount: '-15.99' },
    ];
    const overrides: OverrideDef[] = [
      {
        recurringTransactionId: '1',
        originalDate: '2026-02-01',
        overrideType: 'deleted',
        overrideDate: null,
        overrideAmount: null,
        overrideName: null,
      },
    ];
    const result = applyOverrides(instances, overrides);
    expect(result.map((i) => i.date)).toEqual(['2026-03-01']);
  });

  it('modifies a moved instance', () => {
    const instances = [
      { recurringId: '1', date: '2026-02-01', name: 'Netflix', amount: '-15.99' },
    ];
    const overrides: OverrideDef[] = [
      {
        recurringTransactionId: '1',
        originalDate: '2026-02-01',
        overrideType: 'modified',
        overrideDate: '2026-02-05',
        overrideAmount: '-18.00',
        overrideName: null,
      },
    ];
    const result = applyOverrides(instances, overrides);
    expect(result[0]?.date).toBe('2026-02-05');
    expect(result[0]?.amount).toBe('-18.00');
  });
});

// ---------------------------------------------------------------------------
// computeForecast (running balance with decimal.js)
// ---------------------------------------------------------------------------
describe('computeForecast', () => {
  it('computes running balance correctly using decimal arithmetic', () => {
    const actuals: ActualTransaction[] = [
      { date: '2026-02-01', description: 'Paycheck', amount: '2000.00', type: 'actual', id: '1' },
      { date: '2026-02-01', description: 'Rent', amount: '-1200.00', type: 'actual', id: '2' },
    ];
    const result = computeForecast(actuals, [], [], '2026-02-01', '2026-02-03', '500.00');

    const feb1 = result.find((d) => d.date === '2026-02-01');
    expect(feb1?.runningBalance).toBe('1300.00'); // 500 + 2000 - 1200

    const feb2 = result.find((d) => d.date === '2026-02-02');
    expect(feb2?.runningBalance).toBe('1300.00'); // no transactions

    const feb3 = result.find((d) => d.date === '2026-02-03');
    expect(feb3?.runningBalance).toBe('1300.00');
  });

  it('avoids floating-point errors (0.1 + 0.2 === 0.30)', () => {
    const actuals: ActualTransaction[] = [
      { date: '2026-02-01', description: 'A', amount: '0.10', type: 'actual', id: '1' },
      { date: '2026-02-01', description: 'B', amount: '0.20', type: 'actual', id: '2' },
    ];
    const result = computeForecast(actuals, [], [], '2026-02-01', '2026-02-01', '0.00');
    expect(result[0]?.runningBalance).toBe('0.30');
  });

  it('returns amounts as decimal strings', () => {
    const result = computeForecast([], [], [], '2026-02-01', '2026-02-01', '1234.56');
    expect(result[0]?.runningBalance).toBe('1234.56');
    expect(typeof result[0]?.runningBalance).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// computeForecast — PRD §7 auto-reconciliation suppression
// ---------------------------------------------------------------------------

describe('computeForecast reconciles actuals against forecast instances', () => {
  const bill: RecurringInstance = {
    recurringId: 'rec_internet',
    date: '2026-01-15',
    name: 'Internet Bill',
    amount: '-100.00',
  };

  function paidBill(overrides: Partial<ActualTransaction> = {}): ActualTransaction {
    return {
      id: 'tx_internet',
      date: '2026-01-15',
      description: 'INTERNET BILL AUTOPAY',
      amount: '-100.00',
      type: 'actual',
      ...overrides,
    };
  }

  it('counts a bill once when its actual has posted', () => {
    const result = computeForecast(
      [paidBill()],
      [bill],
      [],
      '2026-01-01',
      '2026-01-31',
      '1000.00',
    );

    const jan15 = result.find((d) => d.date === '2026-01-15')!;

    expect(jan15.transactions).toHaveLength(1);
    expect(jan15.transactions[0]!.source).toBe('actual');
    expect(jan15.dailyNet).toBe('-100.00');
    expect(result[result.length - 1]!.runningBalance).toBe('900.00');
  });

  it('suppresses the forecast when the actual posted a day late', () => {
    const result = computeForecast(
      [paidBill({ date: '2026-01-16' })],
      [bill],
      [],
      '2026-01-01',
      '2026-01-31',
      '1000.00',
    );

    const sources = result.flatMap((d) => d.transactions).map((t) => t.source);
    expect(sources).toEqual(['actual']);
    expect(result[result.length - 1]!.runningBalance).toBe('900.00');
  });

  it('suppresses the forecast when the amount drifted inside tolerance', () => {
    const result = computeForecast(
      [paidBill({ amount: '-108.00' })],
      [bill],
      [],
      '2026-01-01',
      '2026-01-31',
      '1000.00',
    );

    const jan15 = result.find((d) => d.date === '2026-01-15')!;
    expect(jan15.transactions).toHaveLength(1);
    expect(jan15.dailyNet).toBe('-108.00');
  });

  it('keeps both when the amount is beyond tolerance, so the discrepancy stays visible', () => {
    // The mismatch indicator needs the unresolved pair to survive. Silently
    // matching a bill that moved this far would hide a real problem.
    const result = computeForecast(
      [paidBill({ amount: '-160.00' })],
      [bill],
      [],
      '2026-01-01',
      '2026-01-31',
      '1000.00',
    );

    const jan15 = result.find((d) => d.date === '2026-01-15')!;
    expect(jan15.transactions).toHaveLength(2);
  });

  it('still forecasts an instance that no actual fulfilled', () => {
    const result = computeForecast([], [bill], [], '2026-01-01', '2026-01-31', '1000.00');

    const jan15 = result.find((d) => d.date === '2026-01-15')!;
    expect(jan15.transactions).toHaveLength(1);
    expect(jan15.transactions[0]!.source).toBe('forecast');
    expect(result[result.length - 1]!.runningBalance).toBe('900.00');
  });

  it('still shows an actual that fulfilled no instance', () => {
    const result = computeForecast(
      [paidBill({ id: 'tx_coffee', date: '2026-01-03', amount: '-4.50' })],
      [bill],
      [],
      '2026-01-01',
      '2026-01-31',
      '1000.00',
    );

    const jan3 = result.find((d) => d.date === '2026-01-03')!;
    expect(jan3.transactions).toHaveLength(1);
    expect(result[result.length - 1]!.runningBalance).toBe('895.50');
  });

  it('resolves each instance against a separate actual rather than reusing one', () => {
    const second: RecurringInstance = {
      recurringId: 'rec_phone',
      date: '2026-01-15',
      name: 'Phone Bill',
      amount: '-100.00',
    };

    const result = computeForecast(
      [paidBill()],
      [bill, second],
      [],
      '2026-01-01',
      '2026-01-31',
      '1000.00',
    );

    const jan15 = result.find((d) => d.date === '2026-01-15')!;
    // One actual can only resolve one of the two, so the other stays forecast.
    expect(jan15.transactions).toHaveLength(2);
    expect(jan15.dailyNet).toBe('-200.00');
  });

  it('does not let a manual entry suppress a forecast instance', () => {
    // PRD §7 reconciles *incoming actual* transactions. A manual entry is the
    // user's own record, not evidence the bill cleared, so it must not resolve
    // a forecast. Pinned deliberately — widening this is a spec change.
    const manual: ActualTransaction = {
      id: 'tx_manual',
      date: '2026-01-15',
      description: 'Internet Bill',
      amount: '-100.00',
      type: 'manual',
    };

    const result = computeForecast([], [bill], [manual], '2026-01-01', '2026-01-31', '1000.00');

    const jan15 = result.find((d) => d.date === '2026-01-15')!;
    expect(jan15.transactions).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// advanceMatchedSeries — keeps nextDate a signal the staleness check can read
// ---------------------------------------------------------------------------

describe('advanceMatchedSeries', () => {
  const monthly: RecurringDef = {
    id: 'rec_internet',
    accountId: 'acct_1',
    name: 'Internet Bill',
    amount: '-100.00',
    frequency: 'monthly',
    nextDate: '2026-01-15',
    endDate: null,
    status: 'active',
  };

  it('advances a matched series by exactly one interval', () => {
    const result = advanceMatchedSeries(
      [monthly],
      [{ id: 'tx_1', date: '2026-01-15', amount: '-100.00' }],
      '2026-01-01',
      '2026-01-31',
    );

    expect(result).toEqual([{ seriesId: 'rec_internet', nextDate: '2026-02-15' }]);
  });

  it('leaves a series alone when nothing matched it', () => {
    const result = advanceMatchedSeries([monthly], [], '2026-01-01', '2026-01-31');

    expect(result).toEqual([]);
  });

  it('leaves a series alone when the actual is beyond the amount tolerance', () => {
    const result = advanceMatchedSeries(
      [monthly],
      [{ id: 'tx_1', date: '2026-01-15', amount: '-160.00' }],
      '2026-01-01',
      '2026-01-31',
    );

    expect(result).toEqual([]);
  });

  it('advances past the latest matched occurrence when a backfill covers several', () => {
    const result = advanceMatchedSeries(
      [monthly],
      [
        { id: 'tx_1', date: '2026-01-15', amount: '-100.00' },
        { id: 'tx_2', date: '2026-02-15', amount: '-100.00' },
        { id: 'tx_3', date: '2026-03-15', amount: '-102.00' },
      ],
      '2026-01-01',
      '2026-03-31',
    );

    expect(result).toEqual([{ seriesId: 'rec_internet', nextDate: '2026-04-15' }]);
  });

  it('is idempotent — re-running against an already-advanced series changes nothing', () => {
    const actuals = [{ id: 'tx_1', date: '2026-01-15', amount: '-100.00' }];

    const first = advanceMatchedSeries([monthly], actuals, '2026-01-01', '2026-01-31');
    const advanced: RecurringDef = { ...monthly, nextDate: first[0]!.nextDate };
    const second = advanceMatchedSeries([advanced], actuals, '2026-01-01', '2026-01-31');

    expect(second).toEqual([]);
  });

  it('does not advance a series that is not active', () => {
    const result = advanceMatchedSeries(
      [{ ...monthly, status: 'pending_review' }],
      [{ id: 'tx_1', date: '2026-01-15', amount: '-100.00' }],
      '2026-01-01',
      '2026-01-31',
    );

    expect(result).toEqual([]);
  });

  it('advances a weekly series by seven days', () => {
    const result = advanceMatchedSeries(
      [{ ...monthly, frequency: 'weekly', nextDate: '2026-01-05' }],
      [{ id: 'tx_1', date: '2026-01-05', amount: '-100.00' }],
      '2026-01-01',
      '2026-01-07',
    );

    expect(result).toEqual([{ seriesId: 'rec_internet', nextDate: '2026-01-12' }]);
  });

  it('matches each series against its own actual rather than sharing one', () => {
    const phone: RecurringDef = { ...monthly, id: 'rec_phone', name: 'Phone Bill' };

    const result = advanceMatchedSeries(
      [monthly, phone],
      [{ id: 'tx_1', date: '2026-01-15', amount: '-100.00' }],
      '2026-01-01',
      '2026-01-31',
    );

    // One actual resolves one series; the other keeps waiting for its own.
    expect(result).toHaveLength(1);
  });
});
