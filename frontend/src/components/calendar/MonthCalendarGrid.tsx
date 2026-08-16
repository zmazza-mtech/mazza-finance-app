import { DayCell } from './DayCell';
import { maxDailySpend } from '@/lib/metrics';
import { formatMonthTitle } from '@/lib/dates';
import type { ForecastDay } from '@/api/types';

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;

interface MonthCalendarGridProps {
  yearMonth: string; // 'YYYY-MM'
  days: ForecastDay[];
  focusedDate: string | null;
  selectedDate: string | null;
  todayDate: string;
  greenThreshold: string;
  criticalThreshold: string;
  searchQuery: string;
  matchingDates: Set<string>;
  onFocusDate: (date: string) => void;
  onSelectDate: (date: string) => void;
  onActivateDate: (date: string) => void;
}

/**
 * A single month as a seven-column calendar card. Weeks start on Sunday and
 * filler cells pad the first and last partial weeks.
 *
 * The month heading and navigation controls live in the section header above
 * this card, not inside it.
 */
export function MonthCalendarGrid({
  yearMonth,
  days,
  focusedDate,
  selectedDate,
  todayDate,
  greenThreshold,
  criticalThreshold,
  searchQuery,
  matchingDates,
  onFocusDate,
  onSelectDate,
  onActivateDate,
}: MonthCalendarGridProps) {
  const [year, month] = yearMonth.split('-').map(Number) as [number, number];

  // month is 1-indexed; JS Date month is 0-indexed
  const firstDay = new Date(year, month - 1, 1);
  const startPadding = firstDay.getDay(); // 0 = Sunday
  const daysInMonth = new Date(year, month, 0).getDate();

  const dayMap = new Map<string, ForecastDay>();
  for (const d of days) {
    dayMap.set(d.date, d);
  }

  // The bar scale is the month's own heaviest day, so intensity is relative to
  // this month rather than to the whole forecast window.
  const monthDays = days.filter((d) => d.date.startsWith(yearMonth));
  const monthMaxSpend = maxDailySpend(monthDays);

  const totalCells = startPadding + daysInMonth;
  const trailingPadding = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);

  const fillerClass = 'border-b border-r border-cream-mid bg-surface-muted min-h-[126px]';

  return (
    <div className="overflow-hidden rounded-lg border border-cream-mid bg-surface">
      <div className="grid grid-cols-7 border-b border-cream-mid bg-cream">
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className="py-2.5 text-center font-mono text-[10px] uppercase tracking-label-wide text-stone"
          >
            {day}
          </div>
        ))}
      </div>

      <div role="grid" aria-label={`${formatMonthTitle(yearMonth)} ${year}`} className="grid grid-cols-7">
        {Array.from({ length: startPadding }).map((_, i) => (
          <div key={`pre-${i}`} aria-hidden="true" className={fillerClass} />
        ))}

        {Array.from({ length: daysInMonth }).map((_, i) => {
          const dayNum = i + 1;
          const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
          const dayData = dayMap.get(dateStr);

          return (
            <DayCell
              key={dateStr}
              date={dateStr}
              transactions={dayData?.transactions ?? []}
              runningBalance={dayData?.runningBalance ?? ''}
              dailyNet={dayData?.dailyNet ?? ''}
              maxDailySpend={monthMaxSpend}
              todayDate={todayDate}
              isToday={dateStr === todayDate}
              isFocused={dateStr === focusedDate}
              isSelected={dateStr === selectedDate}
              greenThreshold={greenThreshold}
              criticalThreshold={criticalThreshold}
              isSearchActive={searchQuery.length > 0}
              hasSearchMatch={matchingDates.has(dateStr)}
              searchQuery={searchQuery}
              onFocus={onFocusDate}
              onSelect={onSelectDate}
              onActivate={onActivateDate}
            />
          );
        })}

        {Array.from({ length: trailingPadding }).map((_, i) => (
          <div key={`post-${i}`} aria-hidden="true" className={fillerClass} />
        ))}
      </div>
    </div>
  );
}
