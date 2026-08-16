import type { BalanceChartGeometry } from '@/lib/chart';
import { CHART_WIDTH, CHART_HEIGHT } from '@/lib/chart';

interface BalanceChartProps {
  geometry: BalanceChartGeometry;
  /** Describes the curve for assistive technology, which cannot read the SVG. */
  label: string;
}

/**
 * The balance curve inside the projection panel.
 *
 * Purely presentational — every coordinate comes from `lib/chart.ts`. Layers
 * paint back to front: warning band, comfort floor, area fill, settled
 * segment, forecast segment, today divider, low-point marker.
 */
export function BalanceChart({ geometry, label }: BalanceChartProps) {
  const { settledPath, forecastPath, areaPath, floorY, bandY, bandHeight, todayX, lowPoint } =
    geometry;

  if (areaPath === '') return null;

  return (
    <svg
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      preserveAspectRatio="none"
      className="mt-[18px] block h-[190px] w-full"
      role="img"
      aria-label={label}
    >
      {bandHeight !== null && bandHeight > 0 && (
        <rect x="0" y={bandY ?? 0} width={CHART_WIDTH} height={bandHeight} fill="rgb(var(--c-panel-warning))" opacity="0.10" />
      )}

      {floorY !== null && (
        <line
          x1="0"
          y1={floorY}
          x2={CHART_WIDTH}
          y2={floorY}
          stroke="rgb(var(--c-balance-critical))"
          strokeWidth="1"
          strokeDasharray="4 5"
          opacity="0.8"
        />
      )}

      <path d={areaPath} fill="rgb(var(--c-sage))" opacity="0.18" />

      {settledPath !== '' && (
        <path
          d={settledPath}
          fill="none"
          stroke="rgb(var(--c-panel-positive))"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
      )}

      {forecastPath !== '' && (
        <path
          d={forecastPath}
          fill="none"
          stroke="rgb(var(--c-panel-positive))"
          strokeWidth="2.5"
          strokeDasharray="6 5"
          strokeLinejoin="round"
          opacity="0.85"
        />
      )}

      {todayX !== null && (
        <line
          x1={todayX}
          y1="0"
          x2={todayX}
          y2={CHART_HEIGHT}
          stroke="rgb(var(--c-panel-ink))"
          strokeWidth="1"
          opacity="0.35"
        />
      )}

      {lowPoint && <circle cx={lowPoint.x} cy={lowPoint.y} r="4.5" fill="rgb(var(--c-panel-warning))" />}
    </svg>
  );
}
