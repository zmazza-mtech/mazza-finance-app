/**
 * Byte-identical output guard for the forecast pipeline.
 *
 * #67 optimises `computeForecast` and `matchInstancesToActuals` for the
 * Workers CPU budget. An optimisation that changes what the calendar shows is
 * not an optimisation, and the failure mode is quiet: a dropped instance or a
 * differently-ordered day reads as plausible and is only caught by someone
 * noticing their balance is wrong.
 *
 * So the whole pipeline output — every day, every transaction, every running
 * balance — is frozen against a fixture generated from the implementation as
 * it stood before the pass, and compared exactly rather than approximately.
 *
 * Regenerate deliberately, never to make a red test green:
 *   npx tsx tests/fixtures/generate-forecast-golden.ts
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  expandRecurringSeries,
  applyOverrides,
  reconcileInstances,
  computeForecast,
  advanceSeriesDate,
  type ForecastDay,
} from '../../src/services/forecast.js';
import { buildHeavyLoad, ANCHOR } from '../fixtures/heavy-forecast-load.js';

/** The pipeline exactly as `runPipeline` in the workerd bench drives it. */
export function runHeavyPipeline(): ForecastDay[] {
  const { series, overrides, actuals, start, end, seedBalance } = buildHeavyLoad();

  const instances = series.flatMap((s) => {
    const expanded = expandRecurringSeries(s, start, end);
    const withOverrides = applyOverrides(expanded, overrides);
    return reconcileInstances(s.accountId, actuals, withOverrides);
  });

  return computeForecast(actuals, instances, actuals, start, end, seedBalance);
}

const golden = JSON.parse(
  readFileSync(fileURLToPath(new URL('../fixtures/forecast-golden.json', import.meta.url)), 'utf8'),
) as { days: ForecastDay[]; advanced: (string | null)[] };

describe('forecast pipeline — frozen output', () => {
  it('reproduces every day of the golden forecast exactly', () => {
    expect(runHeavyPipeline()).toEqual(golden.days);
  });

  it('reproduces the running balance of the final day', () => {
    // Called out separately: a day-ordering change inside a single date leaves
    // the daily nets identical and only shows up in the balance that carries
    // forward, so this is the assertion that would survive a partial match.
    const days = runHeavyPipeline();
    expect(days[days.length - 1]!.runningBalance).toBe(
      golden.days[golden.days.length - 1]!.runningBalance,
    );
  });

  it('advances every series to the same date as before', () => {
    // reconcileInstances is shared with advanceSeriesDate, so an indexing
    // change in the matcher can move a series' nextDate without touching a
    // single forecast day.
    const { series, actuals } = buildHeavyLoad();
    const advanced = series.map((s) => advanceSeriesDate(s, actuals, ANCHOR));
    expect(advanced).toEqual(golden.advanced);
  });
});
