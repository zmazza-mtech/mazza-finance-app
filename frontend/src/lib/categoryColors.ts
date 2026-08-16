import {
  CATEGORY_HUES,
  UNCATEGORIZED_VAR,
  categoryVarName,
} from '@/lib/categoryPalette';
import type { CategoryHues } from '@/lib/categoryPalette';
import type { Category } from '@/api/types';

/**
 * Compile-time proof that the palette covers every category.
 *
 * `categoryPalette.ts` cannot name the `Category` type itself — `tailwind.config.ts`
 * reads that file to emit the custom properties, and it must stay import-free.
 * The check belongs here, where the type is in scope: a category added without a
 * hue fails the build instead of silently rendering in the uncategorized gray.
 */
const HUES: Record<Category, CategoryHues> = CATEGORY_HUES;

/**
 * The single source of category color, from the Momoski Tech design system.
 *
 * Values are CSS custom property references rather than literals, so a dot or
 * a Sankey ribbon picks up the dark counterpart from `.dark` without the
 * component knowing which mode it is in. The hues themselves live in
 * `categoryPalette.ts`; the variables are emitted by the Tailwind config.
 */
export const CATEGORY_COLORS: Record<Category, string> = Object.fromEntries(
  (Object.keys(HUES) as Category[]).map((category) => [
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
