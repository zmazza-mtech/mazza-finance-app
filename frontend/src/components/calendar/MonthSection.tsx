import { DayCell } from './DayCell';
import type { ForecastDay } from '@/api/types';

interface MonthSectionProps {
  month: string; // e.g. "June 2025"
  days: ForecastDay[];
  focusedDate: string | null;
  todayDate: string;
  greenThreshold: string;
  criticalThreshold: string;
  onFocusDate: (date: string) => void;
  onActivateDate: (date: string) => void;
  onAddTransaction: (date: string) => void;
  onShowMore: (date: string) => void;
}

/**
 * Renders a sticky month header followed by a list of DayCells.
 */
export function MonthSection({
  month,
  days,
  focusedDate,
  todayDate,
  greenThreshold,
  criticalThreshold,
  onFocusDate,
  onActivateDate,
  onAddTransaction,
  onShowMore,
}: MonthSectionProps) {
  return (
    <section aria-label={month}>
      {/* Sticky month label */}
      <div className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-2">
        <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          {month}
        </h2>
      </div>

      {days.map((day) => (
        <DayCell
          key={day.date}
          date={day.date}
          transactions={day.transactions}
          dailyNet={day.dailyNet}
          runningBalance={day.runningBalance}
          isToday={day.date === todayDate}
          isFocused={day.date === focusedDate}
          greenThreshold={greenThreshold}
          criticalThreshold={criticalThreshold}
          onFocus={onFocusDate}
          onActivate={onActivateDate}
          onAddTransaction={onAddTransaction}
          onShowMore={onShowMore}
        />
      ))}
    </section>
  );
}
