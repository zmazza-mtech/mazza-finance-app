import Decimal from 'decimal.js';
import { getCategoryColor } from '@/lib/categoryColors';
import type { Category, CategorySummaryResponse } from '@/api/types';

/**
 * Geometry for the hand-built income-to-expense Sankey.
 *
 * Money stays in decimal.js. Layout does not: heights and offsets are screen
 * geometry, so each amount is converted to a ratio once, at the boundary, and
 * everything downstream is a plain number.
 */

export const VIEWBOX_WIDTH = 560;
export const VIEWBOX_HEIGHT = 452;
export const TOP_INSET = 8;
export const NODE_GAP = 12;
/** Keeps a sub-1% category visible, and its label legible beside it. */
export const MIN_ROW_HEIGHT = 10;
export const NODE_WIDTH = 14;
export const NODE_RADIUS = 3;
export const SOURCE_X = 0;
export const TARGET_X = 546;
/** Bezier control points sit at the horizontal midpoint. */
const CONTROL_X = 280;

/**
 * The Kept band is sage, the one row that is not a spend category. It reads
 * through the token so it follows the theme, like the category hues do.
 */
export const KEPT_COLOR = 'rgb(var(--c-sage))';
export const KEPT_LABEL = 'Kept';

export interface SankeyRow {
  label: string;
  color: string;
  /** Positive decimal string. */
  amount: string;
  /** Share of the flow, one decimal place. */
  percent: string;
  height: number;
  /** Top of this row's segment on the source node. */
  sourceY: number;
  /** Top of this row's target node. */
  targetY: number;
  /** Ribbon outline, source segment to target node. */
  path: string;
  /** Vertical center of the target node, as a percentage of the viewbox. */
  centerPercent: number;
}

export interface SankeyLayout {
  rows: SankeyRow[];
  /** Positive decimal strings. */
  income: string;
  expenses: string;
  /** Signed: negative when spending exceeded income. */
  kept: string;
  /** Positive decimal string when spending exceeded income, else null. */
  overspend: string | null;
  source: { y: number; height: number; centerPercent: number };
  /** No income means no flow to draw. */
  isEmpty: boolean;
}

/** Rounds to two places and drops trailing zeros, for terse SVG attributes. */
export function svgNumber(value: number): number {
  return Math.round(value * 100) / 100;
}

function sumAbs(items: { total: string }[]): Decimal {
  return items.reduce(
    (total, item) => total.plus(new Decimal(item.total).abs()),
    new Decimal(0),
  );
}

const EMPTY: Omit<SankeyLayout, 'income' | 'expenses' | 'kept' | 'overspend'> = {
  rows: [],
  source: { y: TOP_INSET, height: 0, centerPercent: 50 },
  isEmpty: true,
};

export function buildSankeyLayout(data: CategorySummaryResponse): SankeyLayout {
  const income = sumAbs(data.income);
  const expenses = sumAbs(data.expenses);
  const kept = income.minus(expenses);
  const overspend = kept.isNegative() ? kept.abs().toFixed(2) : null;

  const totals = {
    income: income.toFixed(2),
    expenses: expenses.toFixed(2),
    kept: kept.toFixed(2),
    overspend,
  };

  // The diagram answers "where did the income go", so with no income there is
  // nothing to divide and nothing to draw.
  if (income.isZero()) {
    return { ...EMPTY, ...totals };
  }

  const spend = data.expenses
    .map((item) => ({
      label: item.category,
      color: getCategoryColor(item.category as Category),
      value: new Decimal(item.total).abs(),
    }))
    .filter((row) => !row.value.isZero())
    .sort((a, b) => b.value.comparedTo(a.value));

  const values = kept.isPositive() && !kept.isZero()
    ? [...spend, { label: KEPT_LABEL, color: KEPT_COLOR, value: kept }]
    : spend;

  if (values.length === 0) {
    return { ...EMPTY, ...totals };
  }

  // Dividing by the summed rows rather than by income keeps the stack inside
  // the viewbox when spending exceeds income. The two are the same number
  // whenever Kept is positive, since expenses plus kept is income by
  // definition.
  const denominator = values.reduce((total, row) => total.plus(row.value), new Decimal(0));

  const count = values.length;
  const available = VIEWBOX_HEIGHT - TOP_INSET * 2 - NODE_GAP * (count - 1);
  const flexible = Math.max(0, available - MIN_ROW_HEIGHT * count);

  // The bundle is centered against the target column, which is taller by the
  // gaps the source node does not have.
  const sourceTop = TOP_INSET + (NODE_GAP * (count - 1)) / 2;

  let targetY = TOP_INSET;
  let sourceY = sourceTop;
  const rows: SankeyRow[] = [];

  for (const row of values) {
    const ratio = row.value.div(denominator).toNumber();
    const height = MIN_ROW_HEIGHT + ratio * flexible;

    rows.push({
      label: row.label,
      color: row.color,
      amount: row.value.toFixed(2),
      percent: row.value.div(denominator).times(100).toFixed(1),
      height,
      sourceY,
      targetY,
      path: ribbonPath(sourceY, sourceY + height, targetY, targetY + height),
      centerPercent: ((targetY + height / 2) / VIEWBOX_HEIGHT) * 100,
    });

    targetY += height + NODE_GAP;
    sourceY += height;
  }

  const sourceHeight = sourceY - sourceTop;

  return {
    ...totals,
    rows,
    source: {
      y: sourceTop,
      height: sourceHeight,
      centerPercent: ((sourceTop + sourceHeight / 2) / VIEWBOX_HEIGHT) * 100,
    },
    isEmpty: false,
  };
}

/**
 * One ribbon: across the top from the source segment to the target node, down
 * the target's right edge, and back along the bottom.
 */
function ribbonPath(
  sourceTop: number,
  sourceBottom: number,
  targetTop: number,
  targetBottom: number,
): string {
  const st = svgNumber(sourceTop);
  const sb = svgNumber(sourceBottom);
  const tt = svgNumber(targetTop);
  const tb = svgNumber(targetBottom);

  return (
    `M${NODE_WIDTH} ${st} ` +
    `C${CONTROL_X} ${st} ${CONTROL_X} ${tt} ${TARGET_X} ${tt} ` +
    `L${TARGET_X} ${tb} ` +
    `C${CONTROL_X} ${tb} ${CONTROL_X} ${sb} ${NODE_WIDTH} ${sb} Z`
  );
}
