import { useState, useContext } from 'react';
import { AccountContext } from '@/App';
import { DateRangePicker } from '@/components/shared/DateRangePicker';
import { SegmentedControl } from '@/components/shared/SegmentedControl';
import { ReportsChartCard } from '@/components/reports/ReportsChartCard';
import { CategorySummaryTable } from '@/components/reports/CategorySummaryTable';
import { MonthRangePicker } from '@/components/reports/MonthRangePicker';
import { MonthlyComparison } from '@/components/reports/MonthlyComparison';
import { ExportControls } from '@/components/reports/ExportControls';
import { formatDateRange } from '@/lib/dates';
import { useCategorySummary, useMonthlySummary } from '@/hooks/useReports';

function defaultStartDate(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}

function defaultEndDate(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
}

/** The current month as `YYYY-MM`, offset by whole months. */
function monthFromNow(offset: number): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

type View = 'breakdown' | 'monthly';

const VIEWS = [
  { value: 'breakdown' as const, label: 'Breakdown' },
  { value: 'monthly' as const, label: 'Monthly' },
];

/**
 * Reports, in two views over two time granularities.
 *
 * `Breakdown` answers "where did the money go over this window" and needs an
 * arbitrary range. `Monthly` answers "is this month worse than last" and only
 * means anything over whole calendar months. Each view carries its own picker,
 * because one control cannot express both without lying about the other: a
 * day-level range cannot produce comparable buckets, and a month picker cannot
 * express "the last 90 days".
 */
export function ReportsPage() {
  const { selectedAccountId } = useContext(AccountContext);
  const [view, setView] = useState<View>('breakdown');

  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate);
  const [startMonth, setStartMonth] = useState(() => monthFromNow(-5));
  const [endMonth, setEndMonth] = useState(() => monthFromNow(0));

  const breakdown = useCategorySummary({
    accountId: view === 'breakdown' ? selectedAccountId : '',
    startDate,
    endDate,
  });

  const monthly = useMonthlySummary({
    accountId: view === 'monthly' ? selectedAccountId : '',
    startMonth,
    endMonth,
  });

  const { isLoading, error } = view === 'breakdown' ? breakdown : monthly;

  return (
    <div className="mx-auto max-w-shell px-6 py-6">
      <h1 className="font-display text-4xl text-bark-dark">Reports</h1>
      <p className="mt-1 text-[15px] text-stone">
        {view === 'breakdown'
          ? `${formatDateRange(startDate, endDate)} · settled transactions only`
          : 'Whole calendar months · transfers excluded'}
      </p>

      <div className="mb-6 mt-4 flex flex-col gap-3">
        <SegmentedControl
          options={VIEWS}
          value={view}
          onChange={setView}
          legend="Report view"
          name="report-view"
        />

        {view === 'breakdown' ? (
          <>
            <DateRangePicker
              startDate={startDate}
              endDate={endDate}
              onStartDateChange={setStartDate}
              onEndDateChange={setEndDate}
            />
            {/*
              Export sits with the breakdown, whose range is exactly what the
              endpoints take. Offering it on the monthly view would export one
              flat span for a screen showing month-by-month columns — what came
              out would not be what was displayed.
            */}
            <ExportControls
              accountId={selectedAccountId}
              startDate={startDate}
              endDate={endDate}
            />
          </>
        ) : (
          <MonthRangePicker
            startMonth={startMonth}
            endMonth={endMonth}
            onStartMonthChange={setStartMonth}
            onEndMonthChange={setEndMonth}
          />
        )}
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

      {view === 'breakdown' && breakdown.data && (
        <div className="space-y-4">
          <ReportsChartCard data={breakdown.data} />

          <div className="grid gap-4 md:grid-cols-2">
            <CategorySummaryTable title="Income" items={breakdown.data.income} />
            <CategorySummaryTable title="Expenses" items={breakdown.data.expenses} />
          </div>
        </div>
      )}

      {view === 'monthly' && monthly.data && (
        <MonthlyComparison months={monthly.data.months} />
      )}
    </div>
  );
}
