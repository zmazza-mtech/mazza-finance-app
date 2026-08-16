import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PillToggle } from '@/components/shared/PillToggle';

describe('PillToggle', () => {
  it('exposes itself as a switch carrying its state', () => {
    render(<PillToggle checked label="Include Joint Checking" onChange={vi.fn()} />);
    const toggle = screen.getByRole('switch', { name: 'Include Joint Checking' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  it('reports the off state', () => {
    render(
      <PillToggle checked={false} label="Include Joint Checking" onChange={vi.fn()} />,
    );
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  });

  it('flips on click', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<PillToggle checked={false} label="Include" onChange={onChange} />);

    await user.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('flips on Enter', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<PillToggle checked label="Include" onChange={onChange} />);

    await user.tab();
    expect(screen.getByRole('switch')).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('flips on Space', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<PillToggle checked={false} label="Include" onChange={onChange} />);

    await user.tab();
    await user.keyboard(' ');
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('clears the touch target minimum', () => {
    render(<PillToggle checked label="Include" onChange={vi.fn()} />);
    expect(screen.getByRole('switch')).toHaveClass('hit-target');
  });

  it('slides the knob across when on', () => {
    const { container } = render(
      <PillToggle checked label="Include" onChange={vi.fn()} />,
    );
    expect(container.querySelector('[data-knob]')).toHaveClass('translate-x-[18px]');
  });

  it('keeps the knob home when off', () => {
    const { container } = render(
      <PillToggle checked={false} label="Include" onChange={vi.fn()} />,
    );
    expect(container.querySelector('[data-knob]')).toHaveClass('translate-x-0');
  });

  it('is disabled when asked', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<PillToggle checked={false} label="Include" onChange={onChange} disabled />);

    await user.click(screen.getByRole('switch'));
    expect(onChange).not.toHaveBeenCalled();
  });
});
