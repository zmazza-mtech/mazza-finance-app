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
    ...overrides,
  };
}

describe('DayCell', () => {
  const baseProps = {
    date: '2025-06-15',
    transactions: [] as ForecastTransaction[],
    dailyNet: '0.00',
    runningBalance: '1500.00',
    isToday: false,
    isFocused: false,
    greenThreshold: '1000',
    criticalThreshold: '200',
    onFocus: vi.fn(),
    onActivate: vi.fn(),
    onAddTransaction: vi.fn(),
  };

  it('renders the day of month', () => {
    render(<DayCell {...baseProps} />);
    expect(screen.getByText('15')).toBeInTheDocument();
  });

  it('shows "Today" pill when isToday is true', () => {
    render(<DayCell {...baseProps} isToday />);
    expect(screen.getByText('Today')).toBeInTheDocument();
  });

  it('does not show "Today" pill when isToday is false', () => {
    render(<DayCell {...baseProps} />);
    expect(screen.queryByText('Today')).not.toBeInTheDocument();
  });

  it('renders up to 3 transactions', () => {
    const transactions = [
      makeTransaction({ description: 'Tx 1' }),
      makeTransaction({ description: 'Tx 2' }),
      makeTransaction({ description: 'Tx 3' }),
    ];
    render(<DayCell {...baseProps} transactions={transactions} />);
    expect(screen.getByText('Tx 1')).toBeInTheDocument();
    expect(screen.getByText('Tx 2')).toBeInTheDocument();
    expect(screen.getByText('Tx 3')).toBeInTheDocument();
  });

  it('shows "N more..." when more than 3 transactions', () => {
    const transactions = [
      makeTransaction({ description: 'Tx 1' }),
      makeTransaction({ description: 'Tx 2' }),
      makeTransaction({ description: 'Tx 3' }),
      makeTransaction({ description: 'Tx 4' }),
      makeTransaction({ description: 'Tx 5' }),
    ];
    render(<DayCell {...baseProps} transactions={transactions} />);
    expect(screen.getByText('2 more...')).toBeInTheDocument();
    // Only first 3 visible
    expect(screen.getByText('Tx 1')).toBeInTheDocument();
    expect(screen.queryByText('Tx 4')).not.toBeInTheDocument();
    expect(screen.queryByText('Tx 5')).not.toBeInTheDocument();
  });

  it('does not show "more..." when exactly 3 transactions', () => {
    const transactions = [
      makeTransaction({ description: 'Tx 1' }),
      makeTransaction({ description: 'Tx 2' }),
      makeTransaction({ description: 'Tx 3' }),
    ];
    render(<DayCell {...baseProps} transactions={transactions} />);
    expect(screen.queryByText(/more\.\.\./)).not.toBeInTheDocument();
  });

  it('shows "1 more..." when 4 transactions', () => {
    const transactions = [
      makeTransaction({ description: 'Tx 1' }),
      makeTransaction({ description: 'Tx 2' }),
      makeTransaction({ description: 'Tx 3' }),
      makeTransaction({ description: 'Tx 4' }),
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
    // The balance should have green coloring classes
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
