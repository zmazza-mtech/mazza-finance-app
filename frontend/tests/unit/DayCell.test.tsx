import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DayCell } from '@/components/calendar/DayCell';
import type { ForecastTransaction } from '@/api/types';

function makeTransaction(overrides: Partial<ForecastTransaction> = {}): ForecastTransaction {
  return {
    id: Math.random().toString(),
    date: '2025-06-15',
    description: 'Test transaction',
    amount: '-50.00',
    source: 'actual',
    category: null,
    ...overrides,
  };
}

describe('DayCell', () => {
  const baseProps = {
    date: '2025-06-15',
    transactions: [] as ForecastTransaction[],
    runningBalance: '1500.00',
    isToday: false,
    isFocused: false,
    greenThreshold: '1000',
    criticalThreshold: '200',
    isSearchActive: false,
    hasSearchMatch: false,
    searchQuery: '',
    onFocus: vi.fn(),
    onActivate: vi.fn(),
    onAddTransaction: vi.fn(),
    onShowMore: vi.fn(),
  };

  it('renders the day of month', () => {
    render(<DayCell {...baseProps} />);
    expect(screen.getByText('15')).toBeInTheDocument();
  });

  it('marks aria-label with today when isToday is true', () => {
    render(<DayCell {...baseProps} isToday />);
    expect(screen.getByRole('gridcell', { name: /today/i })).toBeInTheDocument();
  });

  it('does not include "today" in aria-label when isToday is false', () => {
    render(<DayCell {...baseProps} />);
    expect(screen.queryByRole('gridcell', { name: /today/i })).not.toBeInTheDocument();
  });

  it('renders up to 2 transactions', () => {
    const transactions = [
      makeTransaction({ description: 'Tx 1' }),
      makeTransaction({ description: 'Tx 2' }),
    ];
    render(<DayCell {...baseProps} transactions={transactions} />);
    expect(screen.getByText('Tx 1')).toBeInTheDocument();
    expect(screen.getByText('Tx 2')).toBeInTheDocument();
  });

  it('shows "N more..." when more than 2 transactions', () => {
    const transactions = [
      makeTransaction({ description: 'Tx 1' }),
      makeTransaction({ description: 'Tx 2' }),
      makeTransaction({ description: 'Tx 3' }),
      makeTransaction({ description: 'Tx 4' }),
    ];
    render(<DayCell {...baseProps} transactions={transactions} />);
    expect(screen.getByText('2 more...')).toBeInTheDocument();
    expect(screen.getByText('Tx 1')).toBeInTheDocument();
    expect(screen.queryByText('Tx 3')).not.toBeInTheDocument();
    expect(screen.queryByText('Tx 4')).not.toBeInTheDocument();
  });

  it('does not show "more..." when 2 or fewer transactions', () => {
    const transactions = [
      makeTransaction({ description: 'Tx 1' }),
      makeTransaction({ description: 'Tx 2' }),
    ];
    render(<DayCell {...baseProps} transactions={transactions} />);
    expect(screen.queryByText(/more\.\.\./)).not.toBeInTheDocument();
  });

  it('shows "1 more..." when 3 transactions', () => {
    const transactions = [
      makeTransaction({ description: 'Tx 1' }),
      makeTransaction({ description: 'Tx 2' }),
      makeTransaction({ description: 'Tx 3' }),
    ];
    render(<DayCell {...baseProps} transactions={transactions} />);
    expect(screen.getByText('1 more...')).toBeInTheDocument();
  });

  it('renders running balance', () => {
    render(<DayCell {...baseProps} runningBalance="1500.00" />);
    expect(screen.getByText('$1,500.00')).toBeInTheDocument();
  });

  it('applies good health class when balance is above green threshold', () => {
    render(<DayCell {...baseProps} runningBalance="2000.00" />);
    const balanceEl = screen.getByText('$2,000.00');
    expect(balanceEl.className).toMatch(/green/);
  });

  it('applies critical health class when balance is below critical threshold', () => {
    render(<DayCell {...baseProps} runningBalance="100.00" />);
    const balanceEl = screen.getByText('$100.00');
    expect(balanceEl.className).toMatch(/red/);
  });

  it('calls onFocus when cell receives focus', async () => {
    const onFocus = vi.fn();
    render(<DayCell {...baseProps} onFocus={onFocus} />);
    const cell = screen.getByRole('gridcell');
    cell.focus();
    expect(onFocus).toHaveBeenCalled();
  });
});
