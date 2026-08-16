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

/**
 * The canvas a layout is measured against.
 *
 * The diagram is drawn twice at very different widths, and the geometry is not
 * a scale of itself: a phone gets a taller minimum row, because a 10px band
 * cannot carry a label beside it at phone type sizes, and a wider gap to keep
 * the ribbons apart in a 200-unit viewbox.
 */
export interface SankeyDimensions {
  width: number;
  height: number;
  topInset: number;
  nodeGap: number;
  minRowHeight: number;
  nodeWidth: number;
  targetX: number;
  /** Bezier control points, at the horizontal midpoint. */
  controlX: number;
}

/** Desktop. These are the values the diagram has always used. */
export const WIDE_SANKEY: SankeyDimensions = {
  width: VIEWBOX_WIDTH,
  height: VIEWBOX_HEIGHT,
  topInset: TOP_INSET,
  nodeGap: NODE_GAP,
  minRowHeight: MIN_ROW_HEIGHT,
  nodeWidth: NODE_WIDTH,
  targetX: TARGET_X,
  controlX: 280,
};

/** Phone: a tall, narrow column with the labels rendered beside it in HTML. */
export const NARROW_SANKEY: SankeyDimensions = {
  width: 200,
  height: 480,
  topInset: 8,
  nodeGap: 14,
  minRowHeight: 22,
  nodeWidth: 10,
  targetX: 190,
  controlX: 100,
};

/**
 * The Kept band is sage, the one row that is not a spend category. It reads
 * through the token so it follows the theme, like the category hues do.
 */
export const KEPT_COLOR = 'rgb(var(--c-sage))';
export const KEPT_LABEL = 'Kept';

/**
 * The rolled-up tail. Neutral rather than a category hue, because it is not
 * one category — reusing a hue would imply it was.
 */
export const OTHER_COLOR = 'rgb(var(--c-warm-gray))';
export const OTHER_LABEL = 'Other';

export interface SankeyOptions {
  /** Defaults to `WIDE_SANKEY`, so existing call sites are unaffected. */
  dimensions?: SankeyDimensions;
  /**
   * Keep only the largest N spend categories and sum the rest into one
   * `Other` row. Omitted means every category is drawn.
   *
   * Kept is never counted or rolled up: it is not a spend category, and
   * burying it would answer a different question than "where did the income
   * go".
   */
  maxCategories?: number;
}

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

export function buildSankeyLayout(
  data: CategorySummaryResponse,
  options: SankeyOptions = {},
): SankeyLayout {
  const dim = options.dimensions ?? WIDE_SANKEY;
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

  const ranked = data.expenses
    .map((item) => ({
      label: item.category,
      color: getCategoryColor(item.category as Category),
      value: new Decimal(item.total).abs(),
    }))
    .filter((row) => !row.value.isZero())
    .sort((a, b) => b.value.comparedTo(a.value));

  const spend = rollUpTail(ranked, options.maxCategories);

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
  const available = dim.height - dim.topInset * 2 - dim.nodeGap * (count - 1);
  const flexible = Math.max(0, available - dim.minRowHeight * count);

  // The bundle is centered against the target column, which is taller by the
  // gaps the source node does not have.
  const sourceTop = dim.topInset + (dim.nodeGap * (count - 1)) / 2;

  let targetY = dim.topInset;
  let sourceY = sourceTop;
  const rows: SankeyRow[] = [];

  for (const row of values) {
    const ratio = row.value.div(denominator).toNumber();
    const height = dim.minRowHeight + ratio * flexible;

    rows.push({
      label: row.label,
      color: row.color,
      amount: row.value.toFixed(2),
      percent: row.value.div(denominator).times(100).toFixed(1),
      height,
      sourceY,
      targetY,
      path: ribbonPath(sourceY, sourceY + height, targetY, targetY + height, dim),
      centerPercent: ((targetY + height / 2) / dim.height) * 100,
    });

    targetY += height + dim.nodeGap;
    sourceY += height;
  }

  const sourceHeight = sourceY - sourceTop;

  return {
    ...totals,
    rows,
    source: {
      y: sourceTop,
      height: sourceHeight,
      centerPercent: ((sourceTop + sourceHeight / 2) / dim.height) * 100,
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
  dim: SankeyDimensions,
): string {
  const st = svgNumber(sourceTop);
  const sb = svgNumber(sourceBottom);
  const tt = svgNumber(targetTop);
  const tb = svgNumber(targetBottom);
  const { nodeWidth: w, controlX: c, targetX: x } = dim;

  return (
    `M${w} ${st} ` +
    `C${c} ${st} ${c} ${tt} ${x} ${tt} ` +
    `L${x} ${tb} ` +
    `C${c} ${tb} ${c} ${sb} ${w} ${sb} Z`
  );
}

/**
 * Collapses everything past the largest `max` rows into one `Other`.
 *
 * The tail is summed in decimal.js, not by adding the ratios back up: the
 * rolled-up row states a real amount, and a diagram that quietly lost a cent
 * would look exactly as convincing as one that did not.
 */
function rollUpTail<T extends { label: string; color: string; value: Decimal }>(
  ranked: T[],
  max: number | undefined,
): { label: string; color: string; value: Decimal }[] {
  if (max === undefined || ranked.length <= max) return ranked;

  const kept = ranked.slice(0, max);
  const tail = ranked
    .slice(max)
    .reduce((total, row) => total.plus(row.value), new Decimal(0));

  return [...kept, { label: OTHER_LABEL, color: OTHER_COLOR, value: tail }];
}
