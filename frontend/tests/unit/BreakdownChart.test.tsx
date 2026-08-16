import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { BreakdownChart } from '@/components/reports/BreakdownChart';
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
  return render(<BreakdownChart layout={buildSankeyLayout(data)} />);
}

describe('BreakdownChart', () => {
  it('explains that there is nothing to break down without income', () => {
    renderChart(summary([], []));
    expect(
      screen.getByText('No income in this range, so there is nothing to break down.'),
    ).toBeInTheDocument();
  });

  it('gives the stacked bar one segment per row, sized by share', () => {
    const { container } = renderChart(BALANCED);
    const bar = container.querySelector('[data-stacked-bar]');
    const segments = bar?.children;

    expect(segments).toHaveLength(3);
    expect(segments?.[0]).toHaveStyle({ backgroundColor: '#5D4037' });
    expect(segments?.[0]).toHaveStyle({ flexGrow: '60' });
  });

  it('lists every row with its amount and share', () => {
    renderChart(BALANCED);
    const list = screen.getByRole('list', { name: 'Spending breakdown' });
    const items = within(list).getAllByRole('listitem');

    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('Housing');
    expect(items[0]).toHaveTextContent('$600.00');
    expect(items[0]).toHaveTextContent('60.0%');
  });

  it('fills each row track to its share of the flow', () => {
    const { container } = renderChart(BALANCED);
    const bars = container.querySelectorAll('[data-row-bar]');
    expect(bars[0]).toHaveStyle({ width: '60%' });
    expect(bars[1]).toHaveStyle({ width: '30%' });
  });

  it('keeps the Kept band last and sage', () => {
    renderChart(BALANCED);
    const items = within(
      screen.getByRole('list', { name: 'Spending breakdown' }),
    ).getAllByRole('listitem');
    expect(items[2]).toHaveTextContent('Kept');
  });
});
