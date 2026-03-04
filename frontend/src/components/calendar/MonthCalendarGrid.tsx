import type { RefObject } from 'react';
import { DayCell } from './DayCell';
import type { ForecastDay } from '@/api/types';

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;

const MONTH_NAMES = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
] as const;

interface MonthCalendarGridProps {
  yearMonth: string; // 'YYYY-MM'
  days: ForecastDay[];
  focusedDate: string | null;
  todayDate: string;
  greenThreshold: string;
  criticalThreshold: string;
  searchQuery: string;
  matchingDates: Set<string>;
  searchInputRef: RefObject<HTMLInputElement>;
  onSearchChange: (query: string) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onToday: () => void;
  onFocusDate: (date: string) => void;
  onActivateDate: (date: string) => void;
  onAddTransaction: (date: string) => void;
  onShowMore: (date: string, anchor: HTMLElement) => void;
}

/**
 * Renders a single month as a traditional 7-column calendar grid.
 * Weeks start on Sunday. Filler cells pad the first and last partial weeks.
 */
export function MonthCalendarGrid({
  yearMonth,
  days,
  focusedDate,
  todayDate,
  greenThreshold,
  criticalThreshold,
  searchQuery,
  matchingDates,
  searchInputRef,
  onSearchChange,
  onPrevMonth,
  onNextMonth,
  onToday,
  onFocusDate,
  onActivateDate,
  onAddTransaction,
  onShowMore,
}: MonthCalendarGridProps) {
  const [year, month] = yearMonth.split('-').map(Number) as [number, number];

  // month is 1-indexed; JS Date month is 0-indexed
  const firstDay = new Date(year, month - 1, 1);
  const startPadding = firstDay.getDay(); // 0 = Sunday
  const daysInMonth = new Date(year, month, 0).getDate();

  // Build a quick lookup map for the days we have data for
  const dayMap = new Map<string, ForecastDay>();
  for (const d of days) {
    dayMap.set(d.date, d);
  }

  // Trailing filler count to complete the last week row
  const totalCells = startPadding + daysInMonth;
  const trailingPadding = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);

  const isCurrentMonth = todayDate.slice(0, 7) === yearMonth;

  return (
    <div className="bg-white dark:bg-gray-900">
      {/* ---- Header ---- */}
      <div className="relative flex items-center justify-center px-4 pt-6 pb-2">
        <button
          type="button"
          onClick={onPrevMonth}
          aria-label="Previous month"
          className="absolute left-4 p-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          ‹
        </button>

        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-widest text-gray-900 dark:text-gray-100 uppercase">
            {MONTH_NAMES[month - 1]}
          </h2>
          <p className="text-sm font-normal tracking-widest text-gray-500 dark:text-gray-400 mt-0.5">
            {year}
          </p>
        </div>

        <div className="absolute right-4 flex items-center gap-2">
          <div className="relative">
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              placeholder="Search... ( / )"
              aria-label="Search transactions"
              className="w-40 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            {searchQuery && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  onSearchChange('');
                  searchInputRef.current?.blur();
                }}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xs"
              >
                ✕
              </button>
            )}
          </div>
          {!isCurrentMonth && (
            <button
              type="button"
              onClick={onToday}
              className="px-3 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 border border-blue-300 dark:border-blue-700 rounded-full hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Today
            </button>
          )}
          <button
            type="button"
            onClick={onNextMonth}
            aria-label="Next month"
            className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            ›
          </button>
        </div>
      </div>

      {/* ---- Weekday header row ---- */}
      <div className="grid grid-cols-7 border-t border-b border-gray-200 dark:border-gray-700 mt-2">
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className="py-2 text-center text-xs font-semibold tracking-widest text-gray-500 dark:text-gray-400 uppercase"
          >
            {day}
          </div>
        ))}
      </div>

      {/* ---- Day grid ---- */}
      <div
        role="grid"
        aria-label={`${MONTH_NAMES[month - 1]} ${year}`}
        className="grid grid-cols-7 border-l border-gray-200 dark:border-gray-700"
      >
        {/* Leading filler cells */}
        {Array.from({ length: startPadding }).map((_, i) => (
          <div
            key={`pre-${i}`}
            aria-hidden="true"
            className="border-r border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 min-h-[100px]"
          />
        ))}

        {/* Day cells */}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const dayNum = i + 1;
          const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
          const dayData = dayMap.get(dateStr);
          const isSearchActive = searchQuery.length > 0;
          const hasSearchMatch = matchingDates.has(dateStr);

          return (
            <DayCell
              key={dateStr}
              date={dateStr}
              transactions={dayData?.transactions ?? []}
              runningBalance={dayData?.runningBalance ?? ''}
              isToday={dateStr === todayDate}
              isFocused={dateStr === focusedDate}
              greenThreshold={greenThreshold}
              criticalThreshold={criticalThreshold}
              isSearchActive={isSearchActive}
              hasSearchMatch={hasSearchMatch}
              searchQuery={searchQuery}
              onFocus={onFocusDate}
              onActivate={onActivateDate}
              onAddTransaction={onAddTransaction}
              onShowMore={onShowMore}
            />
          );
        })}

        {/* Trailing filler cells */}
        {Array.from({ length: trailingPadding }).map((_, i) => (
          <div
            key={`post-${i}`}
            aria-hidden="true"
            className="border-r border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 min-h-[100px]"
          />
        ))}
      </div>
    </div>
  );
}
