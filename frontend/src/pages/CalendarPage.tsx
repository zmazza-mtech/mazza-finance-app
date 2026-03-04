import { useContext, useMemo, useState } from 'react';
import { CalendarTimeline } from '@/components/calendar/CalendarTimeline';
import { BalanceAlertBanner } from '@/components/layout/BalanceAlertBanner';
import { useForecast, useAddTransaction } from '@/hooks/useForecast';
import { useThresholds } from '@/hooks/useSettings';
import { AccountContext } from '@/App';
import { findMatchingDates } from '@/lib/search';

/**
 * Calendar page — shows a monthly grid view centered on currentMonth.
 * Loads a ±3-month window around the visible month for smooth navigation.
 */
export function CalendarPage() {
  const { selectedAccountId } = useContext(AccountContext);
  const [currentMonth, setCurrentMonth] = useState(() => todayIso().slice(0, 7));
  const [searchQuery, setSearchQuery] = useState('');

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

  const addTransaction = useAddTransaction(selectedAccountId, startDate, endDate);

  function handleAddTransaction(data: {
    accountId: string;
    date: string;
    description: string;
    amount: string;
  }) {
    addTransaction.mutate(data, {
      onError: () => {
        // TODO: surface toast notification
      },
    });
  }

  if (!selectedAccountId) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500 dark:text-gray-400">
        <p>Select an account to view the forecast.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div
          className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"
          role="status"
          aria-label="Loading forecast"
        />
      </div>
    );
  }

  if (isError) {
    return (
      <div
        role="alert"
        className="p-4 text-center text-red-700 dark:text-red-400"
      >
        Failed to load forecast. Please try refreshing.
      </div>
    );
  }

  return (
    <>
      <BalanceAlertBanner
        forecastDays={forecastDays}
        greenThreshold={greenThreshold}
        criticalThreshold={criticalThreshold}
        onViewDate={() => {
          // TODO: navigate calendar to target date
        }}
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
        onPrevMonth={() => setCurrentMonth((m) => addMonths(m, -1))}
        onNextMonth={() => setCurrentMonth((m) => addMonths(m, 1))}
        onToday={() => setCurrentMonth(todayIso().slice(0, 7))}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function firstDayOfMonth(yearMonth: string): string {
  return yearMonth + '-01';
}

function lastDayOfMonth(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number) as [number, number];
  return new Date(y, m, 0).toISOString().slice(0, 10);
}

function addMonths(yearMonth: string, n: number): string {
  const [y, m] = yearMonth.split('-').map(Number) as [number, number];
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
