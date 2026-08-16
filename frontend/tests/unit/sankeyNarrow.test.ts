import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import {
  buildSankeyLayout,
  WIDE_SANKEY,
  NARROW_SANKEY,
  KEPT_LABEL,
  OTHER_LABEL,
  OTHER_COLOR,
} from '@/lib/sankey';
import type { CategorySummaryResponse } from '@/api/types';

function summary(
  income: [string, string][],
  expenses: [string, string][],
): CategorySummaryResponse {
  return {
    income: income.map(([category, total]) => ({ category, total })),
    expenses: expenses.map(([category, total]) => ({ category, total })),
    transfers: [],
  };
}

/** Nine spend categories and change kept — more than a phone can name. */
const MANY = summary(
  [['Income', '1000.00']],
  [
    ['Housing', '-300.00'],
    ['Groceries', '-150.00'],
    ['Transportation', '-100.00'],
    ['Utilities', '-90.00'],
    ['Dining', '-80.00'],
    ['Insurance', '-70.00'],
    ['Healthcare', '-60.00'],
    ['Shopping', '-40.00'],
    ['Subscriptions', '-10.00'],
  ],
);

const BALANCED = summary(
  [['Income', '1000.00']],
  [
    ['Housing', '-600.00'],
    ['Dining', '-300.00'],
  ],
);

describe('buildSankeyLayout — dimensions', () => {
  it('defaults to the wide dimensions', () => {
    // Every existing call site passes no options. Those results must not move.
    expect(buildSankeyLayout(BALANCED)).toEqual(
      buildSankeyLayout(BALANCED, { dimensions: WIDE_SANKEY }),
    );
  });

  it('keeps every row inside the narrow viewbox', () => {
    const layout = buildSankeyLayout(MANY, { dimensions: NARROW_SANKEY });

    for (const row of layout.rows) {
      expect(row.targetY).toBeGreaterThanOrEqual(0);
      expect(row.targetY + row.height).toBeLessThanOrEqual(NARROW_SANKEY.height);
      expect(row.height).toBeGreaterThan(0);
    }
  });

  it('fills the narrow viewbox exactly, inset top and bottom', () => {
    const layout = buildSankeyLayout(MANY, { dimensions: NARROW_SANKEY });
    const last = layout.rows[layout.rows.length - 1]!;

    expect(last.targetY + last.height).toBeCloseTo(
      NARROW_SANKEY.height - NARROW_SANKEY.topInset,
      6,
    );
  });

  it('floors narrow rows at the taller narrow minimum', () => {
    // 22px on a phone, against 10px on desktop: a 10px row cannot carry a
    // label beside it at phone type sizes.
    const layout = buildSankeyLayout(MANY, { dimensions: NARROW_SANKEY });

    for (const row of layout.rows) {
      expect(row.height).toBeGreaterThanOrEqual(NARROW_SANKEY.minRowHeight);
    }
  });

  it('draws ribbons to the narrow target column', () => {
    const layout = buildSankeyLayout(BALANCED, { dimensions: NARROW_SANKEY });

    for (const row of layout.rows) {
      expect(row.path).toContain(`${NARROW_SANKEY.targetX} `);
      // The wide column would run off a 200-unit viewbox.
      expect(row.path).not.toContain(`${WIDE_SANKEY.targetX} `);
    }
  });

  it('measures label positions against the narrow height', () => {
    const layout = buildSankeyLayout(BALANCED, { dimensions: NARROW_SANKEY });

    for (const row of layout.rows) {
      const expected = ((row.targetY + row.height / 2) / NARROW_SANKEY.height) * 100;
      expect(row.centerPercent).toBeCloseTo(expected, 6);
    }
  });

  it('keeps an overspend layout inside the narrow viewbox', () => {
    const overspent = summary(
      [['Income', '500.00']],
      [
        ['Housing', '-600.00'],
        ['Dining', '-200.00'],
      ],
    );
    const layout = buildSankeyLayout(overspent, { dimensions: NARROW_SANKEY });

    expect(layout.overspend).toBe('300.00');
    for (const row of layout.rows) {
      expect(row.targetY + row.height).toBeLessThanOrEqual(NARROW_SANKEY.height);
    }
  });
});

describe('buildSankeyLayout — category rollup', () => {
  it('does not roll up by default', () => {
    const layout = buildSankeyLayout(MANY);
    expect(layout.rows).toHaveLength(9 + 1); // nine categories plus Kept
    expect(layout.rows.map((r) => r.label)).not.toContain(OTHER_LABEL);
  });

  it('keeps the largest N categories and rolls the tail into Other', () => {
    const layout = buildSankeyLayout(MANY, { maxCategories: 6 });

    expect(layout.rows.map((r) => r.label)).toEqual([
      'Housing',
      'Groceries',
      'Transportation',
      'Utilities',
      'Dining',
      'Insurance',
      OTHER_LABEL,
      KEPT_LABEL,
    ]);
  });

  it('sums the rolled-up categories exactly', () => {
    const layout = buildSankeyLayout(MANY, { maxCategories: 6 });
    const other = layout.rows.find((r) => r.label === OTHER_LABEL)!;

    // Healthcare 60 + Shopping 40 + Subscriptions 10. Asserted as an exact
    // string: a rollup that lost a cent would still look right in a ribbon.
    expect(other.amount).toBe('110.00');
  });

  it('creates and loses no money in the rollup', () => {
    const full = buildSankeyLayout(MANY);
    const rolled = buildSankeyLayout(MANY, { maxCategories: 6 });

    const sum = (rows: { amount: string }[]) =>
      rows.reduce((t, r) => t.plus(new Decimal(r.amount)), new Decimal(0)).toFixed(2);

    expect(sum(rolled.rows)).toBe(sum(full.rows));
  });

  it('leaves the totals untouched', () => {
    const full = buildSankeyLayout(MANY);
    const rolled = buildSankeyLayout(MANY, { maxCategories: 6 });

    expect(rolled.income).toBe(full.income);
    expect(rolled.expenses).toBe(full.expenses);
    expect(rolled.kept).toBe(full.kept);
  });

  it('colors Other in the neutral token, not a category hue', () => {
    const layout = buildSankeyLayout(MANY, { maxCategories: 6 });
    const other = layout.rows.find((r) => r.label === OTHER_LABEL)!;

    expect(other.color).toBe(OTHER_COLOR);
  });

  it('never rolls Kept into Other', () => {
    // Kept is not a spend category, and burying it would answer a different
    // question than "where did the income go".
    const layout = buildSankeyLayout(MANY, { maxCategories: 2 });
    const labels = layout.rows.map((r) => r.label);

    expect(labels[labels.length - 1]).toBe(KEPT_LABEL);
    expect(labels.filter((l) => l === KEPT_LABEL)).toHaveLength(1);
  });

  it('adds no Other row when the categories already fit', () => {
    const layout = buildSankeyLayout(BALANCED, { maxCategories: 6 });

    expect(layout.rows.map((r) => r.label)).toEqual(['Housing', 'Dining', KEPT_LABEL]);
  });

  it('adds no Other row when the count is exactly the cap', () => {
    // Off-by-one guard: six categories under a cap of six is not a tail.
    const six = summary(
      [['Income', '1000.00']],
      [
        ['Housing', '-300.00'],
        ['Groceries', '-150.00'],
        ['Transportation', '-100.00'],
        ['Utilities', '-90.00'],
        ['Dining', '-80.00'],
        ['Insurance', '-70.00'],
      ],
    );
    const layout = buildSankeyLayout(six, { maxCategories: 6 });

    expect(layout.rows.map((r) => r.label)).not.toContain(OTHER_LABEL);
    expect(layout.rows).toHaveLength(7); // six plus Kept
  });

  it('states percentages that still sum to the whole', () => {
    const layout = buildSankeyLayout(MANY, { maxCategories: 6 });
    const total = layout.rows.reduce((t, r) => t + parseFloat(r.percent), 0);

    expect(total).toBeCloseTo(100, 1);
  });

  it('applies the rollup and the narrow dimensions together', () => {
    const layout = buildSankeyLayout(MANY, {
      dimensions: NARROW_SANKEY,
      maxCategories: 6,
    });

    expect(layout.rows).toHaveLength(8);
    for (const row of layout.rows) {
      expect(row.targetY + row.height).toBeLessThanOrEqual(NARROW_SANKEY.height);
    }
  });
});
