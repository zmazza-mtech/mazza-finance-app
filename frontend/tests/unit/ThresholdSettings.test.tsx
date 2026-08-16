import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThresholdSettings } from '@/components/settings/ThresholdSettings';

const baseProps = {
  greenThreshold: '1000',
  yellowThreshold: '200',
  onSave: vi.fn(),
};

describe('ThresholdSettings — fields', () => {
  it('labels each line by what it means', () => {
    render(<ThresholdSettings {...baseProps} />);
    expect(screen.getByLabelText('Good — at or above')).toHaveValue(1000);
    expect(screen.getByLabelText('Low — at or below')).toHaveValue(200);
  });

  it('explains what the thresholds drive', () => {
    render(<ThresholdSettings {...baseProps} />);
    expect(
      screen.getByText(
        'The calendar colors your running balance against these two lines. Good must sit above Low.',
      ),
    ).toBeInTheDocument();
  });

  it('notes when alerts fire', () => {
    render(<ThresholdSettings {...baseProps} />);
    expect(
      screen.getByText('Alerts fire when a forecast day crosses either line.'),
    ).toBeInTheDocument();
  });
});

describe('ThresholdSettings — validation', () => {
  it('saves both thresholds at two decimal places', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<ThresholdSettings {...baseProps} onSave={onSave} />);

    await user.click(screen.getByRole('button', { name: 'Save thresholds' }));
    expect(onSave).toHaveBeenCalledWith('1000.00', '200.00');
  });

  it('rejects a Good threshold at or below Low', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(
      <ThresholdSettings {...baseProps} greenThreshold="200" onSave={onSave} />,
    );

    await user.click(screen.getByRole('button', { name: 'Save thresholds' }));

    const error = screen.getByRole('alert');
    expect(error).toHaveTextContent(
      'The "Good" threshold must be greater than the "Low" threshold.',
    );
    expect(error).toHaveClass('text-error');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('rejects a threshold of zero', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(
      <ThresholdSettings {...baseProps} yellowThreshold="0" onSave={onSave} />,
    );

    await user.click(screen.getByRole('button', { name: 'Save thresholds' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Both thresholds must be greater than 0.',
    );
    expect(onSave).not.toHaveBeenCalled();
  });

  it('rejects a value that is not a number', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(
      <ThresholdSettings {...baseProps} greenThreshold="abc" onSave={onSave} />,
    );

    await user.click(screen.getByRole('button', { name: 'Save thresholds' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Enter valid numbers for both thresholds.',
    );
    expect(onSave).not.toHaveBeenCalled();
  });

  it('clears the error once the values are valid', async () => {
    const user = userEvent.setup();
    render(<ThresholdSettings {...baseProps} greenThreshold="100" />);

    await user.click(screen.getByRole('button', { name: 'Save thresholds' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Good — at or above'));
    await user.type(screen.getByLabelText('Good — at or above'), '900');
    await user.click(screen.getByRole('button', { name: 'Save thresholds' }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
