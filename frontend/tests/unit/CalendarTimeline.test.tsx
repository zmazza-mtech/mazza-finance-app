import { describe, it, expect, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CalendarTimeline } from '@/components/calendar/CalendarTimeline';
import type { ForecastDay } from '@/api/types';

const TODAY = '2026-08-15';

/** August 2026, every day present, one modest debit each. */
const DAYS: ForecastDay[] = Array.from({ length: 31 }, (_, i) => {
  const date = `2026-08-${String(i + 1).padStart(2, '0')}`;
  return {
    date,
    transactions: [
      {
        id: `tx-${i}`,
        date,
        description: `Purchase ${i + 1}`,
        amount: '-20.00',
        source: 'actual',
        category: 'Groceries',
      },
    ],
    dailyNet: '-20.00',
    runningBalance: String(3000 - i * 20),
  };
});

function renderTimeline(overrides: Partial<React.ComponentProps<typeof CalendarTimeline>> = {}) {
  const props = {
    days: DAYS,
    accountId: 'acct-1',
    todayDate: TODAY,
    currentMonth: '2026-08',
    greenThreshold: '1000',
    criticalThreshold: '200',
    searchQuery: '',
    matchingDates: new Set<string>(),
    onSearchChange: vi.fn(),
    onPrevMonth: vi.fn(),
    onNextMonth: vi.fn(),
    onToday: vi.fn(),
    onAddTransaction: vi.fn(),
    ...overrides,
  };
  return { ...render(<CalendarTimeline {...props} />), props };
}

function panel() {
  return screen.getByRole('complementary');
}

function cell(date: string) {
  return document.querySelector(`[data-date="${date}"]`) as HTMLElement;
}

/**
 * Focusing a cell is what a Tab into the grid does, and it sets the roving
 * state on the way in — so it is a state update and has to be wrapped.
 */
function focusCell(date: string) {
  act(() => cell(date).focus());
}

describe('CalendarTimeline — day selection', () => {
  it('opens on today', () => {
    renderTimeline();
    expect(within(panel()).getByText('Saturday, August 15')).toBeInTheDocument();
  });

  it('opens on the first of the month when today is elsewhere', () => {
    renderTimeline({ currentMonth: '2026-08', todayDate: '2026-09-04' });
    expect(within(panel()).getByText('Saturday, August 1')).toBeInTheDocument();
  });

  it('updates the panel when a day is clicked', async () => {
    renderTimeline();
    await userEvent.click(cell('2026-08-22'));
    expect(within(panel()).getByText('Saturday, August 22')).toBeInTheDocument();
  });

  it('shows the clicked day transactions in the panel', async () => {
    renderTimeline();
    await userEvent.click(cell('2026-08-09'));
    expect(within(panel()).getByText('Purchase 9')).toBeInTheDocument();
  });

  it('marks only the selected cell as selected', async () => {
    renderTimeline();
    await userEvent.click(cell('2026-08-22'));
    expect(cell('2026-08-22')).toHaveAttribute('aria-selected', 'true');
    expect(cell('2026-08-15')).toHaveAttribute('aria-selected', 'false');
  });
});

describe('CalendarTimeline — keyboard', () => {
  it('moves the focus ring with the arrow keys', async () => {
    renderTimeline();
    focusCell(TODAY);
    await userEvent.keyboard('{ArrowRight}');
    expect(cell('2026-08-16')).toHaveAttribute('tabindex', '0');
  });

  it('moves a week with the vertical arrows', async () => {
    renderTimeline();
    focusCell(TODAY);
    await userEvent.keyboard('{ArrowDown}');
    expect(cell('2026-08-22')).toHaveAttribute('tabindex', '0');
  });

  it('leaves the panel alone when focus moves, so scanning does not lose the detail', async () => {
    renderTimeline();
    focusCell(TODAY);
    await userEvent.keyboard('{ArrowRight}{ArrowRight}');
    // Focus has moved to the 17th; selection is still the 15th.
    expect(cell('2026-08-17')).toHaveAttribute('tabindex', '0');
    expect(within(panel()).getByText('Saturday, August 15')).toBeInTheDocument();
  });

  it('jumps to today with T', async () => {
    const onToday = vi.fn();
    renderTimeline({ onToday });
    focusCell('2026-08-01');
    await userEvent.keyboard('t');
    expect(onToday).toHaveBeenCalled();
    expect(within(panel()).getByText('Saturday, August 15')).toBeInTheDocument();
  });

  it('opens the add-transaction modal on Enter', async () => {
    renderTimeline();
    focusCell(TODAY);
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('closes the modal on Escape', async () => {
    renderTimeline();
    focusCell(TODAY);
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('moves DOM focus with the ring, not just the tabindex', async () => {
    renderTimeline();
    focusCell(TODAY);
    await userEvent.keyboard('{ArrowRight}');
    expect(cell('2026-08-16')).toHaveFocus();
  });

  it('carries focus to today when T crosses to another cell', async () => {
    renderTimeline();
    focusCell('2026-08-01');
    await userEvent.keyboard('t');
    expect(cell(TODAY)).toHaveFocus();
  });

  it('leaves focus alone until a key asks for it', () => {
    renderTimeline();
    // A fresh calendar must not pull focus off whatever the user was on.
    expect(document.body).toHaveFocus();
    expect(cell(TODAY)).toHaveAttribute('tabindex', '0');
  });

  it('returns focus to the day cell when the modal closes on Escape', async () => {
    renderTimeline();
    focusCell(TODAY);
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard('{Escape}');
    expect(cell(TODAY)).toHaveFocus();
  });

  it('returns focus to the panel button when the modal closes on Cancel', async () => {
    renderTimeline();
    const trigger = screen.getByRole('button', { name: 'Add transaction' });
    await userEvent.click(trigger);
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    expect(trigger).toHaveFocus();
  });

  it('focuses the search field with a slash', async () => {
    renderTimeline();
    focusCell(TODAY);
    await userEvent.keyboard('/');
    expect(screen.getByLabelText('Search transactions')).toHaveFocus();
  });

  it('clears the search on Escape from the search field', async () => {
    const onSearchChange = vi.fn();
    renderTimeline({ searchQuery: 'netflix', onSearchChange });
    const input = screen.getByLabelText('Search transactions');
    act(() => input.focus());
    await userEvent.keyboard('{Escape}');
    expect(onSearchChange).toHaveBeenCalledWith('');
  });
});

describe('CalendarTimeline — month navigation', () => {
  it('calls back on the previous control', async () => {
    const onPrevMonth = vi.fn();
    renderTimeline({ onPrevMonth });
    await userEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(onPrevMonth).toHaveBeenCalled();
  });

  it('calls back on the next control', async () => {
    const onNextMonth = vi.fn();
    renderTimeline({ onNextMonth });
    await userEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(onNextMonth).toHaveBeenCalled();
  });

  it('hides the Today control while viewing the current month', () => {
    renderTimeline();
    expect(screen.queryByRole('button', { name: 'Today' })).not.toBeInTheDocument();
  });

  it('offers the Today control while viewing another month', () => {
    renderTimeline({ todayDate: '2026-09-04' });
    expect(screen.getByRole('button', { name: 'Today' })).toBeInTheDocument();
  });

  it('titles the section with the viewed month', () => {
    renderTimeline();
    expect(screen.getByText('August, day by day')).toBeInTheDocument();
  });
});

describe('CalendarTimeline — add transaction', () => {
  it('opens the modal from the day panel for the selected date', async () => {
    renderTimeline();
    await userEvent.click(cell('2026-08-22'));
    await userEvent.click(screen.getByRole('button', { name: 'Add transaction' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
