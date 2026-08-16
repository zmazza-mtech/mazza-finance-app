import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { CategorySummaryTable } from '@/components/reports/CategorySummaryTable';
import type { CategorySummaryItem } from '@/api/types';

function items(...pairs: [string, string][]): CategorySummaryItem[] {
  return pairs.map(([category, total]) => ({ category, total }));
}

describe('CategorySummaryTable', () => {
  it('renders nothing when there is nothing to summarize', () => {
    const { container } = render(
      <CategorySummaryTable title="Income" items={[]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('titles the card', () => {
    render(
      <CategorySummaryTable title="Expenses" items={items(['Housing', '-600.00'])} />,
    );
    expect(screen.getByRole('heading', { name: 'Expenses' })).toBeInTheDocument();
  });

  it('states each amount as a positive value with its share', () => {
    render(
      <CategorySummaryTable
        title="Expenses"
        items={items(['Housing', '-600.00'], ['Dining', '-200.00'])}
      />,
    );
    const row = screen.getByRole('row', { name: /Housing/ });
    expect(within(row).getByText('$600.00')).toBeInTheDocument();
    expect(within(row).getByText('75.0%')).toBeInTheDocument();
  });

  it('computes a repeating share without float drift', () => {
    render(
      <CategorySummaryTable
        title="Expenses"
        items={items(['Housing', '-100.00'], ['Dining', '-100.00'], ['Fitness', '-100.00'])}
      />,
    );
    expect(screen.getAllByText('33.3%')).toHaveLength(3);
  });

  it('totals the rows', () => {
    render(
      <CategorySummaryTable
        title="Expenses"
        items={items(['Housing', '-600.00'], ['Dining', '-200.00'])}
      />,
    );
    const total = screen.getByRole('row', { name: /Total/ });
    expect(within(total).getByText('$800.00')).toBeInTheDocument();
    expect(within(total).getByText('100%')).toBeInTheDocument();
  });
});
