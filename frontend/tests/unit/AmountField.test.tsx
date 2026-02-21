import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AmountField } from '@/components/shared/AmountField';

describe('AmountField', () => {
  it('renders with $ prefix', () => {
    render(<AmountField value="" onChange={() => {}} />);
    expect(screen.getByText('$')).toBeInTheDocument();
  });

  it('renders input with the provided value', () => {
    render(<AmountField value="42.50" onChange={() => {}} />);
    expect(screen.getByRole('textbox')).toHaveValue('42.50');
  });

  it('calls onChange with the new value when user types', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<AmountField value="" onChange={onChange} />);
    await user.type(screen.getByRole('textbox'), '100');
    // onChange called for each character typed
    expect(onChange).toHaveBeenCalled();
  });

  it('shows error message when value is negative', () => {
    render(<AmountField value="-10" onChange={() => {}} />);
    expect(
      screen.getByText(
        'Enter a positive amount. Use the Debit/Deposit selector to indicate direction.',
      ),
    ).toBeInTheDocument();
  });

  it('does not show error message when value is positive', () => {
    render(<AmountField value="10" onChange={() => {}} />);
    expect(
      screen.queryByText(
        'Enter a positive amount. Use the Debit/Deposit selector to indicate direction.',
      ),
    ).not.toBeInTheDocument();
  });

  it('does not show error message when value is empty', () => {
    render(<AmountField value="" onChange={() => {}} />);
    expect(
      screen.queryByText(
        'Enter a positive amount. Use the Debit/Deposit selector to indicate direction.',
      ),
    ).not.toBeInTheDocument();
  });

  it('has proper aria-label', () => {
    render(<AmountField value="" onChange={() => {}} />);
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-label', 'Amount in dollars');
  });

  it('applies error aria-invalid when value is negative', () => {
    render(<AmountField value="-5" onChange={() => {}} />);
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true');
  });

  it('has no aria-invalid when value is valid', () => {
    render(<AmountField value="5" onChange={() => {}} />);
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'false');
  });
});
