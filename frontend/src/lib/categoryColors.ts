import type { Category } from '@/api/types';

/**
 * The single source of category color, from the Momoski Tech design system.
 *
 * Hex is the canonical form because SVG fills need it — the Sankey ribbons,
 * the category dots in the day panel, the recurring series dots. Tailwind
 * classes reference these values as arbitrary values rather than duplicating
 * them.
 *
 * Subscriptions and Other deliberately share a warm-gray: both are catch-all
 * buckets and neither earns a distinct hue. Category names always appear as
 * text beside the dot, so color is never the sole signal.
 *
 * Loan Payments, Taxes and Fitness were added to the application after the
 * design handoff was authored and had no assigned color. Their hues extend the
 * palette and are held to 3:1 against white.
 */
export const CATEGORY_COLORS: Record<Category, string> = {
  Income: '#5A7A5A',
  Housing: '#5D4037',
  Utilities: '#7B9E7B',
  Groceries: '#A3BFA3',
  Transportation: '#C17D4A',
  Insurance: '#8A8279',
  Healthcare: '#C1574A',
  Entertainment: '#A68B7B',
  Dining: '#D9A373',
  Shopping: '#7B5B4F',
  Subscriptions: '#B5AEA4',
  'Loan Payments': '#8A5570',
  Taxes: '#9C7C36',
  Fitness: '#4E7F7A',
  Transfers: '#3D5C3D',
  Other: '#B5AEA4',
};

/** Shown for a transaction with no category assigned. */
export const UNCATEGORIZED_COLOR = '#D8D2C8';

/** Resolves a category to its color, falling back for uncategorized rows. */
export function getCategoryColor(category: Category | null): string {
  return category ? CATEGORY_COLORS[category] : UNCATEGORIZED_COLOR;
}
