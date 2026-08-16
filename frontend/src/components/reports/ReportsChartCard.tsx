import { useMemo, useState } from 'react';
import { SankeyChart } from '@/components/reports/SankeyChart';
import { BreakdownChart } from '@/components/reports/BreakdownChart';
import { SegmentedControl } from '@/components/shared/SegmentedControl';
import { formatCurrency } from '@/lib/balance';
import { buildSankeyLayout, type SankeyLayout } from '@/lib/sankey';
import type { CategorySummaryResponse } from '@/api/types';

type ChartView = 'sankey' | 'breakdown';

const VIEW_OPTIONS: { value: ChartView; label: string }[] = [
  { value: 'sankey', label: 'Sankey' },
  { value: 'breakdown', label: 'Breakdown' },
];

interface ReportsChartCardProps {
  data: CategorySummaryResponse;
}

/**
 * The chart card: one dataset, two readings of it. Which reading is showing is
 * local state, so switching never refetches.
 */
export function ReportsChartCard({ data }: ReportsChartCardProps) {
  const [view, setView] = useState<ChartView>('sankey');
  const layout = useMemo(() => buildSankeyLayout(data), [data]);

  return (
    <section className="rounded-lg border border-cream-mid bg-white p-[22px]">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-xl text-bark-dark">Where the income went</h2>
          <p className="mt-1 font-mono text-xs text-stone">{summaryLine(layout)}</p>
        </div>

        <SegmentedControl
          legend="Chart view"
          name="chart-view"
          options={VIEW_OPTIONS}
          value={view}
          onChange={setView}
        />
      </div>

      {view === 'sankey' ? (
        <SankeyChart layout={layout} />
      ) : (
        <BreakdownChart layout={layout} />
      )}
    </section>
  );
}

function summaryLine(layout: SankeyLayout): string {
  const kept = layout.overspend
    ? `−${formatCurrency(layout.overspend)} over`
    : `${formatCurrency(layout.kept)} kept`;

  return `${formatCurrency(layout.income)} in · −${formatCurrency(layout.expenses)} out · ${kept}`;
}
