import { useState, useContext } from 'react';
import { AccountContext } from '@/App';
import { DateRangePicker } from '@/components/shared/DateRangePicker';
import { ReportsChartCard } from '@/components/reports/ReportsChartCard';
import { CategorySummaryTable } from '@/components/reports/CategorySummaryTable';
import { formatDateRange } from '@/lib/dates';
import { useCategorySummary } from '@/hooks/useReports';

function defaultStartDate(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}

function defaultEndDate(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
}

export function ReportsPage() {
  const { selectedAccountId } = useContext(AccountContext);
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate);

  const { data, isLoading, error } = useCategorySummary({
    accountId: selectedAccountId,
    startDate,
    endDate,
  });

  return (
    <div className="mx-auto max-w-shell px-6 py-6">
      <h1 className="font-display text-4xl text-bark-dark">Reports</h1>
      <p className="mt-1 text-[15px] text-stone">
        {formatDateRange(startDate, endDate)} · settled transactions only
      </p>

      <div className="mb-6 mt-4">
        <DateRangePicker
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
        />
      </div>

      {isLoading && (
        <div className="flex h-64 items-center justify-center">
          <div className="spinner-sage" role="status" aria-label="Loading report data" />
        </div>
      )}

      {error && (
        <p role="alert" className="py-8 text-center text-sm text-error">
          Failed to load report data.
        </p>
      )}

      {data && (
        <div className="space-y-4">
          <ReportsChartCard data={data} />

          <div className="grid gap-4 md:grid-cols-2">
            <CategorySummaryTable title="Income" items={data.income} />
            <CategorySummaryTable title="Expenses" items={data.expenses} />
          </div>
        </div>
      )}
    </div>
  );
}
