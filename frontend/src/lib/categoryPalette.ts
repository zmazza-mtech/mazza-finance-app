/**
 * Category hues, light and dark.
 *
 * Hex is the canonical form because SVG fills need it — the Sankey ribbons and
 * every category dot. Each dark counterpart is lightened until it clears 3:1
 * against the dark card surface, the threshold for a graphical indicator.
 *
 * Subscriptions and Other deliberately share a warm-gray: both are catch-all
 * buckets and neither earns a distinct hue. Category names always appear as
 * text beside the dot, so color is never the sole signal.
 *
 * Loan Payments, Taxes and Fitness were added to the application after the
 * design handoff was authored and had no assigned color. Their hues extend the
 * palette.
 *
 * No imports here on purpose: `tailwind.config.ts` reads this file to emit the
 * custom properties, and `categoryColors.ts` wraps it with the `Category` type.
 */

export interface CategoryHues {
  light: string;
  dark: string;
}

export const CATEGORY_HUES = {
  Income: { light: '#5A7A5A', dark: '#8FB88F' },
  Housing: { light: '#5D4037', dark: '#C39C8A' },
  Utilities: { light: '#7B9E7B', dark: '#A3C4A3' },
  Groceries: { light: '#A3BFA3', dark: '#A3BFA3' },
  Transportation: { light: '#C17D4A', dark: '#D9A373' },
  Insurance: { light: '#8A8279', dark: '#B3AA9F' },
  Healthcare: { light: '#C1574A', dark: '#E38A7C' },
  Entertainment: { light: '#A68B7B', dark: '#C6AA9B' },
  Dining: { light: '#D9A373', dark: '#D9A373' },
  Shopping: { light: '#7B5B4F', dark: '#C39D8F' },
  Subscriptions: { light: '#B5AEA4', dark: '#B5AEA4' },
  'Loan Payments': { light: '#8A5570', dark: '#C68CA6' },
  Taxes: { light: '#9C7C36', dark: '#CCA75F' },
  Fitness: { light: '#4E7F7A', dark: '#82B6B0' },
  Transfers: { light: '#3D5C3D', dark: '#82AB82' },
  Other: { light: '#B5AEA4', dark: '#B5AEA4' },
} as const satisfies Record<string, CategoryHues>;

/** Shown for a transaction with no category assigned. */
export const UNCATEGORIZED_HUES: CategoryHues = {
  light: '#D8D2C8',
  dark: '#776E65',
};

/** CSS custom property name for a category, e.g. `--cat-loan-payments`. */
export function categoryVarName(category: string): string {
  return `--cat-${category.toLowerCase().replace(/\s+/g, '-')}`;
}

export const UNCATEGORIZED_VAR = '--cat-uncategorized';
