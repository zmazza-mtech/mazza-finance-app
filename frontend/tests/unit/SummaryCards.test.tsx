import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SummaryCards } from '@/components/transactions/SummaryCards';

const baseSummary = {
  moneyIn: '1540.50',
  moneyOut: '984.21',
  net: '556.29',
  count: 12,
};

describe('SummaryCards', () => {
  it('labels the three cards', () => {
    render(<SummaryCards summary={baseSummary} />);
    expect(screen.getByText('Money in')).toBeInTheDocument();
    expect(screen.getByText('Money out')).toBeInTheDocument();
    expect(screen.getByText('Net · 12 transactions')).toBeInTheDocument();
  });

  it('shows money in as a credit', () => {
    render(<SummaryCards summary={baseSummary} />);
    expect(screen.getByText('+$1,540.50')).toBeInTheDocument();
  });

  it('shows money out as a debit', () => {
    render(<SummaryCards summary={baseSummary} />);
    expect(screen.getByText('−$984.21')).toBeInTheDocument();
  });

  it('signs a positive net', () => {
    render(<SummaryCards summary={baseSummary} />);
    expect(screen.getByText('+$556.29')).toBeInTheDocument();
  });

  it('signs a negative net', () => {
    render(<SummaryCards summary={{ ...baseSummary, net: '-150.00' }} />);
    expect(screen.getByText('−$150.00')).toBeInTheDocument();
  });

  it('leaves a zero net unsigned', () => {
    render(<SummaryCards summary={{ ...baseSummary, net: '0.00' }} />);
    expect(screen.getByText('$0.00')).toBeInTheDocument();
  });

  it('uses the singular noun for a single transaction', () => {
    render(<SummaryCards summary={{ ...baseSummary, count: 1 }} />);
    expect(screen.getByText('Net · 1 transaction')).toBeInTheDocument();
  });

  it('reports an empty range as zero transactions', () => {
    render(
      <SummaryCards summary={{ moneyIn: '0.00', moneyOut: '0.00', net: '0.00', count: 0 }} />,
    );
    expect(screen.getByText('Net · 0 transactions')).toBeInTheDocument();
  });
});
