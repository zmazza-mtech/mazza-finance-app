import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecurringList } from '@/components/recurring/RecurringList';
import type { Recurring } from '@/api/types';

function series(overrides: Partial<Recurring> = {}): Recurring {
  return {
    id: 'rec-1',
    accountId: 'acct-1',
    name: 'Mortgage',
    amount: '-1850.00',
    frequency: 'monthly',
    nextDate: '2026-09-01',
    endDate: null,
    source: 'manual',
    status: 'active',
    category: 'Housing',
    ...overrides,
  };
}

const handlers = {
  onUpdate: vi.fn(),
  onDelete: vi.fn(),
};

/**
 * The desktop table and the sub-768px card list are both in the DOM under
 * jsdom, since the breakpoint is CSS-only. Queries scope to the table row so
 * they match one control rather than two.
 */
function tableRow(name: string) {
  return screen.getByRole('row', { name: new RegExp(name) });
}

describe('RecurringList — empty', () => {
  it('invites the first series when there are none', () => {
    render(<RecurringList items={[]} {...handlers} />);
    expect(screen.getByText('No recurring transactions yet.')).toBeInTheDocument();
  });

  it('ignores pending series, which the review section owns', () => {
    render(
      <RecurringList items={[series({ status: 'pending_review' })]} {...handlers} />,
    );
    expect(screen.getByText('No recurring transactions yet.')).toBeInTheDocument();
  });
});

describe('RecurringList — rows', () => {
  it('renders the series name, signed amount, frequency and next date', () => {
    render(<RecurringList items={[series()]} {...handlers} />);
    const row = screen.getByRole('row', { name: /Mortgage/ });
    expect(within(row).getByText('−$1,850.00')).toBeInTheDocument();
    expect(within(row).getByText('monthly')).toBeInTheDocument();
    expect(within(row).getByText('2026-09-01')).toBeInTheDocument();
  });

  it('signs an inflow as a credit', () => {
    render(
      <RecurringList
        items={[series({ name: 'Paycheck', amount: '2400.00', category: 'Income' })]}
        {...handlers}
      />,
    );
    const row = screen.getByRole('row', { name: /Paycheck/ });
    expect(within(row).getByText('+$2,400.00')).toBeInTheDocument();
  });

  it('labels an active series with a sage status pill', () => {
    render(<RecurringList items={[series()]} {...handlers} />);
    const row = screen.getByRole('row', { name: /Mortgage/ });
    const pill = within(row).getByText('Active');
    expect(pill).toHaveClass('bg-sage-lighter');
    expect(pill).toHaveClass('text-sage-deep');
  });

  it('labels a disabled series with a muted status pill', () => {
    render(<RecurringList items={[series({ status: 'disabled' })]} {...handlers} />);
    const row = screen.getByRole('row', { name: /Mortgage/ });
    const pill = within(row).getByText('Disabled');
    expect(pill).toHaveClass('bg-cream-mid');
    expect(pill).toHaveClass('text-stone');
  });
});

describe('RecurringList — actions', () => {
  it('flips an active series to disabled', async () => {
    const onUpdate = vi.fn();
    const user = userEvent.setup();
    render(<RecurringList items={[series()]} {...handlers} onUpdate={onUpdate} />);

    await user.click(
      within(tableRow('Mortgage')).getByRole('button', { name: 'Disable Mortgage' }),
    );
    expect(onUpdate).toHaveBeenCalledWith('rec-1', { status: 'disabled' });
  });

  it('flips a disabled series back to active', async () => {
    const onUpdate = vi.fn();
    const user = userEvent.setup();
    render(
      <RecurringList
        items={[series({ status: 'disabled' })]}
        {...handlers}
        onUpdate={onUpdate}
      />,
    );

    await user.click(
      within(tableRow('Mortgage')).getByRole('button', { name: 'Enable Mortgage' }),
    );
    expect(onUpdate).toHaveBeenCalledWith('rec-1', { status: 'active' });
  });

  it('holds a delete behind a confirm dialog', async () => {
    const onDelete = vi.fn();
    const user = userEvent.setup();
    render(<RecurringList items={[series()]} {...handlers} onDelete={onDelete} />);

    await user.click(
      within(tableRow('Mortgage')).getByRole('button', { name: 'Delete Mortgage' }),
    );
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toHaveTextContent(
      'Delete recurring transaction?',
    );

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalledWith('rec-1');
  });

  it('leaves the series alone when the delete is cancelled', async () => {
    const onDelete = vi.fn();
    const user = userEvent.setup();
    render(<RecurringList items={[series()]} {...handlers} onDelete={onDelete} />);

    await user.click(
      within(tableRow('Mortgage')).getByRole('button', { name: 'Delete Mortgage' }),
    );
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens the edit modal seeded with the series', async () => {
    const user = userEvent.setup();
    render(<RecurringList items={[series()]} {...handlers} />);

    await user.click(
      within(tableRow('Mortgage')).getByRole('button', { name: 'Edit Mortgage' }),
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Edit Recurring Series');
    expect(within(dialog).getByLabelText('Name')).toHaveValue('Mortgage');
  });
});
