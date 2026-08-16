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
    <p className="mb-1.5 font-mono text-[10px] uppercase tracking-label-wide text-panel-ink-faint">
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
    <section
      aria-label="Balance projection"
      className="mb-4 flex flex-col rounded-xl bg-panel px-4 pb-4 pt-5 sm:mb-5 sm:px-7 sm:pb-5 sm:pt-6"
    >
      {/*
        `display: contents` below `sm` dissolves this wrapper, so the headline
        and the stats become direct flex children of the section and `order`
        can move the stats below the chart — the handoff's phone order, where
        the chart is the payload directly under the projected figure. From
        `sm` up the wrapper is a real row again and the two sit side by side.
      */}
      <div className="contents sm:flex sm:flex-wrap sm:items-start sm:justify-between sm:gap-8">
        <div>
          <p className="mb-1.5 font-mono text-[10px] uppercase tracking-label-wide text-panel-positive">
            Projected balance · through {formatShortDate(lastDate)}
          </p>
          <h2 className="font-display text-3xl leading-[1.05] tracking-[-0.02em] text-panel-ink sm:text-4xl">
            {projected === null ? EM_DASH : formatCurrency(projected)}
          </h2>
          {low !== null && (
            <p className="mt-1.5 text-[13px] text-panel-warning">
              Low point {formatCurrency(low.balance)} on {formatShortDate(low.date)} —{' '}
              {belowFloor
                ? `under your ${formatWholeCurrency(comfortFloor)} comfort floor`
                : 'still above your comfort floor'}
            </p>
          )}
        </div>

        <div className="order-last mt-3 grid grid-cols-3 gap-2 sm:order-none sm:mt-0 sm:flex sm:flex-wrap sm:gap-7">
          <div className="rounded-md bg-panel-ink/[0.06] p-2.5 sm:bg-transparent sm:p-0">
            <StatLabel>Burn rate</StatLabel>
            <p className="font-mono text-[13px] text-panel-ink sm:text-xl">
              {rate === null ? (
                EM_DASH
              ) : (
                <>
                  {/* Whole dollars: an average to the cent is false precision. */}
                  {formatWholeCurrency(rate)}
                  <span className="text-xs text-panel-ink-muted">/day</span>
                </>
              )}
            </p>
            {runwayDays !== null && (
              <p className="mt-1 text-xs text-panel-ink-muted">{runwayDays} days runway</p>
            )}
          </div>

          <div className="rounded-md bg-panel-ink/[0.06] p-2.5 sm:bg-transparent sm:p-0">
            <StatLabel>{state === 'current' ? 'Spent MTD' : 'Spent'}</StatLabel>
            <p className="font-mono text-[13px] text-panel-ink sm:text-xl">{formatCurrency(spent)}</p>
            {comparison !== null && comparison.direction !== 'even' && (
              <p
                className={`mt-1 text-xs ${
                  comparison.direction === 'above' ? 'text-panel-warning' : 'text-panel-positive'
                }`}
              >
                {comparison.direction === 'above' ? '▲' : '▼'} {comparison.percent}% vs. average
              </p>
            )}
          </div>

          <div className="rounded-md bg-panel-ink/[0.06] p-2.5 sm:bg-transparent sm:p-0">
            <StatLabel>Biggest mover</StatLabel>
            <p className="font-mono text-[13px] text-panel-ink sm:text-xl">{mover?.category ?? EM_DASH}</p>
            {mover !== null && (
              <p className="mt-1 text-xs text-panel-ink-muted">
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

      <div className="flex justify-between font-mono text-[10px] uppercase tracking-label text-panel-ink-faint">
        <span>{formatAxisDate(firstDate)}</span>
        <span>{state === 'current' ? `Today · ${formatAxisDate(todayDate)}` : ''}</span>
        <span>
          {formatAxisDate(lastDate)}
          <span className="hidden sm:inline"> · Solid = settled, dashed = forecast</span>
        </span>
      </div>
    </section>
  );
}
