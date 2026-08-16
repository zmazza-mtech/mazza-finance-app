import { describe, it, expect } from 'vitest';
import {
  buildSankeyLayout,
  VIEWBOX_HEIGHT,
  TOP_INSET,
  NODE_GAP,
  MIN_ROW_HEIGHT,
  KEPT_COLOR,
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

/** Income 1000, split 600 / 300, leaving 100 kept. */
const BALANCED = summary(
  [['Income', '1000.00']],
  [
    ['Housing', '-600.00'],
    ['Dining', '-300.00'],
  ],
);

describe('buildSankeyLayout — totals', () => {
  it('sums income, expenses and what is kept', () => {
    const layout = buildSankeyLayout(BALANCED);
    expect(layout.income).toBe('1000.00');
    expect(layout.expenses).toBe('900.00');
    expect(layout.kept).toBe('100.00');
    expect(layout.overspend).toBeNull();
  });

  it('sums income across several income categories', () => {
    const layout = buildSankeyLayout(
      summary(
        [
          ['Income', '1000.00'],
          ['Other', '250.50'],
        ],
        [['Housing', '-500.00']],
      ),
    );
    expect(layout.income).toBe('1250.50');
    expect(layout.kept).toBe('750.50');
  });
});

describe('buildSankeyLayout — rows', () => {
  it('orders expenses by amount descending and appends Kept last', () => {
    const layout = buildSankeyLayout(
      summary(
        [['Income', '1000.00']],
        [
          ['Dining', '-300.00'],
          ['Housing', '-600.00'],
        ],
      ),
    );
    expect(layout.rows.map((r) => r.label)).toEqual(['Housing', 'Dining', 'Kept']);
  });

  it('colors the Kept band sage', () => {
    const layout = buildSankeyLayout(BALANCED);
    const kept = layout.rows[layout.rows.length - 1];
    expect(kept.label).toBe('Kept');
    expect(kept.color).toBe(KEPT_COLOR);
  });

  it('carries the category color for each expense row', () => {
    const layout = buildSankeyLayout(BALANCED);
    expect(layout.rows[0].color).toBe('var(--cat-housing)'); // Housing
  });

  it('drops categories with no amount', () => {
    const layout = buildSankeyLayout(
      summary(
        [['Income', '1000.00']],
        [
          ['Housing', '-600.00'],
          ['Fitness', '0.00'],
        ],
      ),
    );
    expect(layout.rows.map((r) => r.label)).toEqual(['Housing', 'Kept']);
  });

  it('omits the Kept row when nothing is kept', () => {
    const layout = buildSankeyLayout(
      summary([['Income', '1000.00']], [['Housing', '-1000.00']]),
    );
    expect(layout.rows.map((r) => r.label)).toEqual(['Housing']);
    expect(layout.kept).toBe('0.00');
    expect(layout.overspend).toBeNull();
  });
});

describe('buildSankeyLayout — geometry', () => {
  it('fills the viewbox exactly, inset top and bottom', () => {
    const layout = buildSankeyLayout(BALANCED);
    const first = layout.rows[0];
    const last = layout.rows[layout.rows.length - 1];

    expect(first.targetY).toBe(TOP_INSET);
    expect(last.targetY + last.height).toBeCloseTo(VIEWBOX_HEIGHT - TOP_INSET, 6);
  });

  it('spaces target nodes by the node gap', () => {
    const layout = buildSankeyLayout(BALANCED);
    const [a, b] = layout.rows;
    expect(b.targetY).toBeCloseTo(a.targetY + a.height + NODE_GAP, 6);
  });

  it('divides the flexible height in proportion to each amount', () => {
    const layout = buildSankeyLayout(BALANCED);
    // avail = 452 - 16 - 12 * 2 = 412; flex = 412 - 10 * 3 = 382
    expect(layout.rows[0].height).toBeCloseTo(10 + 0.6 * 382, 2); // 239.2
    expect(layout.rows[1].height).toBeCloseTo(10 + 0.3 * 382, 2); // 124.6
    expect(layout.rows[2].height).toBeCloseTo(10 + 0.1 * 382, 2); // 48.2
  });

  it('centers the source node against the target column', () => {
    const layout = buildSankeyLayout(BALANCED);
    expect(layout.source.y).toBeCloseTo(TOP_INSET + (NODE_GAP * 2) / 2, 6); // 20
    expect(layout.source.centerPercent).toBeCloseTo(50, 6);
  });

  it('stacks source segments contiguously, with no gaps', () => {
    const layout = buildSankeyLayout(BALANCED);
    expect(layout.rows[0].sourceY).toBeCloseTo(layout.source.y, 6);
    for (let i = 1; i < layout.rows.length; i += 1) {
      const prev = layout.rows[i - 1];
      expect(layout.rows[i].sourceY).toBeCloseTo(prev.sourceY + prev.height, 6);
    }
  });

  it('gives the source node the summed height of its segments', () => {
    const layout = buildSankeyLayout(BALANCED);
    const summed = layout.rows.reduce((total, row) => total + row.height, 0);
    expect(layout.source.height).toBeCloseTo(summed, 6);
  });

  it('draws each ribbon from its source segment to its target node', () => {
    const layout = buildSankeyLayout(BALANCED);
    expect(layout.rows[0].path).toBe(
      'M14 20 C280 20 280 8 546 8 L546 247.2 C280 247.2 280 259.2 14 259.2 Z',
    );
  });

  it('positions each label at the vertical center of its node', () => {
    const layout = buildSankeyLayout(BALANCED);
    const row = layout.rows[0];
    expect(row.centerPercent).toBeCloseTo(
      ((row.targetY + row.height / 2) / VIEWBOX_HEIGHT) * 100,
      6,
    );
  });
});

describe('buildSankeyLayout — sub-1% categories', () => {
  it('floors a tiny category at the minimum height', () => {
    const layout = buildSankeyLayout(
      summary(
        [['Income', '10000.00']],
        [
          ['Housing', '-5000.00'],
          ['Fitness', '-5.00'],
        ],
      ),
    );
    const fitness = layout.rows.find((r) => r.label === 'Fitness');
    expect(fitness?.height).toBeGreaterThanOrEqual(MIN_ROW_HEIGHT);
    expect(fitness?.percent).toBe('0.1');
  });

  it('keeps the viewbox exact even with a floored row', () => {
    const layout = buildSankeyLayout(
      summary(
        [['Income', '10000.00']],
        [
          ['Housing', '-5000.00'],
          ['Fitness', '-5.00'],
        ],
      ),
    );
    const last = layout.rows[layout.rows.length - 1];
    expect(last.targetY + last.height).toBeCloseTo(VIEWBOX_HEIGHT - TOP_INSET, 6);
  });
});

describe('buildSankeyLayout — zero income', () => {
  it('reports an empty layout with no rows', () => {
    const layout = buildSankeyLayout(summary([], [['Housing', '-600.00']]));
    expect(layout.isEmpty).toBe(true);
    expect(layout.rows).toEqual([]);
  });

  it('is empty with neither income nor expenses', () => {
    const layout = buildSankeyLayout(summary([], []));
    expect(layout.isEmpty).toBe(true);
    expect(layout.rows).toEqual([]);
  });

  it('is not empty once income exists', () => {
    expect(buildSankeyLayout(BALANCED).isEmpty).toBe(false);
  });
});

describe('buildSankeyLayout — overspend', () => {
  const OVERSPENT = summary(
    [['Income', '1000.00']],
    [
      ['Housing', '-900.00'],
      ['Dining', '-300.00'],
    ],
  );

  it('reports the shortfall as a positive amount', () => {
    const layout = buildSankeyLayout(OVERSPENT);
    expect(layout.kept).toBe('-200.00');
    expect(layout.overspend).toBe('200.00');
  });

  it('drops the Kept row rather than inverting it', () => {
    const layout = buildSankeyLayout(OVERSPENT);
    expect(layout.rows.map((r) => r.label)).toEqual(['Housing', 'Dining']);
  });

  it('keeps every row height positive and inside the viewbox', () => {
    const layout = buildSankeyLayout(OVERSPENT);
    for (const row of layout.rows) {
      expect(row.height).toBeGreaterThanOrEqual(MIN_ROW_HEIGHT);
    }
    const last = layout.rows[layout.rows.length - 1];
    expect(last.targetY + last.height).toBeCloseTo(VIEWBOX_HEIGHT - TOP_INSET, 6);
  });

  it('draws no ribbon whose target span runs backwards', () => {
    const layout = buildSankeyLayout(OVERSPENT);
    for (const row of layout.rows) {
      expect(row.height).toBeGreaterThan(0);
      expect(row.targetY).toBeGreaterThanOrEqual(TOP_INSET);
    }
  });

  it('states percentages against what was actually spent', () => {
    const layout = buildSankeyLayout(OVERSPENT);
    expect(layout.rows.map((r) => r.percent)).toEqual(['75.0', '25.0']);
  });
});

describe('buildSankeyLayout — percentages', () => {
  it('computes a repeating share without float drift', () => {
    const layout = buildSankeyLayout(
      summary(
        [['Income', '300.00']],
        [
          ['Housing', '-100.00'],
          ['Dining', '-100.00'],
          ['Groceries', '-100.00'],
        ],
      ),
    );
    expect(layout.rows.map((r) => r.percent)).toEqual(['33.3', '33.3', '33.3']);
  });

  it('states each row amount as a positive decimal string', () => {
    const layout = buildSankeyLayout(BALANCED);
    expect(layout.rows.map((r) => r.amount)).toEqual([
      '600.00',
      '300.00',
      '100.00',
    ]);
  });
});
