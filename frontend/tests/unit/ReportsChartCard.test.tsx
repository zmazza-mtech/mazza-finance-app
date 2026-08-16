import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReportsChartCard } from '@/components/reports/ReportsChartCard';
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
  [['Income', '4837.32']],
  [
    ['Housing', '-2663.20'],
    ['Dining', '-1000.00'],
  ],
);

describe('ReportsChartCard — header', () => {
  it('titles the card and summarizes the flow', () => {
    render(<ReportsChartCard data={BALANCED} />);
    expect(screen.getByText('Where the income went')).toBeInTheDocument();
    expect(
      screen.getByText('$4,837.32 in · −$3,663.20 out · $1,174.12 kept'),
    ).toBeInTheDocument();
  });

  it('states an overspend rather than a negative amount kept', () => {
    render(
      <ReportsChartCard
        data={summary([['Income', '1000.00']], [['Housing', '-1200.00']])}
      />,
    );
    expect(
      screen.getByText('$1,000.00 in · −$1,200.00 out · −$200.00 over'),
    ).toBeInTheDocument();
  });
});

describe('ReportsChartCard — view toggle', () => {
  it('offers Sankey and Breakdown as a radiogroup', () => {
    render(<ReportsChartCard data={BALANCED} />);
    const group = screen.getByRole('radiogroup', { name: 'Chart view' });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Sankey' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Breakdown' })).not.toBeChecked();
  });

  it('shows the Sankey first', () => {
    render(<ReportsChartCard data={BALANCED} />);
    expect(
      screen.getByRole('list', { name: 'Flow by category' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('list', { name: 'Spending breakdown' }),
    ).not.toBeInTheDocument();
  });

  it('swaps to the breakdown on selection', async () => {
    const user = userEvent.setup();
    render(<ReportsChartCard data={BALANCED} />);

    await user.click(screen.getByRole('radio', { name: 'Breakdown' }));

    expect(screen.getByRole('radio', { name: 'Breakdown' })).toBeChecked();
    expect(
      screen.getByRole('list', { name: 'Spending breakdown' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('list', { name: 'Flow by category' }),
    ).not.toBeInTheDocument();
  });

  it('swaps back to the Sankey', async () => {
    const user = userEvent.setup();
    render(<ReportsChartCard data={BALANCED} />);

    await user.click(screen.getByRole('radio', { name: 'Breakdown' }));
    await user.click(screen.getByRole('radio', { name: 'Sankey' }));

    expect(
      screen.getByRole('list', { name: 'Flow by category' }),
    ).toBeInTheDocument();
  });
});
