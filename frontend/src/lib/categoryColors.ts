import {
  CATEGORY_HUES,
  UNCATEGORIZED_VAR,
  categoryVarName,
} from '@/lib/categoryPalette';
import type { Category } from '@/api/types';

/**
 * The single source of category color, from the Momoski Tech design system.
 *
 * Values are CSS custom property references rather than literals, so a dot or
 * a Sankey ribbon picks up the dark counterpart from `.dark` without the
 * component knowing which mode it is in. The hues themselves live in
 * `categoryPalette.ts`; the variables are emitted by the Tailwind config.
 */
export const CATEGORY_COLORS: Record<Category, string> = Object.fromEntries(
  Object.keys(CATEGORY_HUES).map((category) => [
    category,
    `var(${categoryVarName(category)})`,
  ]),
) as Record<Category, string>;

/** Shown for a transaction with no category assigned. */
export const UNCATEGORIZED_COLOR = `var(${UNCATEGORIZED_VAR})`;

export function getCategoryColor(category: Category | null): string {
  if (category === null) return UNCATEGORIZED_COLOR;
  return CATEGORY_COLORS[category] ?? UNCATEGORIZED_COLOR;
}
