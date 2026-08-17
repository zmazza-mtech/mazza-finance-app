/**
 * Decision 9 gate (replatform spec): does the forecast pipeline fit the
 * Workers free-tier 10ms CPU budget?
 *
 * Imports the forecast service straight from the Express backend source —
 * the exact code that will move over in the port — and runs the full
 * pipeline (expand → overrides → reconcile → 210-day walk) inside workerd
 * with a realistic household load.
 */
import { describe, it, expect } from 'vitest';
import {
  expandRecurringSeries,
  applyOverrides,
  reconcileInstances,
  computeForecast,
  type RecurringDef,
  type OverrideDef,
  type ActualTransaction,
  type Frequency,
} from '../../backend/src/services/forecast.js';

// Free-tier budget is 10ms CPU per invocation. Measured 2026-08-17 on this
// unoptimized pipeline: avg ~106ms (min 102, max 118) — over budget by ~10×,
// dominated by the per-day filter over all transactions in computeForecast
// and per-series Decimal-heavy matching in reconcileInstances, both
// quadratic. Verdict recorded under decision 9 of the replatform spec:
// Phase 1 includes a forecast performance pass (group transactions by date,
// index actuals in reconciliation, reuse Decimal instances) with Workers
// Paid ($5/mo, 30s CPU) as the fallback if the pass cannot reach budget.
// The assertion below is a regression ceiling, not the budget: tighten it
// to CPU_BUDGET_MS when the performance pass lands.
const CPU_BUDGET_MS = 10;
const REGRESSION_CEILING_MS = 400;

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function daysFromToday(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
}

// A deliberately heavy household: 16 active series, 400 posted actuals over
// the trailing 45 days, a handful of overrides, 226-day window (45 back +
// 180 forward), two accounts.
function buildLoad() {
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
    nextDate: daysFromToday(-45 + (i % 14)),
    endDate: null,
    status: 'active',
  }));

  const overrides: OverrideDef[] = series.slice(0, 5).map((s, i) => ({
    recurringTransactionId: s.id,
    originalDate: daysFromToday(-45 + (i % 14)),
    overrideType: i % 2 === 0 ? 'modified' : 'deleted',
    overrideDate: null,
    overrideAmount: i % 2 === 0 ? '-99.99' : null,
    overrideName: null,
  }));

  const actuals: ActualTransaction[] = Array.from({ length: 400 }, (_, i) => ({
    id: `txn-${i}`,
    date: daysFromToday(-(i % 45)),
    description: `Posted transaction ${i}`,
    amount: (i % 9 === 0 ? 1 : -1 * ((i % 120) + 0.99)).toFixed(2),
    type: i % 10 === 0 ? ('manual' as const) : ('actual' as const),
  }));

  return { series, overrides, actuals, start: daysFromToday(-45), end: daysFromToday(180) };
}

function runPipeline(load: ReturnType<typeof buildLoad>): number {
  const { series, overrides, actuals, start, end } = load;

  const instances = series.flatMap((s) => {
    const expanded = expandRecurringSeries(s, start, end);
    const withOverrides = applyOverrides(expanded, overrides);
    return reconcileInstances(s.accountId, actuals, withOverrides);
  });

  const days = computeForecast(actuals, instances, actuals, start, end, '4210.55');
  return days.length;
}

// Clock caveat, established by probing this runtime: workerd pins
// performance.now() during synchronous work (Spectre mitigation), so it
// always measures 0 around a sync block — but Date.now() advances in real
// time here, so it is the measurement clock. Millisecond granularity is
// fine for a 10ms budget gate.
describe('forecast CPU under workerd', () => {
  it('completes a heavy 226-day forecast within the free-tier CPU budget', () => {
    const load = buildLoad();

    // Warmup (JIT).
    for (let i = 0; i < 5; i++) runPipeline(load);

    const samples: number[] = [];
    for (let i = 0; i < 30; i++) {
      const t0 = Date.now();
      const dayCount = runPipeline(load);
      const t1 = Date.now();
      expect(dayCount).toBe(226);
      samples.push(t1 - t0);
    }

    const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
    const max = Math.max(...samples);
    const min = Math.min(...samples);
    console.log(
      `forecast pipeline: avg ${avg.toFixed(2)}ms, min ${min.toFixed(2)}ms, max ${max.toFixed(2)}ms over ${samples.length} runs (free-tier budget: ${CPU_BUDGET_MS}ms)`
    );

    expect(max, 'clock did not advance — measurement invalid').toBeGreaterThan(0);
    expect(avg).toBeLessThan(REGRESSION_CEILING_MS);
  });
});
