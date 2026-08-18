/**
 * How the forecast pipeline scales, measured rather than argued.
 *
 * The question this answers: after #67, is the remaining cost linear in the
 * amount of data in the window, or is there still a super-linear term hiding?
 * The answer decides whether the free-tier CPU budget is reachable by
 * optimisation or only by shrinking the window (#105).
 *
 * Not an assertion about absolute speed — that is #105's job and it needs
 * real Workers hardware. This asserts the *shape* of the curve, which is a
 * property of the code and transfers across machines.
 */
import { describe, it, expect } from 'vitest';
import {
  expandRecurringSeries,
  applyOverrides,
  reconcileInstances,
  computeForecast,
  type ActualTransaction,
  type Frequency,
  type RecurringDef,
} from '../../backend/src/services/forecast.js';

const MS_PER_DAY = 86_400_000;
const ANCHOR = Date.parse('2026-06-15T00:00:00Z');

function day(offset: number): string {
  return new Date(ANCHOR + offset * MS_PER_DAY).toISOString().slice(0, 10);
}

/** A household scaled to `windowDays`, with data density held constant. */
function buildLoad(windowDays: number) {
  const back = Math.floor(windowDays / 5);
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
    nextDate: day(-back + (i % 14)),
    endDate: null,
    status: 'active',
  }));

  // Roughly nine actuals per trailing day, so the input grows with the window
  // rather than staying fixed — otherwise this would measure the day walk
  // alone and miss anything quadratic in transaction count.
  const actualCount = back * 9;
  const actuals: ActualTransaction[] = Array.from({ length: actualCount }, (_, i) => ({
    id: `txn-${i}`,
    date: day(-(i % back)),
    description: `Posted transaction ${i}`,
    amount: (i % 9 === 0 ? 1 : -1 * ((i % 120) + 0.99)).toFixed(2),
    type: i % 10 === 0 ? ('manual' as const) : ('actual' as const),
  }));

  return { series, actuals, start: day(-back), end: day(windowDays - back) };
}

function runPipeline(load: ReturnType<typeof buildLoad>): number {
  const { series, actuals, start, end } = load;

  const instances = series.flatMap((s) => {
    const expanded = expandRecurringSeries(s, start, end);
    const withOverrides = applyOverrides(expanded, []);
    return reconcileInstances(s.accountId, actuals, withOverrides);
  });

  return computeForecast(actuals, instances, actuals, start, end, '4210.55').length;
}

/** Median of repeated runs — the mean is hostage to one GC pause. */
function timePipeline(windowDays: number, runs = 15): number {
  const load = buildLoad(windowDays);
  for (let i = 0; i < 5; i++) runPipeline(load); // JIT warmup

  const samples: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = Date.now();
    runPipeline(load);
    samples.push(Date.now() - t0);
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)]!;
}

describe('forecast pipeline scaling', () => {
  it('grows no worse than linearly as the window grows 8x', () => {
    const sizes = [113, 226, 452, 904];
    const timings = sizes.map((n) => ({ days: n, ms: timePipeline(n) }));

    console.log(
      'window scaling: ' +
        timings.map((t) => `${t.days}d=${t.ms}ms`).join('  '),
    );

    const first = timings[0]!;
    const last = timings[timings.length - 1]!;
    const sizeRatio = last.days / first.days;

    // Quadratic over an 8x growth would be ~64x. Linear is ~8x. The ceiling
    // is set at 3x linear so that noise on a shared runner cannot fail it
    // while anything genuinely super-linear still does.
    const timeRatio = last.ms / Math.max(first.ms, 1);
    console.log(
      `size x${sizeRatio}, time x${timeRatio.toFixed(1)} (quadratic would be x${(sizeRatio ** 2).toFixed(0)})`,
    );

    expect(timeRatio).toBeLessThan(sizeRatio * 3);
  });

  it('still produces one day per day at every size', () => {
    // A scaling test that silently computed less at larger sizes would show a
    // flattering curve for the wrong reason.
    for (const n of [113, 226, 452]) {
      expect(runPipeline(buildLoad(n))).toBe(n + 1);
    }
  });
});
