import { formatCurrency } from '@/lib/balance';
import { getCategoryColor } from '@/lib/categoryColors';
import {
  svgNumber,
  NODE_RADIUS,
  NODE_WIDTH,
  SOURCE_X,
  TARGET_X,
  VIEWBOX_HEIGHT,
  VIEWBOX_WIDTH,
  type SankeyLayout,
} from '@/lib/sankey';

interface SankeyChartProps {
  layout: SankeyLayout;
}

/**
 * Income flowing to expense categories, drawn by hand.
 *
 * Node labels are DOM text positioned in percentage terms rather than SVG
 * `<text>`, so they stay legible and selectable however wide the SVG flexes.
 * The drawing itself is decorative — everything it shows is in the two label
 * columns, so assistive tech reads those instead.
 */
export function SankeyChart({ layout }: SankeyChartProps) {
  if (layout.isEmpty) {
    return (
      <p className="py-12 text-center text-sm text-stone">
        No income in this range, so there is nothing to trace.
      </p>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <div className="flex min-w-[720px] items-stretch">
          <div className="relative w-[150px] shrink-0">
            <div
              className="absolute right-3 -translate-y-1/2 text-right"
              style={{ top: `${svgNumber(layout.source.centerPercent)}%` }}
            >
              <p className="text-sm text-charcoal">Income</p>
              <p className="font-mono text-xs text-stone">
                {formatCurrency(layout.income)}
              </p>
            </div>
          </div>

          <svg
            viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
            className="h-auto flex-1"
            aria-hidden="true"
            focusable="false"
          >
            {layout.rows.map((row) => (
              <path key={row.label} d={row.path} fill={row.color} fillOpacity={0.32} />
            ))}

            <rect
              x={SOURCE_X}
              y={svgNumber(layout.source.y)}
              width={NODE_WIDTH}
              height={svgNumber(layout.source.height)}
              rx={NODE_RADIUS}
              fill={getCategoryColor('Income')}
            />

            {layout.rows.map((row) => (
              <rect
                key={row.label}
                x={TARGET_X}
                y={svgNumber(row.targetY)}
                width={NODE_WIDTH}
                height={svgNumber(row.height)}
                rx={NODE_RADIUS}
                fill={row.color}
              />
            ))}
          </svg>

          <ul aria-label="Flow by category" className="relative w-[270px] shrink-0">
            {layout.rows.map((row) => (
              <li
                key={row.label}
                className="absolute left-3 right-0 flex -translate-y-1/2 items-center justify-between gap-2"
                style={{ top: `${svgNumber(row.centerPercent)}%` }}
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
                <span className="shrink-0 font-mono text-[11px] text-stone">
                  {formatCurrency(row.amount)} · {row.percent}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <p className="mt-3 font-mono text-[10px] uppercase tracking-label text-warm-gray">
        {caption(layout)}
      </p>
    </div>
  );
}

function caption(layout: SankeyLayout): string {
  if (layout.overspend) {
    return `Ribbon width = share of spending · spending exceeded income by ${formatCurrency(layout.overspend)}`;
  }
  return 'Ribbon width = share of income · sage band = kept';
}
