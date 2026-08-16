import { describe, it, expect } from 'vitest';
import {
  expandRecurringSeries,
  applyOverrides,
  computeForecast,
  reconcileInstances,
  advanceSeriesDate,
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
// reconcileInstances — #43
// ---------------------------------------------------------------------------

describe('reconcileInstances', () => {
  const ACCOUNT = 'acct_001';

  function actual(overrides: Partial<ActualTransaction> = {}): ActualTransaction {
    return {
      id: 'tx_1',
      date: '2026-01-15',
      description: 'Internet Bill',
      amount: '-100.00',
      type: 'actual',
      ...overrides,
    };
  }

  function instance(overrides: Partial<RecurringInstance> = {}): RecurringInstance {
    return {
      recurringId: 'r1',
      date: '2026-01-15',
      name: 'Internet Bill',
      amount: '-100.00',
      ...overrides,
    };
  }

  it('drops an instance the actual already covers', () => {
    const kept = reconcileInstances(ACCOUNT, [actual()], [instance()]);
    expect(kept).toEqual([]);
  });

  it('keeps an instance with no actual behind it', () => {
    const future = instance({ date: '2026-02-15' });
    const kept = reconcileInstances(ACCOUNT, [actual()], [instance(), future]);

    expect(kept).toEqual([future]);
  });

  it('keeps an instance whose actual is beyond tolerance', () => {
    // Left visible so the discrepancy can be reported by #12 rather than
    // silently absorbed.
    const kept = reconcileInstances(ACCOUNT, [actual({ amount: '-140.00' })], [instance()]);
    expect(kept).toHaveLength(1);
  });

  it('nets a paid bill once rather than twice', () => {
    // The regression from #43's Defect 1: a bill forecast and then posted
    // netted -200.00 and closed the month 100.00 low.
    const kept = reconcileInstances(ACCOUNT, [actual()], [instance()]);
    const days = computeForecast([actual()], kept, [], '2026-01-01', '2026-01-31', '1000.00');

    const jan15 = days.find((d) => d.date === '2026-01-15')!;
    expect(jan15.dailyNet).toBe('-100.00');
    expect(jan15.transactions).toHaveLength(1);
    expect(days[days.length - 1]!.runningBalance).toBe('900.00');
  });

  it('leaves manual transactions to stand on their own', () => {
    // A manual entry is something the user added deliberately; it is not a
    // bank record of the forecast bill, so it suppresses nothing.
    const manual = actual({ id: 'tx_manual', type: 'manual' });
    const kept = reconcileInstances(ACCOUNT, [manual], [instance()]);

    expect(kept).toHaveLength(1);
  });

  it('returns instances untouched when there are no actuals', () => {
    const instances = [instance(), instance({ recurringId: 'r2', date: '2026-01-20' })];
    expect(reconcileInstances(ACCOUNT, [], instances)).toEqual(instances);
  });
});

// ---------------------------------------------------------------------------
// advanceSeriesDate — #43 Defect 2
// ---------------------------------------------------------------------------

describe('advanceSeriesDate', () => {
  const ACCOUNT = 'acct_001';

  function series(overrides: Partial<RecurringDef> = {}): RecurringDef {
    return {
      id: 'r1',
      accountId: ACCOUNT,
      name: 'Internet Bill',
      amount: '-100.00',
      frequency: 'monthly',
      nextDate: '2026-01-15',
      endDate: null,
      status: 'active',
      ...overrides,
    };
  }

  function paid(date: string, amount = '-100.00', id = `tx_${date}`): ActualTransaction {
    return { id, date, description: 'Internet Bill', amount, type: 'actual' };
  }

  it('advances past every occurrence that was paid', () => {
    // Three monthly payments landed; nextDate should sit on the fourth, not
    // stay frozen on the first.
    const next = advanceSeriesDate(
      series(),
      [paid('2026-01-15'), paid('2026-02-15'), paid('2026-03-15')],
      '2026-03-20',
    );

    expect(next).toBe('2026-04-15');
  });

  it('leaves nextDate alone when nothing matched', () => {
    // No evidence the series is alive, so the staleness sweep keeps its
    // meaning rather than being silently defeated.
    expect(advanceSeriesDate(series(), [], '2026-03-20')).toBeNull();
  });

  it('advances only past the matched run, not to today', () => {
    // Paid in January, then nothing. nextDate moves one interval, so the
    // February occurrence is still owed and still forecast.
    expect(advanceSeriesDate(series(), [paid('2026-01-15')], '2026-03-20')).toBe('2026-02-15');
  });

  it('tolerates a payment a day early or late', () => {
    expect(advanceSeriesDate(series(), [paid('2026-01-16')], '2026-02-01')).toBe('2026-02-15');
  });

  it('tolerates an amount that drifted', () => {
    expect(advanceSeriesDate(series(), [paid('2026-01-15', '-104.00')], '2026-02-01')).toBe(
      '2026-02-15',
    );
  });

  it('does not advance on an amount beyond tolerance', () => {
    expect(advanceSeriesDate(series(), [paid('2026-01-15', '-400.00')], '2026-02-01')).toBeNull();
  });

  it('advances a biweekly series by fourteen days', () => {
    const next = advanceSeriesDate(
      series({ frequency: 'biweekly', nextDate: '2026-01-01' }),
      [paid('2026-01-01'), paid('2026-01-15')],
      '2026-01-20',
    );

    expect(next).toBe('2026-01-29');
  });

  it('lands in the future while payments are up to date', () => {
    // The case that matters for staleness: a series being paid on schedule
    // ends up with a future nextDate, so it never crosses its own cutoff.
    const next = advanceSeriesDate(
      series({ frequency: 'monthly', nextDate: '2026-01-15' }),
      [paid('2026-01-15'), paid('2026-02-15')],
      '2026-02-20',
    )!;

    expect(next).toBe('2026-03-15');
    expect(next > '2026-02-20').toBe(true);
  });

  it('keeps a past nextDate when occurrences were missed', () => {
    // January paid, February and March missed. Those two are still owed, so
    // nextDate stays on February and both remain in the forecast. A series
    // that has truly stopped goes stale from here, which is correct.
    expect(advanceSeriesDate(series(), [paid('2026-01-15')], '2026-03-20')).toBe('2026-02-15');
  });

  it('ignores series that are not active', () => {
    expect(advanceSeriesDate(series({ status: 'ended' }), [paid('2026-01-15')], '2026-02-01'))
      .toBeNull();
  });

  it('ignores manual transactions', () => {
    const manual: ActualTransaction = { ...paid('2026-01-15'), type: 'manual' };
    expect(advanceSeriesDate(series(), [manual], '2026-02-01')).toBeNull();
  });
});
