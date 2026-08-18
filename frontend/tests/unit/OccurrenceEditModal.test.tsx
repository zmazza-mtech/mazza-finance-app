import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OccurrenceEditModal } from '@/components/calendar/OccurrenceEditModal';

const INSTANCE = {
  recurringId: '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
  originalDate: '2026-08-15',
  name: 'Internet Bill',
  amount: '-100.00',
};

function renderModal(overrides: Partial<React.ComponentProps<typeof OccurrenceEditModal>> = {}) {
  const props = {
    instance: INSTANCE,
    isOpen: true,
    onSave: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
  return { ...render(<OccurrenceEditModal {...props} />), props };
}

function amountField() {
  return screen.getByLabelText(/amount/i);
}

function dateField() {
  return screen.getByLabelText(/date/i);
}

describe('OccurrenceEditModal', () => {
  it('renders nothing when closed', () => {
    renderModal({ isOpen: false });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('names the series and the occurrence it is editing', () => {
    renderModal();

    expect(screen.getByRole('dialog')).toHaveAccessibleName(/Internet Bill/);
    expect(screen.getByText(/Saturday, August 15/)).toBeInTheDocument();
  });

  it('prefills the occurrence as it currently stands', () => {
    renderModal();

    // The sign lives with the series, not the field — a bill stays a debit.
    expect(amountField()).toHaveValue('100.00');
    expect(dateField()).toHaveValue('2026-08-15');
  });

  it('writes a changed amount back with the original sign', async () => {
    const user = userEvent.setup();
    const { props } = renderModal();

    await user.clear(amountField());
    await user.type(amountField(), '120.00');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(props.onSave).toHaveBeenCalledWith({
      overrideType: 'modified',
      overrideAmount: '-120.00',
    });
  });

  it('keeps a deposit positive', async () => {
    const user = userEvent.setup();
    const { props } = renderModal({
      instance: { ...INSTANCE, name: 'Paycheck', amount: '2400.00' },
    });

    await user.clear(amountField());
    await user.type(amountField(), '2500.00');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(props.onSave).toHaveBeenCalledWith({
      overrideType: 'modified',
      overrideAmount: '2500.00',
    });
  });

  it('writes a moved occurrence as a date override', async () => {
    const user = userEvent.setup();
    const { props } = renderModal();

    await user.clear(dateField());
    await user.type(dateField(), '2026-08-18');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(props.onSave).toHaveBeenCalledWith({
      overrideType: 'modified',
      overrideDate: '2026-08-18',
    });
  });

  it('sends both when both moved', async () => {
    const user = userEvent.setup();
    const { props } = renderModal();

    await user.clear(amountField());
    await user.type(amountField(), '120.00');
    await user.clear(dateField());
    await user.type(dateField(), '2026-08-18');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(props.onSave).toHaveBeenCalledWith({
      overrideType: 'modified',
      overrideAmount: '-120.00',
      overrideDate: '2026-08-18',
    });
  });

  it('will not save an override that changes nothing', async () => {
    renderModal();

    // An empty `modified` override would be written and then have no effect,
    // which reads to the user as the edit having been lost.
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('skips the occurrence as a deletion', async () => {
    const user = userEvent.setup();
    const { props } = renderModal();

    await user.click(screen.getByRole('button', { name: 'Skip this occurrence' }));

    expect(props.onSave).toHaveBeenCalledWith({ overrideType: 'deleted' });
  });

  it('rejects an amount of zero rather than writing it', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.clear(amountField());
    await user.type(amountField(), '0');

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    const { props } = renderModal();

    await user.keyboard('{Escape}');

    expect(props.onCancel).toHaveBeenCalled();
  });

  it('closes on Cancel', async () => {
    const user = userEvent.setup();
    const { props } = renderModal();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(props.onCancel).toHaveBeenCalled();
  });
});
