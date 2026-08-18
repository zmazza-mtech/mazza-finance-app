import { useContext, useMemo, useState } from 'react';
import { CalendarTimeline } from '@/components/calendar/CalendarTimeline';
import { ProjectionPanel } from '@/components/calendar/ProjectionPanel';
import { BalanceAlertBanner } from '@/components/layout/BalanceAlertBanner';
import { useToast } from '@/components/shared/Toast';
import { useForecast, useAddTransaction } from '@/hooks/useForecast';
import { useThresholds } from '@/hooks/useSettings';
import { useCategoryTrend } from '@/hooks/useReports';
import { AccountContext } from '@/App';
import { findMatchingDates } from '@/lib/search';
import { todayIso, lastDayOfMonth } from '@/lib/dates';

/**
 * Calendar page — shows a monthly grid view centered on currentMonth.
 * Loads a ±3-month window around the visible month for smooth navigation.
 */
export function CalendarPage() {
  const { selectedAccountId } = useContext(AccountContext);
  const [currentMonth, setCurrentMonth] = useState(() => todayIso().slice(0, 7));
  const [searchQuery, setSearchQuery] = useState('');

  /** A day the balance banner asked the calendar to show. Cleared once honoured. */
  const [requestedDate, setRequestedDate] = useState<string | null>(null);

  const { showToast } = useToast();

  const startDate = firstDayOfMonth(addMonths(currentMonth, -3));
  const endDate = lastDayOfMonth(addMonths(currentMonth, 3));

  const { greenThreshold, yellowThreshold: criticalThreshold } = useThresholds();

  const { data: forecastDays = [], isLoading, isError } = useForecast(
    selectedAccountId,
    startDate,
    endDate,
  );

  const matchingDates = useMemo(
    () => findMatchingDates(forecastDays, searchQuery),
    [forecastDays, searchQuery],
  );

  // The projection panel covers the viewed month only, not the ±3 window.
  const monthDays = useMemo(
    () => forecastDays.filter((d) => d.date.startsWith(currentMonth)),
    [forecastDays, currentMonth],
  );

  // Four buckets: the viewed month plus the three it is compared against.
  const { data: trend } = useCategoryTrend({
    accountId: selectedAccountId,
    asOf: trendAsOf(currentMonth, todayIso()),
    months: 4,
  });

  const addTransaction = useAddTransaction(selectedAccountId, startDate, endDate);

  function handleAddTransaction(data: {
    accountId: string;
    date: string;
    description: string;
    amount: string;
  }) {
    addTransaction.mutate(data, {
      onError: (error) => {
        // The optimistic row has already rolled back off the calendar. Without
        // this the user is left believing they recorded a transaction that was
        // never persisted, and every forecast after it is wrong.
        showToast(
          `Could not add "${data.description}" — ${
            error instanceof Error ? error.message : 'the change was not saved'
          }.`,
        );
      },
    });
  }

  /** The banner's "View" link: move to the day's month, then to the day itself. */
  function handleViewDate(date: string) {
    setCurrentMonth(date.slice(0, 7));
    setRequestedDate(date);
  }

  if (!selectedAccountId) {
    return (
      <div className="flex h-64 items-center justify-center text-stone">
        <p>Select an account to view the forecast.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="spinner-sage" role="status" aria-label="Loading forecast" />
      </div>
    );
  }

  if (isError) {
    return (
      <div role="alert" className="p-4 text-center text-error">
        Failed to load forecast. Please try refreshing.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-shell px-6 py-6">
      <BalanceAlertBanner
        forecastDays={forecastDays}
        greenThreshold={greenThreshold}
        criticalThreshold={criticalThreshold}
        onViewDate={handleViewDate}
      />

      <ProjectionPanel
        days={monthDays}
        todayDate={todayIso()}
        comfortFloor={greenThreshold}
        trendMonths={trend?.months ?? []}
      />

      <CalendarTimeline
        days={forecastDays}
        accountId={selectedAccountId}
        todayDate={todayIso()}
        currentMonth={currentMonth}
        greenThreshold={greenThreshold}
        criticalThreshold={criticalThreshold}
        searchQuery={searchQuery}
        matchingDates={matchingDates}
        onSearchChange={setSearchQuery}
        onAddTransaction={handleAddTransaction}
        requestedDate={requestedDate}
        onRequestedDateHandled={() => setRequestedDate(null)}
        onPrevMonth={() => setCurrentMonth((m) => addMonths(m, -1))}
        onNextMonth={() => setCurrentMonth((m) => addMonths(m, 1))}
        onToday={() => setCurrentMonth(todayIso().slice(0, 7))}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function firstDayOfMonth(yearMonth: string): string {
  return yearMonth + '-01';
}

/**
 * The date the trend buckets are measured to.
 *
 * For the current month that is today, so the comparison is month-to-date
 * against the same span of earlier months. For any other month it is that
 * month's last day, so the bucket covers the whole month being viewed.
 */
function trendAsOf(yearMonth: string, today: string): string {
  return today.startsWith(yearMonth) ? today : lastDayOfMonth(yearMonth);
}

function addMonths(yearMonth: string, n: number): string {
  const [y, m] = yearMonth.split('-').map(Number) as [number, number];
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
