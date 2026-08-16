import { describe, it, expect } from 'vitest';
import { CATEGORIES } from '@/lib/categories';
import { CATEGORY_COLORS, UNCATEGORIZED_COLOR, getCategoryColor } from '@/lib/categoryColors';
import { CATEGORY_HUES, categoryVarName } from '@/lib/categoryPalette';

/**
 * The hues themselves, and their contrast in both modes, are covered by
 * `palette.test.ts`. What matters here is the indirection: every category
 * resolves to a custom property, so a dot or a Sankey ribbon picks up the dark
 * counterpart without the component knowing which mode it is in.
 */
const PALETTE_EXTENSIONS = ['Loan Payments', 'Taxes', 'Fitness'] as const;

/** Relative luminance per WCAG 2.1, from a #rrggbb string. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const linear = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

/** Contrast ratio of a color against pure white. */
function contrastOnWhite(hex: string): number {
  return 1.05 / (luminance(hex) + 0.05);
}

describe('CATEGORY_COLORS', () => {
  it('covers every canonical category', () => {
    for (const category of CATEGORIES) {
      expect(CATEGORY_COLORS[category], `missing color for ${category}`).toBeDefined();
    }
  });

  it('has no entries beyond the canonical categories', () => {
    expect(Object.keys(CATEGORY_COLORS).sort()).toEqual([...CATEGORIES].sort());
  });

  it('resolves every category through a custom property', () => {
    for (const [category, value] of Object.entries(CATEGORY_COLORS)) {
      expect(value, `${category} is not a var() reference`).toBe(
        `var(${categoryVarName(category)})`,
      );
    }
  });

  it('backs every reference with a hue in both modes', () => {
    for (const category of CATEGORIES) {
      expect(CATEGORY_HUES[category as keyof typeof CATEGORY_HUES], category).toBeDefined();
    }
  });

  /**
   * The handoff deliberately gives Subscriptions and Other the same warm-gray:
   * both are catch-all buckets and neither earns a distinct hue. That is the
   * only sanctioned collision — this guards against accidental ones.
   */
  it('shares a color only between Subscriptions and Other', () => {
    const byColor = new Map<string, string[]>();
    for (const [category, hues] of Object.entries(CATEGORY_HUES)) {
      const key = hues.light.toUpperCase();
      byColor.set(key, [...(byColor.get(key) ?? []), category]);
    }
    const collisions = [...byColor.values()]
      .filter((names) => names.length > 1)
      .map((names) => names.sort());

    expect(collisions).toEqual([['Other', 'Subscriptions']]);
  });

  it('gives the post-handoff categories a hue of their own', () => {
    // Loan Payments, Taxes and Fitness were added after the handoff and had no
    // assigned color. Nothing about them is the designer's choice, so they are
    // held to 3:1 on white — see palette.test.ts for the dark counterparts.
    for (const category of PALETTE_EXTENSIONS) {
      const hue = CATEGORY_HUES[category];
      expect(hue, category).toBeDefined();
      expect(contrastOnWhite(hue.light), `${category} is too pale on white`).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('getCategoryColor', () => {
  it('returns the mapped color for a known category', () => {
    expect(getCategoryColor('Groceries')).toBe(CATEGORY_COLORS.Groceries);
  });

  it('falls back to the uncategorized color for null', () => {
    expect(getCategoryColor(null)).toBe(UNCATEGORIZED_COLOR);
  });
});
