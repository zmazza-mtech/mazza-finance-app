import { useContext, useState } from 'react';
import { CalendarTimeline } from '@/components/calendar/CalendarTimeline';
import { BalanceAlertBanner } from '@/components/layout/BalanceAlertBanner';
import { useForecast, useAddTransaction } from '@/hooks/useForecast';
import { useThresholds } from '@/hooks/useSettings';
import { AccountContext } from '@/App';

const HISTORY_STEP = 90; // days per "load more" increment
const FUTURE_DAYS = 90;

/**
 * Calendar page — shows history (default 90 days back) plus 90 days forward.
 * "Load more history" extends the lookback by 90-day increments.
 */
export function CalendarPage() {
  const { selectedAccountId } = useContext(AccountContext);
  const [historyDays, setHistoryDays] = useState(HISTORY_STEP);

  const today = todayIso();
  const startDate = addDays(today, -historyDays);
  const endDate = addDays(today, FUTURE_DAYS);

  const { greenThreshold, yellowThreshold: criticalThreshold } = useThresholds();

  const { data: forecastDays = [], isLoading, isError } = useForecast(
    selectedAccountId,
    startDate,
    endDate,
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
          // TODO: scroll calendar to the target date
        }}
      />

      {/* Load more history */}
      <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setHistoryDays((d) => d + HISTORY_STEP)}
          className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
        >
          ← Load 3 more months of history
        </button>
      </div>

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
