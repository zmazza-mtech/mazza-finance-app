import { useRef } from 'react';
import { TransactionItem } from './TransactionItem';
import { formatCurrency, getBalanceHealth, getBalanceHealthClasses } from '@/lib/balance';
import type { ForecastTransaction } from '@/api/types';

const MAX_VISIBLE = 3;

interface DayCellProps {
  date: string; // YYYY-MM-DD
  transactions: ForecastTransaction[];
  dailyNet: string;
  runningBalance: string;
  isToday: boolean;
  isFocused: boolean;
  greenThreshold: string;
  criticalThreshold: string;
  onFocus: (date: string) => void;
  onActivate: (date: string) => void;
  onAddTransaction: (date: string) => void;
  onShowMore?: (date: string) => void;
}

/**
 * A single day cell in the calendar timeline.
 * - Participates in the roving tabindex pattern (tabIndex controlled by parent)
 * - Shows first 3 transactions; "N more..." for overflow
 * - Running balance colored by health thresholds
 * - Today's cell shows "Today" pill + left-border accent
 */
export function DayCell({
  date,
  transactions,
  dailyNet: _dailyNet,
  runningBalance,
  isToday,
  isFocused,
  greenThreshold,
  criticalThreshold,
  onFocus,
  onActivate,
  onAddTransaction,
  onShowMore,
}: DayCellProps) {
  const cellRef = useRef<HTMLDivElement>(null);
  const dayOfMonth = new Date(date + 'T00:00:00').getDate();
  const visible = transactions.slice(0, MAX_VISIBLE);
  const overflowCount = transactions.length - MAX_VISIBLE;

  const health = getBalanceHealth(runningBalance, greenThreshold, criticalThreshold);
  const balanceClasses = getBalanceHealthClasses(health);

  return (
    <div
      ref={cellRef}
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
      className={`relative p-2 border-b border-gray-100 dark:border-gray-800 min-h-[80px] ${
        isToday
          ? 'border-l-4 border-l-blue-500 bg-blue-50/30 dark:bg-blue-950/20'
          : 'border-l-4 border-l-transparent'
      } focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500`}
    >
      {/* Date header */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            {dayOfMonth}
          </span>
          {isToday && (
            <span className="px-1.5 py-0.5 text-xs font-medium bg-blue-500 text-white rounded-full">
              Today
            </span>
          )}
        </div>
        {/* Add transaction button — always visible on touch */}
        <button
          type="button"
          aria-label={`Add transaction for ${date}`}
          onClick={(e) => {
            e.stopPropagation();
            onAddTransaction(date);
          }}
          className="flex items-center justify-center w-6 h-6 rounded-full text-gray-400 hover:text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900 dark:hover:text-blue-400 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <span aria-hidden="true">+</span>
        </button>
      </div>

      {/* Transaction list */}
      {visible.length > 0 && (
        <ul className="space-y-0.5">
          {visible.map((tx) => (
            <TransactionItem key={tx.id} transaction={tx} />
          ))}
        </ul>
      )}

      {/* Overflow indicator */}
      {overflowCount > 0 && (
        <button
          type="button"
          onClick={() => onShowMore?.(date)}
          className="mt-0.5 text-xs text-blue-600 dark:text-blue-400 hover:underline focus:outline-none focus:ring-1 focus:ring-blue-500"
          aria-label={`Show ${overflowCount} more transactions for ${date}`}
        >
          {overflowCount} more...
        </button>
      )}

      {/* Running balance */}
      <div className={`mt-1 text-xs font-medium text-right ${balanceClasses}`}>
        {formatCurrency(runningBalance)}
      </div>
    </div>
  );
}
