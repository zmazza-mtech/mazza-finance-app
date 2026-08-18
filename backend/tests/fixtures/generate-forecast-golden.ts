/**
 * Writes `forecast-golden.json` from the current forecast implementation.
 *
 * Run deliberately, when the forecast is *meant* to produce something
 * different, and review the resulting diff. Running it to make
 * `forecastGolden.test.ts` pass defeats the only thing the fixture is for.
 *
 *   npx tsx tests/fixtures/generate-forecast-golden.ts
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  expandRecurringSeries,
  applyOverrides,
  reconcileInstances,
  computeForecast,
  advanceSeriesDate,
} from '../../src/services/forecast.js';
import { buildHeavyLoad, ANCHOR } from './heavy-forecast-load.js';

const { series, overrides, actuals, start, end, seedBalance } = buildHeavyLoad();

const instances = series.flatMap((s) => {
  const expanded = expandRecurringSeries(s, start, end);
  const withOverrides = applyOverrides(expanded, overrides);
  return reconcileInstances(s.accountId, actuals, withOverrides);
});

const days = computeForecast(actuals, instances, actuals, start, end, seedBalance);
const advanced = series.map((s) => advanceSeriesDate(s, actuals, ANCHOR));

const target = fileURLToPath(new URL('./forecast-golden.json', import.meta.url));
writeFileSync(target, JSON.stringify({ days, advanced }, null, 2) + '\n');

console.log(
  `wrote ${target}: ${days.length} days, ` +
    `${days.reduce((n, d) => n + d.transactions.length, 0)} transactions, ` +
    `final balance ${days[days.length - 1]?.runningBalance}`,
);
