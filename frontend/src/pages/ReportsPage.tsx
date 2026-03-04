import { useState, useContext } from 'react';
import { AccountContext } from '@/App';
import { DateRangePicker } from '@/components/shared/DateRangePicker';
import { SankeyChart } from '@/components/reports/SankeyChart';
import { CategorySummaryTable } from '@/components/reports/CategorySummaryTable';
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
    <div className="max-w-screen-lg mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">
        Reports
      </h1>

      <div className="mb-6">
        <DateRangePicker
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
        />
      </div>

      {isLoading && (
        <p className="text-center text-gray-500 dark:text-gray-400 py-8">Loading...</p>
      )}
      {error && (
        <p className="text-center text-red-600 dark:text-red-400 py-8">
          Failed to load report data.
        </p>
      )}
      {data && (
        <div className="space-y-8">
          {/* Sankey chart */}
          <section>
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-3">
              Income to Expense Flow
            </h2>
            <SankeyChart data={data} />
          </section>

          {/* Summary tables */}
          <div className="grid gap-8 md:grid-cols-2">
            <CategorySummaryTable title="Income" items={data.income} />
            <CategorySummaryTable title="Expenses" items={data.expenses} />
          </div>
        </div>
      )}
    </div>
  );
}
