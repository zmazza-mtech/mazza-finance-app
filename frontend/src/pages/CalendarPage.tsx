import { useContext } from 'react';
import { CalendarTimeline } from '@/components/calendar/CalendarTimeline';
import { BalanceAlertBanner } from '@/components/layout/BalanceAlertBanner';
import { useForecast, useAddTransaction } from '@/hooks/useForecast';
import { useThresholds } from '@/hooks/useSettings';
import { AccountContext } from '@/App';

/**
 * Calendar page — the main forecast view.
 * Loads 90 days of forecast data starting from today.
 */
export function CalendarPage() {
  const { selectedAccountId } = useContext(AccountContext);

  const today = todayIso();
  const endDate = addDays(today, 90);

  const { greenThreshold, yellowThreshold: criticalThreshold } = useThresholds();

  const { data: forecastDays = [], isLoading, isError } = useForecast(
    selectedAccountId,
    today,
    endDate,
  );

  const addTransaction = useAddTransaction(selectedAccountId, today, endDate);

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
          // TODO: scroll calendar to the target date
        }}
      />

      <CalendarTimeline
        days={forecastDays}
        accountId={selectedAccountId}
        todayDate={today}
        greenThreshold={greenThreshold}
        criticalThreshold={criticalThreshold}
        onAddTransaction={handleAddTransaction}
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

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
