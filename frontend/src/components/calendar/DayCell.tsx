import Decimal from 'decimal.js';
import { TransactionItem } from './TransactionItem';
import { formatCurrency, formatAmount, getBalanceHealth, getBalanceHealthClasses, isNegative } from '@/lib/balance';
import { daySpend, spendIntensity, spendLevel } from '@/lib/metrics';
import { spendBarHeight } from '@/lib/chart';
import { transactionMatchesQuery } from '@/lib/search';
import type { ForecastDay, ForecastTransaction } from '@/api/types';

const MAX_VISIBLE = 3;

const SPEND_BAR_COLORS = {
  heavy: '#C1574A',
  moderate: '#C17D4A',
  light: '#A3BFA3',
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
        'flex min-h-[126px] cursor-pointer flex-col border-b border-r border-cream-mid',
        'px-2.5 pt-[9px] transition-colors duration-150 ease-out focus:outline-none',
        isSelected ? 'bg-cream shadow-[inset_0_0_0_2px_#7B9E7B]' : 'hover:bg-cream',
        isFocused && !isSelected ? 'shadow-[inset_0_0_0_1px_#A3BFA3]' : '',
        isSearchActive && !hasSearchMatch ? 'opacity-40' : '',
      ].join(' ')}
    >
      <div className="flex min-w-0 items-center justify-between gap-1">
        <span
          className={[
            'inline-flex h-[22px] min-w-[22px] shrink-0 items-center justify-center rounded-full px-[5px] font-mono text-xs',
            isToday ? 'bg-bark text-cream' : date > todayDate ? 'text-stone' : 'text-charcoal',
          ].join(' ')}
        >
          {dayOfMonth}
        </span>

        {runningBalance && (
          <span
            className={`min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-right font-mono text-[11px] ${balanceClasses}`}
          >
            {formatCurrency(runningBalance)}
          </span>
        )}
      </div>

      {visible.length > 0 && (
        <ul className="mt-1 flex min-w-0 flex-col gap-0.5">
          {visible.map((tx) => (
            <TransactionItem
              key={tx.id}
              transaction={tx}
              isMatch={isSearchActive && transactionMatchesQuery(tx, searchQuery)}
            />
          ))}
        </ul>
      )}

      <div className="mt-auto flex min-w-0 items-baseline justify-between gap-1">
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

      <div className="flex h-[26px] items-end px-1.5">
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
