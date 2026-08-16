import { useMemo, useState } from 'react';
import { SankeyChart } from '@/components/reports/SankeyChart';
import { BreakdownChart } from '@/components/reports/BreakdownChart';
import { SegmentedControl } from '@/components/shared/SegmentedControl';
import { formatCurrency } from '@/lib/balance';
import {
  buildSankeyLayout,
  WIDE_SANKEY,
  NARROW_SANKEY,
  type SankeyLayout,
} from '@/lib/sankey';
import { useIsPhone } from '@/hooks/useIsPhone';
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
  const isPhone = useIsPhone();
  const [view, setView] = useState<ChartView>('sankey');

  /*
   * The geometry and the drawing have to agree, so the dimensions are chosen
   * once here and handed to both. Six named categories is what a 480-unit
   * column fits legibly; the rest becomes one `Other` band.
   */
  const dimensions = isPhone ? NARROW_SANKEY : WIDE_SANKEY;
  const layout = useMemo(
    () => buildSankeyLayout(data, { dimensions, maxCategories: isPhone ? 6 : undefined }),
    [data, dimensions, isPhone],
  );

  return (
    <section className="rounded-lg border border-cream-mid bg-surface p-4 sm:p-[22px]">
      <div className="mb-4 flex flex-col items-stretch gap-3 sm:mb-5 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-4">
        <div>
          <h2 className="font-display text-lg text-bark-dark sm:text-xl">Where the income went</h2>
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
        <SankeyChart layout={layout} dimensions={dimensions} />
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
