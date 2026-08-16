import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Icon, type IconName } from '@/components/shared/Icon';

const ALL_ICONS: IconName[] = [
  'chevron-left',
  'chevron-right',
  'chevron-down',
  'search',
  'close',
  'sort-asc',
  'sort-desc',
  'sun',
  'moon',
];

describe('Icon', () => {
  it('renders path geometry for every named icon', () => {
    for (const name of ALL_ICONS) {
      const { container, unmount } = render(<Icon name={name} />);
      const path = container.querySelector('path');
      expect(path, `${name} rendered no path`).not.toBeNull();
      expect(path?.getAttribute('d'), `${name} has an empty path`).toBeTruthy();
      unmount();
    }
  });

  it('is hidden from assistive technology when it has no title', () => {
    const { container } = render(<Icon name="search" />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('role')).toBeNull();
  });

  it('exposes an accessible name when given a title', () => {
    const { getByRole } = render(<Icon name="search" title="Search" />);
    const svg = getByRole('img', { name: 'Search' });
    expect(svg).toBeInTheDocument();
    expect(svg.getAttribute('aria-hidden')).toBeNull();
  });

  it('draws at 2px stroke with round caps, per the design system', () => {
    const { container } = render(<Icon name="close" />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('stroke-width')).toBe('2');
    expect(svg?.getAttribute('stroke-linecap')).toBe('round');
    expect(svg?.getAttribute('stroke-linejoin')).toBe('round');
    expect(svg?.getAttribute('fill')).toBe('none');
  });

  it('defaults to 16px and honours an explicit size', () => {
    const { container: def } = render(<Icon name="moon" />);
    expect(def.querySelector('svg')?.getAttribute('width')).toBe('16');

    const { container: sized } = render(<Icon name="moon" size={24} />);
    expect(sized.querySelector('svg')?.getAttribute('width')).toBe('24');
  });

  it('is not focusable, so it never lands in the tab order', () => {
    const { container } = render(<Icon name="chevron-left" />);
    expect(container.querySelector('svg')?.getAttribute('focusable')).toBe('false');
  });
});
