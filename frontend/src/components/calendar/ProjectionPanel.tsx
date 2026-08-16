import { useMemo } from 'react';
import Decimal from 'decimal.js';
import type { ForecastDay, CategoryTrendMonth } from '@/api/types';
import { formatCurrency, formatAmount, formatWholeCurrency } from '@/lib/balance';
import { formatShortDate, formatAxisDate, formatMonthTitle } from '@/lib/dates';
import { buildBalanceChart } from '@/lib/chart';
import { spentThrough, burnRate, runway, lowPoint, endBalance } from '@/lib/metrics';
import { averageSpend, spendVsAverage, biggestMover } from '@/lib/trends';
import { BalanceChart } from './BalanceChart';

/** Where the viewed month sits relative to today. */
type MonthState = 'current' | 'past' | 'future';

interface ProjectionPanelProps {
  /** The viewed month only, not the full forecast window. */
  days: ForecastDay[];
  todayDate: string;
  /** The `good` balance threshold, which the design calls the comfort floor. */
  comfortFloor: string;
  /** Trailing buckets from category-trend, newest first, index 0 = viewed month. */
  trendMonths: CategoryTrendMonth[];
}

const EM_DASH = '—';

function monthState(days: ForecastDay[], todayDate: string): MonthState {
  if (todayDate < days[0].date) return 'future';
  if (todayDate > days[days.length - 1].date) return 'past';
  return 'current';
}

function StatLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1.5 font-mono text-[10px] uppercase tracking-label-wide text-stone">
      {children}
    </p>
  );
}

/**
 * The always-on spend-trending strip above the calendar.
 *
 * Tracks the *viewed* month rather than always showing the current one. A past
 * month has no forecast segment and no today divider, and its burn rate and
 * runway read as an em dash — both are present-tense ideas that say nothing
 * about a month already spent. A future month is entirely forecast.
 */
export function ProjectionPanel({
  days,
  todayDate,
  comfortFloor,
  trendMonths,
}: ProjectionPanelProps) {
  const geometry = useMemo(
    () => buildBalanceChart({ days, todayDate, comfortFloor }),
    [days, todayDate, comfortFloor],
  );

  if (days.length === 0) return null;

  const state = monthState(days, todayDate);
  const firstDate = days[0].date;
  const lastDate = days[days.length - 1].date;

  const projected = endBalance(days);
  const low = lowPoint(days);

  // A past or future month has no "to date" — the whole month is the span.
  const spent = spentThrough(days, state === 'current' ? todayDate : lastDate);

  const daysElapsed = state === 'current' ? Number(todayDate.slice(8, 10)) : 0;
  const rate = state === 'current' ? burnRate(spent, daysElapsed) : null;
  const runwayDays = projected === null ? null : runway(projected, rate);

  const comparison = spendVsAverage(spent, averageSpend(trendMonths.slice(1, 4)));
  const mover = biggestMover(trendMonths);
  const moverRose = mover !== null && new Decimal(mover.change).isPositive();

  const belowFloor =
    low !== null && new Decimal(low.balance).lessThanOrEqualTo(new Decimal(comfortFloor));

  return (
    <section aria-label="Balance projection" className="mb-5 rounded-xl bg-espresso px-7 pb-5 pt-6">
      <div className="flex flex-wrap items-start justify-between gap-8">
        <div>
          <p className="mb-1.5 font-mono text-[10px] uppercase tracking-label-wide text-sage-light">
            Projected balance · through {formatShortDate(lastDate)}
          </p>
          <h2 className="font-display text-4xl leading-[1.05] tracking-[-0.02em] text-cream">
            {projected === null ? EM_DASH : formatCurrency(projected)}
          </h2>
          {low !== null && (
            <p className="mt-1.5 text-[13px] text-copper-light">
              Low point {formatCurrency(low.balance)} on {formatShortDate(low.date)} —{' '}
              {belowFloor
                ? `under your ${formatWholeCurrency(comfortFloor)} comfort floor`
                : 'still above your comfort floor'}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-7">
          <div>
            <StatLabel>Burn rate</StatLabel>
            <p className="font-mono text-xl text-cream">
              {rate === null ? (
                EM_DASH
              ) : (
                <>
                  {/* Whole dollars: an average to the cent is false precision. */}
                  {formatWholeCurrency(rate)}
                  <span className="text-xs text-warm-gray">/day</span>
                </>
              )}
            </p>
            {runwayDays !== null && (
              <p className="mt-1 text-xs text-warm-gray">{runwayDays} days runway</p>
            )}
          </div>

          <div>
            <StatLabel>{state === 'current' ? 'Spent MTD' : 'Spent'}</StatLabel>
            <p className="font-mono text-xl text-cream">{formatCurrency(spent)}</p>
            {comparison !== null && comparison.direction !== 'even' && (
              <p
                className={`mt-1 text-xs ${
                  comparison.direction === 'above' ? 'text-copper-light' : 'text-sage-light'
                }`}
              >
                {comparison.direction === 'above' ? '▲' : '▼'} {comparison.percent}% vs. average
              </p>
            )}
          </div>

          <div>
            <StatLabel>Biggest mover</StatLabel>
            <p className="font-mono text-xl text-cream">{mover?.category ?? EM_DASH}</p>
            {mover !== null && (
              <p className="mt-1 text-xs text-warm-gray">
                {moverRose ? '+' : '−'}${formatAmount(mover.change)} vs.{' '}
                {formatMonthTitle(mover.previousMonth)}
              </p>
            )}
          </div>
        </div>
      </div>

      <BalanceChart
        geometry={geometry}
        label={`Balance from ${formatShortDate(firstDate)} to ${formatShortDate(lastDate)}${
          low ? `, low point ${formatCurrency(low.balance)} on ${formatShortDate(low.date)}` : ''
        }`}
      />

      <div className="flex justify-between font-mono text-[10px] uppercase tracking-label text-stone">
        <span>{formatAxisDate(firstDate)}</span>
        <span>{state === 'current' ? `Today · ${formatAxisDate(todayDate)}` : ''}</span>
        <span>{formatAxisDate(lastDate)} · Solid = settled, dashed = forecast</span>
      </div>
    </section>
  );
}
