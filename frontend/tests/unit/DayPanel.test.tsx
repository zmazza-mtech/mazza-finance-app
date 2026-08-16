import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DayPanel } from '@/components/calendar/DayPanel';
import type { ForecastDay, ForecastTransaction } from '@/api/types';

function tx(overrides: Partial<ForecastTransaction> = {}): ForecastTransaction {
  return {
    id: Math.random().toString(),
    date: '2026-08-15',
    description: 'Whole Foods',
    amount: '-84.21',
    source: 'actual',
    category: 'Groceries',
    ...overrides,
  };
}

function day(overrides: Partial<ForecastDay> = {}): ForecastDay {
  return {
    date: '2026-08-15',
    transactions: [tx()],
    dailyNet: '-84.21',
    runningBalance: '2450.00',
    ...overrides,
  };
}

const baseProps = {
  date: '2026-08-15',
  day: day(),
  todayDate: '2026-08-15',
  greenThreshold: '1000',
  criticalThreshold: '200',
  onAddTransaction: vi.fn(),
  // These drive the phone sheet only. jsdom's matchMedia answers "no" to the
  // phone query, so every test in this file renders the desktop `<aside>`,
  // which ignores both. The phone presentation is covered by the mobile
  // Playwright project, where a real viewport decides.
  isOpen: true,
  onClose: vi.fn(),
};

describe('DayPanel — heading', () => {
  it('renders the full date', () => {
    render(<DayPanel {...baseProps} />);
    expect(screen.getByText('Saturday, August 15')).toBeInTheDocument();
  });

  it('labels the current day as Today', () => {
    render(<DayPanel {...baseProps} />);
    expect(screen.getByText('Today')).toBeInTheDocument();
  });

  it('labels a later day as a forecast day', () => {
    render(<DayPanel {...baseProps} date="2026-08-20" todayDate="2026-08-15" />);
    expect(screen.getByText('Forecast day')).toBeInTheDocument();
  });

  it('labels an earlier day as a settled day', () => {
    render(<DayPanel {...baseProps} date="2026-08-10" todayDate="2026-08-15" />);
    expect(screen.getByText('Settled day')).toBeInTheDocument();
  });
});

describe('DayPanel — stat tiles', () => {
  it('shows a negative day net signed with a true minus', () => {
    render(<DayPanel {...baseProps} />);
    // Scoped to the tile — the sole transaction carries the same amount.
    const tile = screen.getByText('Day net').parentElement;
    expect(tile?.textContent).toContain('−$84.21');
  });

  it('shows a positive day net signed with a plus', () => {
    render(<DayPanel {...baseProps} day={day({ dailyNet: '2400.00' })} />);
    expect(screen.getByText('+$2,400.00')).toBeInTheDocument();
  });

  it('shows an em dash for a zero day net', () => {
    render(<DayPanel {...baseProps} day={day({ dailyNet: '0.00', transactions: [] })} />);
    const net = screen.getByText('Day net').parentElement;
    expect(net?.textContent).toContain('—');
  });

  it('shows the balance after the day', () => {
    render(<DayPanel {...baseProps} />);
    expect(screen.getByText('$2,450.00')).toBeInTheDocument();
  });

  it('colors the balance by health', () => {
    render(<DayPanel {...baseProps} day={day({ runningBalance: '150.00' })} />);
    expect(screen.getByText('$150.00').className).toMatch(/balance-critical/);
  });
});

describe('DayPanel — transaction list', () => {
  it('lists every transaction with no overflow cut', () => {
    const many = [1, 2, 3, 4, 5, 6].map((n) => tx({ description: `Tx ${n}` }));
    render(<DayPanel {...baseProps} day={day({ transactions: many })} />);
    for (const n of [1, 2, 3, 4, 5, 6]) {
      expect(screen.getByText(`Tx ${n}`)).toBeInTheDocument();
    }
  });

  it('shows the category name beside the dot', () => {
    render(<DayPanel {...baseProps} />);
    expect(screen.getByText('Groceries')).toBeInTheDocument();
  });

  it('labels an uncategorized transaction rather than leaving it blank', () => {
    render(<DayPanel {...baseProps} day={day({ transactions: [tx({ category: null })] })} />);
    expect(screen.getByText('Uncategorized')).toBeInTheDocument();
  });

  it('shows the source badge', () => {
    render(<DayPanel {...baseProps} day={day({ transactions: [tx({ source: 'forecast' })] })} />);
    expect(screen.getByText('Forecast')).toBeInTheDocument();
  });

  it('renders the empty state when nothing is scheduled', () => {
    render(<DayPanel {...baseProps} day={day({ transactions: [], dailyNet: '0' })} />);
    expect(screen.getByText('Nothing scheduled. Balance carries forward.')).toBeInTheDocument();
  });

  it('renders the empty state when the day has no forecast entry at all', () => {
    render(<DayPanel {...baseProps} day={null} />);
    expect(screen.getByText('Nothing scheduled. Balance carries forward.')).toBeInTheDocument();
  });
});

describe('DayPanel — add transaction', () => {
  it('calls back with the panel date', async () => {
    const onAddTransaction = vi.fn();
    render(<DayPanel {...baseProps} onAddTransaction={onAddTransaction} />);
    await userEvent.click(screen.getByRole('button', { name: 'Add transaction' }));
    expect(onAddTransaction).toHaveBeenCalledWith('2026-08-15');
  });

  it('uses the selected date, not today', async () => {
    const onAddTransaction = vi.fn();
    render(
      <DayPanel
        {...baseProps}
        date="2026-08-22"
        todayDate="2026-08-15"
        onAddTransaction={onAddTransaction}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Add transaction' }));
    expect(onAddTransaction).toHaveBeenCalledWith('2026-08-22');
  });
});
