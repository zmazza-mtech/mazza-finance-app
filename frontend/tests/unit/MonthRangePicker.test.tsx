import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MonthRangePicker } from '@/components/reports/MonthRangePicker';

const handlers = {
  onStartMonthChange: vi.fn(),
  onEndMonthChange: vi.fn(),
};

describe('MonthRangePicker', () => {
  it('shows the months it was given', () => {
    render(
      <MonthRangePicker startMonth="2026-03" endMonth="2026-08" {...handlers} />,
    );
    expect(screen.getByLabelText('From')).toHaveValue('2026-03');
    expect(screen.getByLabelText('To')).toHaveValue('2026-08');
  });

  it('picks months, not days', () => {
    render(
      <MonthRangePicker startMonth="2026-03" endMonth="2026-08" {...handlers} />,
    );
    expect(screen.getByLabelText('From')).toHaveAttribute('type', 'month');
  });

  it('reports a changed start month', async () => {
    const onStartMonthChange = vi.fn();
    render(
      <MonthRangePicker
        startMonth="2026-03"
        endMonth="2026-08"
        onStartMonthChange={onStartMonthChange}
        onEndMonthChange={vi.fn()}
      />,
    );

    // A month input commits a whole `YYYY-MM` at once. Typing it a character
    // at a time is not something the control can do.
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-05' } });

    expect(onStartMonthChange).toHaveBeenCalledWith('2026-05');
  });

  it('sets both ends of the range from a preset', async () => {
    const onStartMonthChange = vi.fn();
    const onEndMonthChange = vi.fn();
    render(
      <MonthRangePicker
        startMonth="2026-03"
        endMonth="2026-08"
        onStartMonthChange={onStartMonthChange}
        onEndMonthChange={onEndMonthChange}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Last 6 months' }));

    expect(onStartMonthChange).toHaveBeenCalled();
    expect(onEndMonthChange).toHaveBeenCalled();
  });

  it('counts a preset span inclusively, ending on the current month', async () => {
    const onStartMonthChange = vi.fn();
    const onEndMonthChange = vi.fn();
    render(
      <MonthRangePicker
        startMonth="2020-01"
        endMonth="2020-01"
        onStartMonthChange={onStartMonthChange}
        onEndMonthChange={onEndMonthChange}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Last 3 months' }));

    const start = onStartMonthChange.mock.calls[0]![0] as string;
    const end = onEndMonthChange.mock.calls[0]![0] as string;
    const span =
      Number(end.slice(0, 4)) * 12 +
      Number(end.slice(5)) -
      (Number(start.slice(0, 4)) * 12 + Number(start.slice(5)));

    expect(span).toBe(2);
  });

  it('offers presets no wider than the endpoint accepts', () => {
    render(
      <MonthRangePicker startMonth="2026-03" endMonth="2026-08" {...handlers} />,
    );
    expect(screen.getByRole('button', { name: 'Last 12 months' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Last 36 months/ })).not.toBeInTheDocument();
  });
});
