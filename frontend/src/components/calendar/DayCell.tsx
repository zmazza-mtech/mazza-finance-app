import Decimal from 'decimal.js';
import { TransactionItem } from './TransactionItem';
import {
  formatCurrency,
  formatCompactBalance,
  formatAmount,
  getBalanceHealth,
  getBalanceHealthClasses,
  isNegative,
} from '@/lib/balance';
import { daySpend, spendIntensity, spendLevel } from '@/lib/metrics';
import { spendBarHeight } from '@/lib/chart';
import { transactionMatchesQuery } from '@/lib/search';
import type { ForecastDay, ForecastTransaction } from '@/api/types';

const MAX_VISIBLE = 3;

// Read through the tokens so the bars follow the theme.
const SPEND_BAR_COLORS = {
  heavy: 'rgb(var(--c-error))',
  moderate: 'rgb(var(--c-copper))',
  light: 'rgb(var(--c-sage-light))',
} as const;

interface DayCellProps {
  date: string; // YYYY-MM-DD
  transactions: ForecastTransaction[];
  runningBalance: string; // empty string if no data for this day
  dailyNet: string; // empty string if no data for this day
  /** Heaviest single-day spend in the month, for the bar scale. */
  maxDailySpend: string;
  todayDate: string;
  isToday: boolean;
  isFocused: boolean;
  isSelected: boolean;
  greenThreshold: string;
  criticalThreshold: string;
  isSearchActive: boolean;
  hasSearchMatch: boolean;
  searchQuery: string;
  onFocus: (date: string) => void;
  onSelect: (date: string) => void;
  onActivate: (date: string) => void;
}

/**
 * A single day cell in the monthly calendar grid.
 *
 * Top to bottom: a day chip and the running balance, up to three named
 * transactions, a foot row carrying the overflow count and the day net, and a
 * spend-intensity bar.
 *
 * Every text span truncates and every flex row sets a zero min-width. Without
 * that the running balance paints over the neighbouring cell once the grid
 * narrows.
 *
 * Clicking anywhere selects the day, which drives the day panel. Enter and
 * Space still open the add-transaction modal, so keyboard entry keeps working
 * without a visible button in the cell.
 */
export function DayCell({
  date,
  transactions,
  runningBalance,
  dailyNet,
  maxDailySpend,
  todayDate,
  isToday,
  isFocused,
  isSelected,
  greenThreshold,
  criticalThreshold,
  isSearchActive,
  hasSearchMatch,
  searchQuery,
  onFocus,
  onSelect,
  onActivate,
}: DayCellProps) {
  const dayOfMonth = parseInt(date.split('-')[2]!, 10);
  const visible = transactions.slice(0, MAX_VISIBLE);
  const overflowCount = transactions.length - MAX_VISIBLE;

  const health = runningBalance
    ? getBalanceHealth(runningBalance, greenThreshold, criticalThreshold)
    : null;
  const balanceClasses = health ? getBalanceHealthClasses(health) : 'text-warm-gray';

  const asDay: ForecastDay = { date, transactions, dailyNet: dailyNet || '0', runningBalance };
  const spend = daySpend(asDay);
  const intensity = spendIntensity(spend, maxDailySpend);
  const barHeight = spendBarHeight(intensity);

  const netIsNegative = dailyNet ? isNegative(dailyNet) : false;
  const showNet = dailyNet !== '' && !new Decimal(dailyNet).isZero();

  return (
    <div
      data-date={date}
      role="gridcell"
      aria-label={`${date}${isToday ? ', today' : ''}`}
      aria-selected={isSelected}
      tabIndex={isFocused ? 0 : -1}
      onFocus={() => onFocus(date)}
      onClick={() => onSelect(date)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onActivate(date);
        }
      }}
      className={[
        'flex min-h-[62px] cursor-pointer flex-col border-b border-r border-cream-mid',
        'px-0.5 pt-1.5 transition-colors duration-150 ease-out focus:outline-none',
        'sm:min-h-[126px] sm:px-2.5 sm:pt-[9px]',
        isSelected ? 'bg-cream shadow-[inset_0_0_0_2px_rgb(var(--c-sage))]' : 'hover:bg-cream',
        isFocused && !isSelected ? 'shadow-[inset_0_0_0_1px_rgb(var(--c-sage-light))]' : '',
        isSearchActive && !hasSearchMatch ? 'opacity-40' : '',
      ].join(' ')}
    >
      <div className="flex min-w-0 flex-col items-center gap-0.5 sm:flex-row sm:items-center sm:justify-between sm:gap-1">
        <span
          className={[
            'inline-flex h-[22px] min-w-[22px] shrink-0 items-center justify-center rounded-full px-[5px] font-mono text-xs',
            isToday ? 'bg-bark text-cream' : date > todayDate ? 'text-stone' : 'text-charcoal',
          ].join(' ')}
        >
          {dayOfMonth}
        </span>

        {runningBalance && (
          <>
            <span
              className={`min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[9px] leading-tight sm:hidden ${balanceClasses}`}
            >
              {formatCompactBalance(runningBalance)}
            </span>
            <span
              className={`hidden min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-right font-mono text-[11px] sm:inline ${balanceClasses}`}
            >
              {formatCurrency(runningBalance)}
            </span>
          </>
        )}
      </div>

      {/*
        The phone cell has no room for named transactions, so it shows a count
        instead. `display:none` takes whichever of the two is inactive out of
        the accessibility tree, so nothing is announced twice — but a bare
        "3×" read aloud is not a sentence, hence the spoken form beside it.
      */}
      {transactions.length > 0 && (
        <span className="text-center font-mono text-[8px] leading-tight text-warm-gray sm:hidden">
          <span aria-hidden="true">{transactions.length}×</span>
          <span className="sr-only">
            {transactions.length} {transactions.length === 1 ? 'transaction' : 'transactions'}
          </span>
        </span>
      )}

      {visible.length > 0 && (
        <ul className="mt-1 hidden min-w-0 flex-col gap-0.5 sm:flex">
          {visible.map((tx) => (
            <TransactionItem
              key={tx.id}
              transaction={tx}
              isMatch={isSearchActive && transactionMatchesQuery(tx, searchQuery)}
            />
          ))}
        </ul>
      )}

      <div className="mt-auto hidden min-w-0 items-baseline justify-between gap-1 sm:flex">
        <span className="min-w-0 truncate font-mono text-[10px] tracking-[0.08em] text-warm-gray">
          {overflowCount > 0 ? `+${overflowCount} MORE` : ''}
        </span>
        <span
          className={`min-w-0 truncate font-mono text-[10px] ${
            netIsNegative ? 'text-stone' : 'text-sage-deep'
          }`}
        >
          {showNet ? `NET ${netIsNegative ? '−' : '+'}$${formatAmount(dailyNet)}` : ''}
        </span>
      </div>

      <div className="flex h-[14px] items-end px-1 sm:h-[26px] sm:px-1.5">
        {barHeight > 0 && (
          <div
            aria-hidden="true"
            className="w-full rounded-t-sm"
            style={{
              height: `${barHeight}px`,
              backgroundColor: SPEND_BAR_COLORS[spendLevel(intensity)],
            }}
          />
        )}
      </div>
    </div>
  );
}
