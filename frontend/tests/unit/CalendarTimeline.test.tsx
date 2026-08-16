import React from 'react';
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
    requestedDate: null as string | null,
    onRequestedDateHandled: vi.fn(),
    onJumpToDate: vi.fn(),
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

// ---------------------------------------------------------------------------
// requestedDate — the entry point the balance banner's "View" link drives
// ---------------------------------------------------------------------------

describe('CalendarTimeline requestedDate', () => {
  it('selects the requested day and opens the panel on it', () => {
    renderTimeline({ requestedDate: '2026-08-22' });

    expect(within(panel()).getByText('Saturday, August 22')).toBeInTheDocument();
    expect(cell('2026-08-22')).toHaveAttribute('aria-selected', 'true');
  });

  it('moves DOM focus to the requested cell, not just the ring', () => {
    renderTimeline({ requestedDate: '2026-08-22' });

    expect(document.activeElement).toBe(cell('2026-08-22'));
  });

  it('moves focus even when the requested day is already the focused one', () => {
    // The default selection for August is today, 2026-08-15. Asking for it
    // leaves `focusedId` unchanged, so an effect keyed on that value alone
    // never fires — and the jump is lost without a sound.
    renderTimeline({ requestedDate: TODAY });

    expect(document.activeElement).toBe(cell(TODAY));
  });

  it('tells the parent it handled the request, so the same date can be asked for twice', () => {
    const { props } = renderTimeline({ requestedDate: '2026-08-22' });

    expect(props.onRequestedDateHandled).toHaveBeenCalled();
  });

  it('ignores a date outside the visible month rather than selecting nothing', () => {
    renderTimeline({ requestedDate: '2026-09-04' });

    // The default selection for the month stands.
    expect(within(panel()).getByText('Saturday, August 15')).toBeInTheDocument();
  });

  it('leaves the default selection alone when no date is requested', () => {
    renderTimeline({ requestedDate: null });

    expect(within(panel()).getByText('Saturday, August 15')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Page Up / Page Down and Home / End (PRD §5.1, ARIA grid pattern)
// ---------------------------------------------------------------------------

/** July, August and September 2026, so a month jump has somewhere to land. */
const THREE_MONTHS: ForecastDay[] = (['2026-07', '2026-08', '2026-09'] as const).flatMap(
  (month) => {
    const length = month === '2026-07' ? 31 : month === '2026-08' ? 31 : 30;
    return Array.from({ length }, (_, i) => {
      const date = `${month}-${String(i + 1).padStart(2, '0')}`;
      return {
        date,
        transactions: [],
        dailyNet: '0.00',
        runningBalance: '3000.00',
      };
    });
  },
);

/**
 * Holds `currentMonth` the way CalendarPage does, so a month jump actually
 * re-renders the grid. Without a real parent, Page Up and Page Down would only
 * ever be asserted as callbacks and never as navigation.
 */
function MonthNavHarness() {
  const [currentMonth, setCurrentMonth] = React.useState('2026-08');
  const [requestedDate, setRequestedDate] = React.useState<string | null>(null);

  // The same two pieces of state CalendarPage holds, wired the same way.
  function jumpToDate(date: string) {
    setCurrentMonth(date.slice(0, 7));
    setRequestedDate(date);
  }

  return (
    <CalendarTimeline
      days={THREE_MONTHS}
      accountId="acct-1"
      todayDate={TODAY}
      currentMonth={currentMonth}
      greenThreshold="1000"
      criticalThreshold="200"
      searchQuery=""
      matchingDates={new Set<string>()}
      onSearchChange={vi.fn()}
      onPrevMonth={() => setCurrentMonth('2026-07')}
      onNextMonth={() => setCurrentMonth('2026-09')}
      onToday={vi.fn()}
      onAddTransaction={vi.fn()}
      requestedDate={requestedDate}
      onRequestedDateHandled={() => setRequestedDate(null)}
      onJumpToDate={jumpToDate}
    />
  );
}

describe('CalendarTimeline Home and End', () => {
  it('focuses the first day of the visible month on Home', async () => {
    const user = userEvent.setup();
    renderTimeline();

    cell('2026-08-15').focus();
    await user.keyboard('{Home}');

    expect(document.activeElement).toBe(cell('2026-08-01'));
  });

  it('focuses the last day of the visible month on End', async () => {
    const user = userEvent.setup();
    renderTimeline();

    cell('2026-08-15').focus();
    await user.keyboard('{End}');

    expect(document.activeElement).toBe(cell('2026-08-31'));
  });

  it('clamps at the first day rather than wrapping into the previous month', async () => {
    const user = userEvent.setup();
    renderTimeline();

    cell('2026-08-01').focus();
    await user.keyboard('{Home}');

    expect(document.activeElement).toBe(cell('2026-08-01'));
  });

  it('clamps at the last day rather than wrapping into the next month', async () => {
    const user = userEvent.setup();
    renderTimeline();

    cell('2026-08-31').focus();
    await user.keyboard('{End}');

    expect(document.activeElement).toBe(cell('2026-08-31'));
  });
});

describe('CalendarTimeline Page Up and Page Down', () => {
  it('moves to the next month and leaves focus on a cell in it', async () => {
    const user = userEvent.setup();
    render(<MonthNavHarness />);

    cell('2026-08-15').focus();
    await user.keyboard('{PageDown}');

    expect(screen.getByRole('heading', { name: /^September, day by day$/i })).toBeInTheDocument();
    expect(document.activeElement).toHaveAttribute('data-date', '2026-09-15');
  });

  it('moves to the previous month and leaves focus on a cell in it', async () => {
    const user = userEvent.setup();
    render(<MonthNavHarness />);

    cell('2026-08-15').focus();
    await user.keyboard('{PageUp}');

    expect(screen.getByRole('heading', { name: /^July, day by day$/i })).toBeInTheDocument();
    expect(document.activeElement).toHaveAttribute('data-date', '2026-07-15');
  });

  it('does not let the browser scroll the page instead', async () => {
    const user = userEvent.setup();
    renderTimeline();

    cell('2026-08-15').focus();

    // A default-prevented key is the whole reason the grid can own PageDown.
    const events: KeyboardEvent[] = [];
    document.addEventListener('keydown', (e) => events.push(e), { once: true });
    await user.keyboard('{PageDown}');

    expect(events[0]?.defaultPrevented).toBe(true);
  });
});

describe('CalendarTimeline month jump day clamping', () => {
  it('lands on the last day when the next month is shorter', async () => {
    const user = userEvent.setup();
    render(<MonthNavHarness />);

    // August has 31 days, September 30. Keeping the day number blindly would
    // ask for a 2026-09-31 that does not exist.
    cell('2026-08-31').focus();
    await user.keyboard('{End}');
    await user.keyboard('{PageDown}');

    expect(document.activeElement).toHaveAttribute('data-date', '2026-09-30');
  });

  it('repeats — a second Page Down moves another month rather than sticking', async () => {
    const user = userEvent.setup();
    render(<MonthNavHarness />);

    cell('2026-08-15').focus();
    await user.keyboard('{PageUp}');
    expect(document.activeElement).toHaveAttribute('data-date', '2026-07-15');

    await user.keyboard('{PageDown}');
    expect(document.activeElement).toHaveAttribute('data-date', '2026-08-15');
  });
});
