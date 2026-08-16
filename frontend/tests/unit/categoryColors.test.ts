import { describe, it, expect } from 'vitest';
import { CATEGORIES } from '@/lib/categories';
import { CATEGORY_COLORS, UNCATEGORIZED_COLOR, getCategoryColor } from '@/lib/categoryColors';

/** Relative luminance per WCAG 2.1, from a #rrggbb string. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const linear = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

/** Contrast ratio of a color against pure white. */
function contrastOnWhite(hex: string): number {
  return 1.05 / (luminance(hex) + 0.05);
}

/**
 * Categories added after the design handoff was authored, coloured by
 * extending the Momoski palette. Unlike the handoff's own tints these are
 * held to 3:1 on white, since nothing about them is the designer's choice.
 */
const PALETTE_EXTENSIONS = {
  'Loan Payments': '#8A5570',
  Taxes: '#9C7C36',
  Fitness: '#4E7F7A',
} as const;

describe('CATEGORY_COLORS', () => {
  it('covers every canonical category', () => {
    for (const category of CATEGORIES) {
      expect(CATEGORY_COLORS[category], `missing color for ${category}`).toBeDefined();
    }
  });

  it('has no entries beyond the canonical categories', () => {
    expect(Object.keys(CATEGORY_COLORS).sort()).toEqual([...CATEGORIES].sort());
  });

  it('uses #rrggbb notation throughout, as SVG fills require', () => {
    for (const [category, hex] of Object.entries(CATEGORY_COLORS)) {
      expect(hex, `${category} is not a #rrggbb hex`).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  /**
   * The handoff deliberately gives Subscriptions and Other the same warm-gray:
   * both are catch-all buckets and neither earns a distinct hue. That is the
   * only sanctioned collision — this guards against accidental ones.
   */
  it('shares a color only between Subscriptions and Other', () => {
    const byColor = new Map<string, string[]>();
    for (const [category, hex] of Object.entries(CATEGORY_COLORS)) {
      const key = hex.toUpperCase();
      byColor.set(key, [...(byColor.get(key) ?? []), category]);
    }
    const collisions = [...byColor.values()]
      .filter((names) => names.length > 1)
      .map((names) => names.sort());

    expect(collisions).toEqual([['Other', 'Subscriptions']]);
  });

  it('holds the palette extensions to 3:1 against white', () => {
    for (const [category, hex] of Object.entries(PALETTE_EXTENSIONS)) {
      expect(CATEGORY_COLORS[category as keyof typeof PALETTE_EXTENSIONS]).toBe(hex);
      expect(contrastOnWhite(hex), `${category} (${hex}) is too pale on white`).toBeGreaterThanOrEqual(3);
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
