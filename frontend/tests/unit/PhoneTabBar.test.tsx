import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PhoneTabBar } from '@/components/layout/PhoneTabBar';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <PhoneTabBar />
    </MemoryRouter>,
  );
}

describe('PhoneTabBar', () => {
  it('is the main navigation landmark', () => {
    renderAt('/');
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
  });

  it('offers the five screens', () => {
    renderAt('/');
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    const links = within(nav).getAllByRole('link');

    expect(links.map((l) => l.textContent)).toEqual([
      'Calendar',
      'Activity',
      'Recurring',
      'Reports',
      'Settings',
    ]);
  });

  it('labels the transactions route "Activity" but still routes to /transactions', () => {
    renderAt('/');
    // The handoff's tab bar says Activity; the route and the desktop nav both
    // still say Transactions. The label is presentation, not a rename.
    expect(screen.getByRole('link', { name: 'Activity' })).toHaveAttribute(
      'href',
      '/transactions',
    );
    expect(screen.queryByRole('link', { name: 'Transactions' })).not.toBeInTheDocument();
  });

  it.each([
    ['/', 'Calendar'],
    ['/transactions', 'Activity'],
    ['/recurring', 'Recurring'],
    ['/reports', 'Reports'],
    ['/settings', 'Settings'],
  ])('marks the tab for %s as the current page', (path, label) => {
    renderAt(path);

    // aria-current, not colour alone: the active tab has to be
    // programmatically determinable.
    expect(screen.getByRole('link', { name: label })).toHaveAttribute('aria-current', 'page');

    const others = screen
      .getAllByRole('link')
      .filter((l) => l.textContent !== label);
    for (const other of others) {
      expect(other).not.toHaveAttribute('aria-current');
    }
  });

  it('does not mark Calendar current on a nested route', () => {
    // Calendar is the index route; without `end` it would match every path.
    renderAt('/reports');
    expect(screen.getByRole('link', { name: 'Calendar' })).not.toHaveAttribute('aria-current');
  });

  it('hides its icons from assistive technology, leaving the text label', () => {
    const { container } = renderAt('/');
    const svgs = container.querySelectorAll('svg');

    expect(svgs).toHaveLength(5);
    for (const svg of svgs) {
      expect(svg).toHaveAttribute('aria-hidden', 'true');
    }
  });
});
