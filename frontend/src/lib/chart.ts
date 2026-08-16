import Decimal from 'decimal.js';
import type { ForecastDay } from '@/api/types';

/**
 * Geometry for the projection panel's balance curve.
 *
 * Everything here resolves to a pixel position, so the arithmetic is float by
 * design — the same deliberate exception the Sankey makes. Balances arrive as
 * decimal strings and are compared with `Decimal` before conversion, so no
 * ordering decision is made in floating point.
 */

export const CHART_WIDTH = 1140;
export const CHART_HEIGHT = 190;
export const CHART_INSET = 6;

export interface ChartPoint {
  x: number;
  y: number;
}

export interface BalanceChartGeometry {
  points: ChartPoint[];
  /** Day one through today. Empty for a wholly future range. */
  settledPath: string;
  /** Today through the last day. Empty for a wholly past range. */
  forecastPath: string;
  /** The whole series, closed along the bottom. */
  areaPath: string;
  floorY: number | null;
  bandY: number | null;
  bandHeight: number | null;
  /** Null when today falls outside the range. */
  todayX: number | null;
  lowPoint: ChartPoint | null;
}

interface BuildParams {
  days: ForecastDay[];
  todayDate: string;
  comfortFloor: string;
}

/** Two decimals is finer than a screen pixel and keeps paths readable. */
function fmt(value: number): string {
  return String(Number(value.toFixed(2)));
}

function polyline(points: ChartPoint[]): string {
  if (points.length === 0) return '';
  const [first, ...rest] = points;
  const head = `M${fmt(first.x)} ${fmt(first.y)}`;
  return rest.reduce((path, p) => `${path} L${fmt(p.x)} ${fmt(p.y)}`, head);
}

export function buildBalanceChart({
  days,
  todayDate,
  comfortFloor,
}: BuildParams): BalanceChartGeometry {
  if (days.length === 0) {
    return {
      points: [],
      settledPath: '',
      forecastPath: '',
      areaPath: '',
      floorY: null,
      bandY: null,
      bandHeight: null,
      todayX: null,
      lowPoint: null,
    };
  }

  const balances = days.map((d) => new Decimal(d.runningBalance));

  let maxBalance = balances[0];
  let minBalance = balances[0];
  let lowIndex = 0;

  balances.forEach((balance, index) => {
    if (balance.greaterThan(maxBalance)) maxBalance = balance;
    // Strictly less-than, so tied minimums resolve to the earliest date.
    if (balance.lessThan(minBalance)) {
      minBalance = balance;
      lowIndex = index;
    }
  });

  /*
   * The handoff gives `lo = min(0, min × 0.9)`. For a negative minimum that
   * multiplication shrinks the bound toward zero and pushes the lowest point
   * below the chart floor. Padding outward by the same 1.06 the top uses is
   * symmetric, keeps an all-positive series anchored to a zero baseline
   * exactly as the handoff intends, and always contains the data.
   */
  const hi = Math.max(0, maxBalance.times(1.06).toNumber());
  const lo = Math.min(0, minBalance.times(1.06).toNumber());
  const span = hi - lo;
  const plotHeight = CHART_HEIGHT - CHART_INSET * 2;

  const yFor = (value: number): number =>
    span === 0
      ? CHART_HEIGHT / 2
      : CHART_INSET + ((hi - value) / span) * plotHeight;

  const xFor = (index: number): number =>
    days.length === 1 ? 0 : (index / (days.length - 1)) * CHART_WIDTH;

  const points: ChartPoint[] = balances.map((balance, index) => ({
    x: xFor(index),
    y: yFor(balance.toNumber()),
  }));

  // The last day at or before today. -1 when the whole range is still ahead.
  let todayIndex = -1;
  days.forEach((d, index) => {
    if (d.date <= todayDate) todayIndex = index;
  });

  const withinRange = todayDate >= days[0].date && todayDate <= days[days.length - 1].date;

  const settledPath = todayIndex < 0 ? '' : polyline(points.slice(0, todayIndex + 1));
  // Starts at the today point, so the two segments join without a gap.
  const forecastPath =
    todayIndex >= days.length - 1 ? '' : polyline(points.slice(Math.max(todayIndex, 0)));

  const areaPath = `${polyline(points)} L${fmt(points[points.length - 1].x)} ${CHART_HEIGHT} L${fmt(points[0].x)} ${CHART_HEIGHT} Z`;

  const rawFloorY = yFor(new Decimal(comfortFloor).toNumber());
  const floorY = Math.min(CHART_HEIGHT, Math.max(0, rawFloorY));

  return {
    points,
    settledPath,
    forecastPath,
    areaPath,
    floorY,
    bandY: floorY,
    bandHeight: CHART_HEIGHT - floorY,
    todayX: withinRange && todayIndex >= 0 ? points[todayIndex].x : null,
    lowPoint: points[lowIndex],
  };
}
