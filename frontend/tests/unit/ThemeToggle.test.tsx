import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeToggle } from '@/components/settings/ThemeToggle';

/** Codepoint ranges covering the pictographs the design bans. */
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.classList.remove('dark');
});

describe('ThemeToggle — full', () => {
  it('states the active mode', () => {
    render(<ThemeToggle />);
    expect(screen.getByText('Light mode active')).toBeInTheDocument();
  });

  it('uses the pill switch rather than a checkbox', () => {
    render(<ThemeToggle />);
    expect(
      screen.getByRole('switch', { name: 'Switch to dark mode' }),
    ).toHaveAttribute('aria-checked', 'false');
  });

  it('switches mode on click', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByRole('switch'));

    expect(screen.getByText('Dark mode active')).toBeInTheDocument();
    expect(
      screen.getByRole('switch', { name: 'Switch to light mode' }),
    ).toHaveAttribute('aria-checked', 'true');
  });

  it('carries no emoji', () => {
    const { container } = render(<ThemeToggle />);
    expect(container.textContent ?? '').not.toMatch(EMOJI);
  });
});

describe('ThemeToggle — compact', () => {
  it('draws the moon as an inline SVG, not an emoji', () => {
    const { container } = render(<ThemeToggle compact />);
    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(container.textContent ?? '').not.toMatch(EMOJI);
  });

  it('keeps an accessible name on the button', () => {
    render(<ThemeToggle compact />);
    expect(
      screen.getByRole('button', { name: 'Switch to dark mode' }),
    ).toBeInTheDocument();
  });

  it('switches the icon with the mode', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle compact />);

    await user.click(screen.getByRole('button'));
    expect(
      screen.getByRole('button', { name: 'Switch to light mode' }),
    ).toBeInTheDocument();
  });
});
