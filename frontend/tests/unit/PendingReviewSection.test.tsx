import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PendingReviewSection } from '@/components/recurring/PendingReviewSection';
import type { Recurring } from '@/api/types';

function series(overrides: Partial<Recurring> = {}): Recurring {
  return {
    id: 'rec-1',
    accountId: 'acct-1',
    name: 'Netflix',
    amount: '-42.00',
    frequency: 'monthly',
    nextDate: '2026-09-01',
    endDate: null,
    source: 'auto_detected',
    status: 'pending_review',
    category: 'Subscriptions',
    ...overrides,
  };
}

const handlers = {
  onConfirm: vi.fn(),
  onDismiss: vi.fn(),
  onEdit: vi.fn(),
};

describe('PendingReviewSection', () => {
  it('renders nothing when nothing is pending', () => {
    const { container } = render(
      <PendingReviewSection items={[]} {...handlers} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the pending count as a badge', () => {
    render(
      <PendingReviewSection
        items={[series(), series({ id: 'rec-2', name: 'Spotify' })]}
        {...handlers}
      />,
    );
    expect(screen.getByLabelText('2 items pending review')).toHaveTextContent('2');
  });

  it('shows the signed amount and frequency for each series', () => {
    render(<PendingReviewSection items={[series()]} {...handlers} />);
    expect(screen.getByText('Netflix')).toBeInTheDocument();
    expect(screen.getByText('−$42.00 · Monthly')).toBeInTheDocument();
  });

  it('signs an inflow as a credit', () => {
    render(
      <PendingReviewSection
        items={[series({ amount: '2400.00', frequency: 'biweekly' })]}
        {...handlers}
      />,
    );
    expect(screen.getByText('+$2,400.00 · Biweekly')).toBeInTheDocument();
  });

  it('confirms a series directly, with no dialog', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(
      <PendingReviewSection items={[series()]} {...handlers} onConfirm={onConfirm} />,
    );

    await user.click(screen.getByRole('button', { name: 'Confirm Netflix' }));
    expect(onConfirm).toHaveBeenCalledWith('rec-1');
  });

  it('hands the whole series to the edit handler', async () => {
    const onEdit = vi.fn();
    const user = userEvent.setup();
    const item = series();
    render(<PendingReviewSection items={[item]} {...handlers} onEdit={onEdit} />);

    await user.click(screen.getByRole('button', { name: 'Edit Netflix' }));
    expect(onEdit).toHaveBeenCalledWith(item);
  });

  it('holds a dismissal behind a confirm dialog', async () => {
    const onDismiss = vi.fn();
    const user = userEvent.setup();
    render(
      <PendingReviewSection items={[series()]} {...handlers} onDismiss={onDismiss} />,
    );

    await user.click(screen.getByRole('button', { name: 'Dismiss Netflix' }));
    expect(onDismiss).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toHaveTextContent(
      'Dismiss recurring transaction?',
    );

    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalledWith('rec-1');
  });

  it('leaves the series alone when the dismissal is cancelled', async () => {
    const onDismiss = vi.fn();
    const user = userEvent.setup();
    render(
      <PendingReviewSection items={[series()]} {...handlers} onDismiss={onDismiss} />,
    );

    await user.click(screen.getByRole('button', { name: 'Dismiss Netflix' }));
    await user.click(screen.getByRole('button', { name: 'Keep' }));

    expect(onDismiss).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
