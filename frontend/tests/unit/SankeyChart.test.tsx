import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { SankeyChart } from '@/components/reports/SankeyChart';
import { buildSankeyLayout } from '@/lib/sankey';
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

const BALANCED = summary(
  [['Income', '1000.00']],
  [
    ['Housing', '-600.00'],
    ['Dining', '-300.00'],
  ],
);

function renderChart(data: CategorySummaryResponse) {
  return render(<SankeyChart layout={buildSankeyLayout(data)} />);
}

describe('SankeyChart — empty', () => {
  it('explains that there is nothing to trace without income', () => {
    renderChart(summary([], [['Housing', '-600.00']]));
    expect(
      screen.getByText('No income in this range, so there is nothing to trace.'),
    ).toBeInTheDocument();
  });

  it('draws no ribbons when empty', () => {
    const { container } = renderChart(summary([], []));
    expect(container.querySelectorAll('path')).toHaveLength(0);
  });
});

describe('SankeyChart — flow', () => {
  it('draws one ribbon per row', () => {
    const { container } = renderChart(BALANCED);
    // Housing, Dining, Kept
    expect(container.querySelectorAll('path')).toHaveLength(3);
  });

  it('draws a source node and one target node per row', () => {
    const { container } = renderChart(BALANCED);
    expect(container.querySelectorAll('rect')).toHaveLength(4);
  });

  it('fills each ribbon with its category color, translucent', () => {
    const { container } = renderChart(BALANCED);
    const first = container.querySelector('path');
    expect(first).toHaveAttribute('fill', '#5D4037');
    expect(first).toHaveAttribute('fill-opacity', '0.32');
  });

  it('hides the drawing from assistive tech, which reads the labels instead', () => {
    const { container } = renderChart(BALANCED);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('SankeyChart — labels', () => {
  it('labels the source with the income total', () => {
    renderChart(BALANCED);
    expect(screen.getByText('Income')).toBeInTheDocument();
    expect(screen.getByText('$1,000.00')).toBeInTheDocument();
  });

  it('lists every row with its amount and share', () => {
    renderChart(BALANCED);
    const list = screen.getByRole('list', { name: 'Flow by category' });
    const items = within(list).getAllByRole('listitem');

    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('Housing');
    expect(items[0]).toHaveTextContent('$600.00 · 60.0%');
    expect(items[2]).toHaveTextContent('Kept');
    expect(items[2]).toHaveTextContent('$100.00 · 10.0%');
  });

  it('positions each label at the center of its node', () => {
    renderChart(BALANCED);
    const list = screen.getByRole('list', { name: 'Flow by category' });
    const first = within(list).getAllByRole('listitem')[0];
    // Housing spans 8 to 247.2, so its center is 127.6 of 452.
    expect(first).toHaveStyle({ top: '28.23%' });
  });
});

describe('SankeyChart — caption', () => {
  it('explains the ribbon width and the sage band', () => {
    renderChart(BALANCED);
    expect(
      screen.getByText('Ribbon width = share of income · sage band = kept'),
    ).toBeInTheDocument();
  });

  it('surfaces an overspend instead of a kept band', () => {
    renderChart(
      summary(
        [['Income', '1000.00']],
        [
          ['Housing', '-900.00'],
          ['Dining', '-300.00'],
        ],
      ),
    );
    expect(
      screen.getByText(
        'Ribbon width = share of spending · spending exceeded income by $200.00',
      ),
    ).toBeInTheDocument();
  });
});
