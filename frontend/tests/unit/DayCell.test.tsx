import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

const baseProps = {
  date: '2025-06-15',
  transactions: [] as ForecastTransaction[],
  runningBalance: '1500.00',
  dailyNet: '0',
  maxDailySpend: '100.00',
  todayDate: '2025-06-15',
  isToday: false,
  isFocused: false,
  isSelected: false,
  greenThreshold: '1000',
  criticalThreshold: '200',
  isSearchActive: false,
  hasSearchMatch: false,
  searchQuery: '',
  onFocus: vi.fn(),
  onSelect: vi.fn(),
  onActivate: vi.fn(),
};

describe('DayCell', () => {
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

  it('renders up to 3 transactions', () => {
    const transactions = [
      makeTransaction({ description: 'Tx 1' }),
      makeTransaction({ description: 'Tx 2' }),
      makeTransaction({ description: 'Tx 3' }),
    ];
    render(<DayCell {...baseProps} transactions={transactions} />);
    expect(screen.getByText('Tx 1')).toBeInTheDocument();
    expect(screen.getByText('Tx 3')).toBeInTheDocument();
  });

  it('shows the overflow count beyond three transactions', () => {
    const transactions = [1, 2, 3, 4, 5].map((n) =>
      makeTransaction({ description: `Tx ${n}` }),
    );
    render(<DayCell {...baseProps} transactions={transactions} />);
    expect(screen.getByText('+2 MORE')).toBeInTheDocument();
    expect(screen.getByText('Tx 3')).toBeInTheDocument();
    expect(screen.queryByText('Tx 4')).not.toBeInTheDocument();
  });

  it('shows no overflow count at exactly three transactions', () => {
    const transactions = [1, 2, 3].map((n) => makeTransaction({ description: `Tx ${n}` }));
    render(<DayCell {...baseProps} transactions={transactions} />);
    expect(screen.queryByText(/MORE/)).not.toBeInTheDocument();
  });

  it('shows a single overflow at four transactions', () => {
    const transactions = [1, 2, 3, 4].map((n) => makeTransaction({ description: `Tx ${n}` }));
    render(<DayCell {...baseProps} transactions={transactions} />);
    expect(screen.getByText('+1 MORE')).toBeInTheDocument();
  });

  it('renders running balance', () => {
    render(<DayCell {...baseProps} runningBalance="1500.00" />);
    expect(screen.getByText('$1,500.00')).toBeInTheDocument();
  });

  it('applies good health class when balance is above green threshold', () => {
    render(<DayCell {...baseProps} runningBalance="2000.00" />);
    expect(screen.getByText('$2,000.00').className).toMatch(/balance-good/);
  });

  it('applies critical health class when balance is below critical threshold', () => {
    render(<DayCell {...baseProps} runningBalance="100.00" />);
    expect(screen.getByText('$100.00').className).toMatch(/balance-critical/);
  });

  it('truncates the running balance rather than painting over the next cell', () => {
    render(<DayCell {...baseProps} runningBalance="1500.00" />);
    const balance = screen.getByText('$1,500.00');
    expect(balance.className).toMatch(/min-w-0/);
    expect(balance.className).toMatch(/text-ellipsis/);
    expect(balance.className).toMatch(/whitespace-nowrap/);
  });

  it('calls onFocus when the cell receives focus', () => {
    const onFocus = vi.fn();
    render(<DayCell {...baseProps} onFocus={onFocus} />);
    screen.getByRole('gridcell').focus();
    expect(onFocus).toHaveBeenCalledWith('2025-06-15');
  });

  it('selects the day when the cell is clicked', async () => {
    const onSelect = vi.fn();
    render(<DayCell {...baseProps} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole('gridcell'));
    expect(onSelect).toHaveBeenCalledWith('2025-06-15');
  });

  it('opens the add-transaction modal on Enter', async () => {
    const onActivate = vi.fn();
    render(<DayCell {...baseProps} isFocused onActivate={onActivate} />);
    screen.getByRole('gridcell').focus();
    await userEvent.keyboard('{Enter}');
    expect(onActivate).toHaveBeenCalledWith('2025-06-15');
  });

  it('opens the add-transaction modal on Space', async () => {
    const onActivate = vi.fn();
    render(<DayCell {...baseProps} isFocused onActivate={onActivate} />);
    screen.getByRole('gridcell').focus();
    await userEvent.keyboard(' ');
    expect(onActivate).toHaveBeenCalledWith('2025-06-15');
  });

  it('reports its selected state to assistive technology', () => {
    render(<DayCell {...baseProps} isSelected />);
    expect(screen.getByRole('gridcell')).toHaveAttribute('aria-selected', 'true');
  });

  it('joins the tab order only when focused', () => {
    const { rerender } = render(<DayCell {...baseProps} />);
    expect(screen.getByRole('gridcell')).toHaveAttribute('tabindex', '-1');
    rerender(<DayCell {...baseProps} isFocused />);
    expect(screen.getByRole('gridcell')).toHaveAttribute('tabindex', '0');
  });
});

describe('DayCell — day net', () => {
  it('shows a negative net signed with a true minus', () => {
    render(<DayCell {...baseProps} dailyNet="-130.37" />);
    expect(screen.getByText('NET −$130.37')).toBeInTheDocument();
  });

  it('shows a positive net signed with a plus', () => {
    render(<DayCell {...baseProps} dailyNet="2400.00" />);
    expect(screen.getByText('NET +$2,400.00')).toBeInTheDocument();
  });

  it('shows nothing for a zero net', () => {
    render(<DayCell {...baseProps} dailyNet="0.00" />);
    expect(screen.queryByText(/NET/)).not.toBeInTheDocument();
  });

  it('shows nothing for a day with no data', () => {
    render(<DayCell {...baseProps} dailyNet="" runningBalance="" />);
    expect(screen.queryByText(/NET/)).not.toBeInTheDocument();
  });
});

describe('DayCell — spend bar', () => {
  /** The bar is the only aria-hidden div carrying an inline height. */
  function findBar(container: HTMLElement): HTMLElement | null {
    return container.querySelector('div[aria-hidden="true"][style*="height"]');
  }

  it('draws no bar on a day with no spend', () => {
    const { container } = render(<DayCell {...baseProps} transactions={[]} />);
    expect(findBar(container)).toBeNull();
  });

  it('draws no bar on a day of income only', () => {
    const { container } = render(
      <DayCell {...baseProps} transactions={[makeTransaction({ amount: '2400.00' })]} />,
    );
    expect(findBar(container)).toBeNull();
  });

  it('draws a full-height bar on the heaviest day of the month', () => {
    const { container } = render(
      <DayCell
        {...baseProps}
        maxDailySpend="100.00"
        transactions={[makeTransaction({ amount: '-100.00' })]}
      />,
    );
    expect(findBar(container)?.style.height).toBe('24px');
  });

  it('scales a mid-weight day proportionally', () => {
    const { container } = render(
      <DayCell
        {...baseProps}
        maxDailySpend="100.00"
        transactions={[makeTransaction({ amount: '-50.00' })]}
      />,
    );
    expect(findBar(container)?.style.height).toBe('12px');
  });

  it('keeps a tiny spend visible at the three-pixel floor', () => {
    const { container } = render(
      <DayCell
        {...baseProps}
        maxDailySpend="1000.00"
        transactions={[makeTransaction({ amount: '-1.00' })]}
      />,
    );
    expect(findBar(container)?.style.height).toBe('3px');
  });

  it('colors a heavy day with the error token', () => {
    const { container } = render(
      <DayCell
        {...baseProps}
        maxDailySpend="100.00"
        transactions={[makeTransaction({ amount: '-60.00' })]}
      />,
    );
    expect(findBar(container)?.style.backgroundColor).toBe('rgb(193, 87, 74)');
  });

  it('colors a light day with the sage token', () => {
    const { container } = render(
      <DayCell
        {...baseProps}
        maxDailySpend="100.00"
        transactions={[makeTransaction({ amount: '-10.00' })]}
      />,
    );
    expect(findBar(container)?.style.backgroundColor).toBe('rgb(163, 191, 163)');
  });

  it('draws no bar when the month has no spend at all', () => {
    const { container } = render(
      <DayCell {...baseProps} maxDailySpend="0" transactions={[]} />,
    );
    expect(findBar(container)).toBeNull();
  });
});
