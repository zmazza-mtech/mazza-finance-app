import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TransactionItem } from '@/components/calendar/TransactionItem';
import type { ForecastTransaction } from '@/api/types';

function makeTx(overrides: Partial<ForecastTransaction> = {}): ForecastTransaction {
  return {
    id: 'tx-1',
    date: '2025-06-15',
    description: 'Netflix',
    amount: '-15.99',
    source: 'actual',
    category: null,
    ...overrides,
  };
}

describe('TransactionItem', () => {
  it('renders the transaction description', () => {
    render(<TransactionItem transaction={makeTx()} />);
    expect(screen.getByText('Netflix')).toBeInTheDocument();
  });

  it('signs a debit with a true minus sign, not a hyphen', () => {
    render(<TransactionItem transaction={makeTx({ amount: '-15.99' })} />);
    // U+2212, per the design system.
    expect(screen.getByText('−$15.99')).toBeInTheDocument();
  });

  it('signs a credit with a plus', () => {
    render(<TransactionItem transaction={makeTx({ amount: '100.00' })} />);
    expect(screen.getByText('+$100.00')).toBeInTheDocument();
  });

  it('has correct aria-label format for debit', () => {
    const tx = makeTx({ description: 'Netflix', amount: '-15.99', source: 'actual' });
    render(<TransactionItem transaction={tx} />);
    expect(screen.getByLabelText('Netflix, $15.99, debit, actual')).toBeInTheDocument();
  });

  it('has correct aria-label format for deposit', () => {
    const tx = makeTx({ description: 'Paycheck', amount: '2500.00', source: 'manual' });
    render(<TransactionItem transaction={tx} />);
    expect(screen.getByLabelText('Paycheck, $2,500.00, deposit, manual')).toBeInTheDocument();
  });

  it('colors a debit with the bark token', () => {
    render(<TransactionItem transaction={makeTx({ amount: '-15.99' })} />);
    expect(screen.getByText('−$15.99').className).toMatch(/text-bark-light/);
  });

  it('colors a credit with the sage token', () => {
    render(<TransactionItem transaction={makeTx({ amount: '100.00' })} />);
    expect(screen.getByText('+$100.00').className).toMatch(/text-sage-deep/);
  });

  it('truncates a long description rather than wrapping the cell open', () => {
    const tx = makeTx({ description: 'A very long merchant name that will not fit' });
    render(<TransactionItem transaction={tx} />);
    const description = screen.getByText(tx.description);
    expect(description.className).toMatch(/truncate/);
    // The full text stays reachable on hover.
    expect(description.getAttribute('title')).toBe(tx.description);
  });

  it('carries no source badge — source lives in the day panel', () => {
    render(<TransactionItem transaction={makeTx({ source: 'forecast' })} />);
    expect(screen.queryByText('Forecast')).not.toBeInTheDocument();
  });

  it('carries no direction arrow — the sign already says which way', () => {
    render(<TransactionItem transaction={makeTx({ amount: '-15.99' })} />);
    expect(screen.queryByText('↓')).not.toBeInTheDocument();
    expect(screen.queryByText('↑')).not.toBeInTheDocument();
  });

  it('marks a search match', () => {
    render(<TransactionItem transaction={makeTx()} isMatch />);
    expect(screen.getByRole('listitem').className).toMatch(/bg-sage-lighter/);
  });
});
