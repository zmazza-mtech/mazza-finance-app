import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MonthlyComparison } from '@/components/reports/MonthlyComparison';
import type { MonthlySummaryMonth } from '@/api/types';

function month(overrides: Partial<MonthlySummaryMonth> = {}): MonthlySummaryMonth {
  return {
    month: '2026-08',
    income: '2400.00',
    expenses: '-1350.00',
    net: '1050.00',
    categories: [],
    ...overrides,
  };
}

const GROCERIES = {
  category: 'Groceries',
  total: '-812.40',
  change: '122.30',
  changePercent: '17.7',
};

describe('MonthlyComparison', () => {
  it('says there is nothing to compare when no month holds anything', () => {
    render(
      <MonthlyComparison
        months={[month({ income: '0.00', expenses: '0.00', net: '0.00' })]}
      />,
    );
    expect(screen.getByText(/no transactions in this range/i)).toBeInTheDocument();
  });

  it('names every month in the range as a column', () => {
    render(
      <MonthlyComparison
        months={[
          month({ month: '2026-07', categories: [GROCERIES] }),
          month({ month: '2026-08', categories: [GROCERIES] }),
        ]}
      />,
    );
    expect(screen.getByRole('columnheader', { name: 'Jul 2026' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Aug 2026' })).toBeInTheDocument();
  });

  it('keeps a month with no transactions as a column of its own', () => {
    render(
      <MonthlyComparison
        months={[
          month({ month: '2026-07', income: '0.00', expenses: '0.00', net: '0.00' }),
          month({ month: '2026-08', categories: [GROCERIES] }),
        ]}
      />,
    );
    expect(screen.getByRole('columnheader', { name: 'Jul 2026' })).toBeInTheDocument();
  });

  it('shows the income, expenses and net for each month', () => {
    render(<MonthlyComparison months={[month({ categories: [GROCERIES] })]} />);

    const incomeRow = screen.getByRole('row', { name: /^Total income/ });
    expect(within(incomeRow).getByText('$2,400.00')).toBeInTheDocument();

    const netRow = screen.getByRole('row', { name: /^Net/ });
    expect(within(netRow).getByText('$1,050.00')).toBeInTheDocument();
  });

  it('lists a category with its total for the month', () => {
    render(<MonthlyComparison months={[month({ categories: [GROCERIES] })]} />);
    const row = screen.getByRole('row', { name: /Groceries/ });
    expect(within(row).getByText('-$812.40')).toBeInTheDocument();
  });

  it('shows the movement as both an amount and a percent', () => {
    render(<MonthlyComparison months={[month({ categories: [GROCERIES] })]} />);
    expect(screen.getByText('+$122.30 (+17.7%)')).toBeInTheDocument();
  });

  it('signs a fall in spending as a decrease', () => {
    render(
      <MonthlyComparison
        months={[
          month({
            categories: [
              { category: 'Dining', total: '-244.19', change: '-74.36', changePercent: '-23.3' },
            ],
          }),
        ]}
      />,
    );
    expect(screen.getByText('-$74.36 (-23.3%)')).toBeInTheDocument();
  });

  it('shows no movement figure for a month with nothing to compare against', () => {
    render(
      <MonthlyComparison
        months={[
          month({
            categories: [
              { category: 'Groceries', total: '-812.40', change: null, changePercent: null },
            ],
          }),
        ]}
      />,
    );
    const row = screen.getByRole('row', { name: /Groceries/ });
    expect(within(row).getByLabelText('No prior month to compare')).toBeInTheDocument();
  });

  it('states an amount without a percent when the prior month was zero', () => {
    render(
      <MonthlyComparison
        months={[
          month({
            categories: [
              { category: 'Groceries', total: '-40.00', change: '40.00', changePercent: null },
            ],
          }),
        ]}
      />,
    );
    expect(screen.getByText('+$40.00')).toBeInTheDocument();
  });

  it('reads a steady category as no change rather than as missing', () => {
    render(
      <MonthlyComparison
        months={[
          month({
            categories: [
              { category: 'Utilities', total: '-198.00', change: '0.00', changePercent: '0.0' },
            ],
          }),
        ]}
      />,
    );
    expect(screen.getByText('+$0.00 (+0.0%)')).toBeInTheDocument();
  });

  it('gives a category one row across every month it appears in', () => {
    render(
      <MonthlyComparison
        months={[
          month({
            month: '2026-07',
            categories: [
              { category: 'Groceries', total: '-690.10', change: null, changePercent: null },
            ],
          }),
          month({ month: '2026-08', categories: [GROCERIES] }),
        ]}
      />,
    );
    expect(screen.getAllByRole('row', { name: /Groceries/ })).toHaveLength(1);
  });

  it('leaves a month blank for a category that has nothing in it', () => {
    render(
      <MonthlyComparison
        months={[
          month({ month: '2026-07', categories: [] }),
          month({ month: '2026-08', categories: [GROCERIES] }),
        ]}
      />,
    );
    const row = screen.getByRole('row', { name: /Groceries/ });
    expect(within(row).getByLabelText('Groceries, Jul 2026: nothing')).toBeInTheDocument();
  });
});
