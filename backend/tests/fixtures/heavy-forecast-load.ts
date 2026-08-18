/**
 * A deliberately heavy but date-fixed household, shared by the golden-output
 * guard and anything else that needs a realistic load.
 *
 * Mirrors the shape of the workerd CPU bench — 16 active series across two
 * accounts, 400 posted actuals over the trailing 45 days, five overrides, a
 * 226-day window — but anchored to a constant date rather than to today, so
 * the output it produces is stable enough to freeze in a fixture.
 */
import type {
  ActualTransaction,
  Frequency,
  OverrideDef,
  RecurringDef,
} from '../../src/services/forecast.js';

/** The anchor. Nothing in the load reads the clock. */
export const ANCHOR = '2026-06-15';

const MS_PER_DAY = 86_400_000;

function daysFromAnchor(n: number): string {
  return new Date(Date.parse(ANCHOR + 'T00:00:00Z') + n * MS_PER_DAY)
    .toISOString()
    .slice(0, 10);
}

export interface HeavyLoad {
  series: RecurringDef[];
  overrides: OverrideDef[];
  actuals: ActualTransaction[];
  start: string;
  end: string;
  seedBalance: string;
}

export function buildHeavyLoad(): HeavyLoad {
  const freqs: Frequency[] = [
    'monthly', 'monthly', 'monthly', 'monthly', 'monthly', 'monthly', 'monthly', 'monthly',
    'biweekly', 'biweekly', 'biweekly', 'biweekly',
    'weekly', 'weekly', 'weekly',
    'yearly',
  ];

  const series: RecurringDef[] = freqs.map((frequency, i) => ({
    id: `series-${i}`,
    accountId: i % 2 === 0 ? 'acct-1' : 'acct-2',
    name: `Recurring ${i}`,
    amount: i % 4 === 0 ? '2500.00' : `-${(35 + i * 7).toFixed(2)}`,
    frequency,
    nextDate: daysFromAnchor(-45 + (i % 14)),
    endDate: null,
    status: 'active',
  }));

  const overrides: OverrideDef[] = series.slice(0, 5).map((s, i) => ({
    recurringTransactionId: s.id,
    originalDate: daysFromAnchor(-45 + (i % 14)),
    overrideType: i % 2 === 0 ? 'modified' : 'deleted',
    overrideDate: null,
    overrideAmount: i % 2 === 0 ? '-99.99' : null,
    overrideName: null,
  }));

  const actuals: ActualTransaction[] = Array.from({ length: 400 }, (_, i) => ({
    id: `txn-${i}`,
    date: daysFromAnchor(-(i % 45)),
    description: `Posted transaction ${i}`,
    amount: (i % 9 === 0 ? 1 : -1 * ((i % 120) + 0.99)).toFixed(2),
    type: i % 10 === 0 ? ('manual' as const) : ('actual' as const),
  }));

  return {
    series,
    overrides,
    actuals,
    start: daysFromAnchor(-45),
    end: daysFromAnchor(180),
    seedBalance: '4210.55',
  };
}
