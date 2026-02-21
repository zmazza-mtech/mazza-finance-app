import { describe, it, expect } from 'vitest';
import {
  expandRecurringSeries,
  applyOverrides,
  computeForecast,
  type RecurringDef,
  type OverrideDef,
  type ActualTransaction,
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
