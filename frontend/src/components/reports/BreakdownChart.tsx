import { formatCurrency } from '@/lib/balance';
import type { SankeyLayout } from '@/lib/sankey';

interface BreakdownChartProps {
  layout: SankeyLayout;
}

/**
 * The same rows as the Sankey, read as proportions rather than as a flow: one
 * stacked bar over one row per category.
 */
export function BreakdownChart({ layout }: BreakdownChartProps) {
  if (layout.isEmpty) {
    return (
      <p className="py-12 text-center text-sm text-stone">
        No income in this range, so there is nothing to break down.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[560px]">
        <div data-stacked-bar className="flex h-[26px] w-full gap-0.5">
          {layout.rows.map((row) => (
            <div
              key={row.label}
              className="rounded-full"
              style={{
                flexGrow: Number(row.percent),
                flexBasis: 0,
                backgroundColor: row.color,
              }}
              title={`${row.label} ${row.percent}%`}
            />
          ))}
        </div>

        <ul aria-label="Spending breakdown" className="mt-5">
          {layout.rows.map((row) => (
            <li
              key={row.label}
              className="grid items-center gap-3 border-b border-cream-mid py-2 last:border-b-0"
              style={{ gridTemplateColumns: '150px 1fr 120px 70px' }}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className="h-[7px] w-[7px] shrink-0 rounded-full"
                  style={{ backgroundColor: row.color }}
                  aria-hidden="true"
                />
                <span className="truncate text-[13px] text-charcoal" title={row.label}>
                  {row.label}
                </span>
              </span>

              <span className="block h-2.5 w-full rounded-full bg-cream">
                <span
                  data-row-bar
                  className="block h-full rounded-full"
                  style={{
                    width: `${Number(row.percent)}%`,
                    backgroundColor: row.color,
                  }}
                />
              </span>

              <span className="text-right font-mono text-sm text-charcoal">
                {formatCurrency(row.amount)}
              </span>
              <span className="text-right font-mono text-xs text-stone">
                {row.percent}%
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
