import { TransactionItem } from './TransactionItem';
import { formatCurrency, getBalanceHealth, getBalanceHealthClasses } from '@/lib/balance';
import { transactionMatchesQuery } from '@/lib/search';
import type { ForecastTransaction } from '@/api/types';

const MAX_VISIBLE = 2;

interface DayCellProps {
  date: string; // YYYY-MM-DD
  transactions: ForecastTransaction[];
  runningBalance: string; // empty string if no data for this day
  isToday: boolean;
  isFocused: boolean;
  greenThreshold: string;
  criticalThreshold: string;
  isSearchActive: boolean;
  hasSearchMatch: boolean;
  searchQuery: string;
  onFocus: (date: string) => void;
  onActivate: (date: string) => void;
  onAddTransaction: (date: string) => void;
  onShowMore: (date: string, anchor: HTMLElement) => void;
}

/**
 * A single day cell in the monthly calendar grid.
 * - Participates in roving tabindex (tabIndex controlled by parent)
 * - Date number top-left; running balance bottom-right with health color
 * - Shows first 2 transactions; "N more" button triggers a positioned popover
 * - Today's cell has a blue ring inset and blue date number
 */
export function DayCell({
  date,
  transactions,
  runningBalance,
  isToday,
  isFocused,
  greenThreshold,
  criticalThreshold,
  isSearchActive,
  hasSearchMatch,
  searchQuery,
  onFocus,
  onActivate,
  onAddTransaction,
  onShowMore,
}: DayCellProps) {
  const dayOfMonth = parseInt(date.split('-')[2]!, 10);
  const visible = transactions.slice(0, MAX_VISIBLE);
  const overflowCount = transactions.length - MAX_VISIBLE;

  const health = runningBalance
    ? getBalanceHealth(runningBalance, greenThreshold, criticalThreshold)
    : null;
  const balanceClasses = health ? getBalanceHealthClasses(health) : 'text-gray-400 dark:text-gray-600';

  return (
    <div
      data-date={date}
      role="gridcell"
      aria-label={`${date}${isToday ? ', today' : ''}`}
      tabIndex={isFocused ? 0 : -1}
      onFocus={() => onFocus(date)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onActivate(date);
        }
      }}
      className={[
        'group relative flex flex-col border-r border-b border-gray-200 dark:border-gray-700',
        'min-h-[100px] p-1.5 focus:outline-none transition-opacity',
        isToday
          ? 'ring-2 ring-inset ring-blue-500 bg-blue-50/20 dark:bg-blue-950/10'
          : 'hover:bg-gray-50/60 dark:hover:bg-gray-800/40',
        isFocused && !isToday
          ? 'ring-2 ring-inset ring-blue-400'
          : '',
        isSearchActive && !hasSearchMatch ? 'opacity-40' : '',
      ].join(' ')}
    >
      {/* Top row: date number + add button */}
      <div className="flex items-start justify-between mb-1">
        <span
          className={[
            'text-sm font-semibold leading-none',
            isToday
              ? 'text-blue-600 dark:text-blue-400'
              : 'text-gray-800 dark:text-gray-200',
          ].join(' ')}
        >
          {dayOfMonth}
        </span>

        <button
          type="button"
          aria-label={`Add transaction for ${date}`}
          onClick={(e) => {
            e.stopPropagation();
            onAddTransaction(date);
          }}
          className="opacity-0 group-hover:opacity-100 focus:opacity-100 flex items-center justify-center w-5 h-5 rounded-full text-gray-400 hover:text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900 dark:hover:text-blue-400 transition-all focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <span aria-hidden="true" className="text-xs leading-none">+</span>
        </button>
      </div>

      {/* Transaction list */}
      {visible.length > 0 && (
        <ul className="space-y-0.5 flex-1 min-w-0">
          {visible.map((tx) => (
            <TransactionItem
              key={tx.id}
              transaction={tx}
              isMatch={isSearchActive && transactionMatchesQuery(tx, searchQuery)}
            />
          ))}
        </ul>
      )}

      {/* Bottom row: overflow button + running balance */}
      <div className="flex items-end justify-between mt-auto pt-1">
        {overflowCount > 0 ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onShowMore(date, e.currentTarget.closest('[role="gridcell"]') as HTMLElement);
            }}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline focus:outline-none focus:ring-1 focus:ring-blue-500 rounded leading-none"
            aria-label={`Show ${overflowCount} more transactions for ${date}`}
          >
            {overflowCount} more...
          </button>
        ) : (
          <span />
        )}

        {runningBalance && (
          <span className={`text-xs font-medium leading-none ${balanceClasses}`}>
            {formatCurrency(runningBalance)}
          </span>
        )}
      </div>
    </div>
  );
}
