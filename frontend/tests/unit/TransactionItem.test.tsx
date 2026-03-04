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

  it('renders formatted amount without sign', () => {
    render(<TransactionItem transaction={makeTx({ amount: '-15.99' })} />);
    expect(screen.getByText('$15.99')).toBeInTheDocument();
  });

  it('renders source badge', () => {
    render(<TransactionItem transaction={makeTx({ source: 'forecast' })} />);
    expect(screen.getByText('Forecasted')).toBeInTheDocument();
  });

  it('has correct aria-label format for debit', () => {
    const tx = makeTx({ description: 'Netflix', amount: '-15.99', source: 'actual' });
    render(<TransactionItem transaction={tx} />);
    expect(
      screen.getByLabelText('Netflix, $15.99, debit, actual'),
    ).toBeInTheDocument();
  });

  it('has correct aria-label format for deposit', () => {
    const tx = makeTx({ description: 'Paycheck', amount: '2500.00', source: 'manual' });
    render(<TransactionItem transaction={tx} />);
    expect(
      screen.getByLabelText('Paycheck, $2,500.00, deposit, manual'),
    ).toBeInTheDocument();
  });

  it('shows debit direction indicator (arrow down icon or text)', () => {
    render(<TransactionItem transaction={makeTx({ amount: '-15.99' })} />);
    // Should have some debit indicator — color class on the listitem
    const item = screen.getByRole('listitem');
    expect(item).toBeInTheDocument();
    // Color class for debit (red) is on the li element itself
    expect(item.className).toMatch(/red/);
  });

  it('shows deposit direction indicator', () => {
    render(<TransactionItem transaction={makeTx({ amount: '100.00' })} />);
    const item = screen.getByRole('listitem');
    // Color class for deposit (green) is on the li element itself
    expect(item.className).toMatch(/green/);
  });
});
