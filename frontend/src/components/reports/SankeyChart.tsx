import { formatCurrency } from '@/lib/balance';
import { getCategoryColor } from '@/lib/categoryColors';
import {
  svgNumber,
  NODE_RADIUS,
  SOURCE_X,
  WIDE_SANKEY,
  NARROW_SANKEY,
  type SankeyLayout,
  type SankeyDimensions,
} from '@/lib/sankey';
import { useIsPhone } from '@/hooks/useIsPhone';

interface SankeyChartProps {
  layout: SankeyLayout;
  /** Must match the dimensions the layout was built with. */
  dimensions?: SankeyDimensions;
}

/**
 * Income flowing to expense categories, drawn by hand.
 *
 * Node labels are DOM text positioned in percentage terms rather than SVG
 * `<text>`, so they stay legible and selectable however wide the SVG flexes.
 * The drawing itself is decorative — everything it shows is in the label
 * column, so assistive tech reads that instead.
 *
 * One of the seams. Desktop puts a label column either side of a wide ribbon
 * bundle; a phone has room for neither, so the income figure moves above the
 * diagram and the ribbons compress into a 106px column with a single label
 * column beside them. That is a different arrangement of boxes, not a narrower
 * one, and it is paired with different layout geometry — see `NARROW_SANKEY`.
 */
export function SankeyChart({ layout, dimensions }: SankeyChartProps) {
  const isPhone = useIsPhone();
  const dim = dimensions ?? (isPhone ? NARROW_SANKEY : WIDE_SANKEY);
  if (layout.isEmpty) {
    return (
      <p className="py-12 text-center text-sm text-stone">
        No income in this range, so there is nothing to trace.
      </p>
    );
  }

  return (
    <div>
      {/*
        On a phone the income figure sits above the diagram: a left-hand label
        column would leave the ribbons about 60px wide.
      */}
      {isPhone && (
        <p className="mb-2 font-mono text-[9px] uppercase tracking-label-wide text-warm-gray">
          Income {formatCurrency(layout.income)} →
        </p>
      )}

      <div className={isPhone ? '' : 'overflow-x-auto'}>
        <div className={`flex items-stretch ${isPhone ? '' : 'min-w-[720px]'}`}>
          {!isPhone && (
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
          )}

          <svg
            viewBox={`0 0 ${dim.width} ${dim.height}`}
            preserveAspectRatio={isPhone ? 'none' : undefined}
            className={isPhone ? 'block h-[440px] w-[106px] shrink-0' : 'h-auto flex-1'}
            aria-hidden="true"
            focusable="false"
          >
            {layout.rows.map((row) => (
              <path key={row.label} d={row.path} fill={row.color} fillOpacity={0.32} />
            ))}

            <rect
              x={SOURCE_X}
              y={svgNumber(layout.source.y)}
              width={dim.nodeWidth}
              height={svgNumber(layout.source.height)}
              rx={NODE_RADIUS}
              fill={getCategoryColor('Income')}
            />

            {layout.rows.map((row) => (
              <rect
                key={row.label}
                x={dim.targetX}
                y={svgNumber(row.targetY)}
                width={dim.nodeWidth}
                height={svgNumber(row.height)}
                rx={NODE_RADIUS}
                fill={row.color}
              />
            ))}
          </svg>

          <ul
            aria-label="Flow by category"
            className={`relative ${isPhone ? 'min-w-0 flex-1' : 'w-[270px] shrink-0'}`}
          >
            {layout.rows.map((row) => (
              <li
                key={row.label}
                className={`absolute left-2 right-0 -translate-y-1/2 gap-2 sm:left-3 ${
                  isPhone ? 'flex flex-col' : 'flex items-center justify-between'
                }`}
                style={{ top: `${svgNumber(row.centerPercent)}%` }}
              >
                <span className="flex min-w-0 items-center gap-1.5 sm:gap-2">
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full sm:h-[7px] sm:w-[7px]"
                    style={{ backgroundColor: row.color }}
                    aria-hidden="true"
                  />
                  <span className="truncate text-xs text-charcoal sm:text-[13px]" title={row.label}>
                    {row.label}
                  </span>
                </span>
                <span
                  className={`font-mono text-stone ${
                    isPhone ? 'pl-3 text-[10px]' : 'shrink-0 text-[11px]'
                  }`}
                >
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
