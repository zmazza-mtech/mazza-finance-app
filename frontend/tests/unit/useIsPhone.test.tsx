import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useIsPhone } from '@/hooks/useIsPhone';
import { PHONE_QUERY } from '@/lib/viewport';

/**
 * A controllable `matchMedia`.
 *
 * The global stub in `tests/setup.ts` answers "no" to everything and ignores
 * listeners, which is right for the theme layer but useless here — these tests
 * are about the answer changing. This replaces it for the duration of the file
 * and restores it afterwards.
 */
function installMatchMedia(initialMatches: boolean) {
  const listeners = new Set<(e: MediaQueryListEvent) => void>();
  let matches = initialMatches;
  const queries: string[] = [];

  const original = window.matchMedia;

  window.matchMedia = ((query: string) => {
    queries.push(query);
    return {
      get matches() {
        return matches;
      },
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: (_type: string, listener: (e: MediaQueryListEvent) => void) => {
        listeners.add(listener);
      },
      removeEventListener: (_type: string, listener: (e: MediaQueryListEvent) => void) => {
        listeners.delete(listener);
      },
      dispatchEvent: () => false,
    } as unknown as MediaQueryList;
  }) as typeof window.matchMedia;

  return {
    queries,
    listenerCount: () => listeners.size,
    set(next: boolean) {
      matches = next;
      act(() => {
        for (const listener of listeners) {
          listener({ matches: next } as MediaQueryListEvent);
        }
      });
    },
    restore() {
      window.matchMedia = original;
    },
  };
}

/** Records the value seen on every render, so the first one can be asserted. */
function Probe({ seen }: { seen: boolean[] }) {
  const isPhone = useIsPhone();
  seen.push(isPhone);
  return <span data-testid="value">{isPhone ? 'phone' : 'desktop'}</span>;
}

describe('PHONE_QUERY', () => {
  it('bounds at 639.98px so nothing falls between it and Tailwind’s sm:', () => {
    // Tailwind `sm:` starts at 640px. A `max-width: 639px` bound would leave
    // fractional widths in between matching neither.
    expect(PHONE_QUERY).toBe('(max-width: 639.98px)');
  });
});

describe('useIsPhone', () => {
  let mm: ReturnType<typeof installMatchMedia>;

  afterEach(() => {
    mm?.restore();
  });

  describe('on a phone-width viewport', () => {
    beforeEach(() => {
      mm = installMatchMedia(true);
    });

    it('is true on the very first render, with no post-mount correction', () => {
      const seen: boolean[] = [];
      render(<Probe seen={seen} />);

      // The point of useSyncExternalStore over useState + useEffect: there is
      // no first render that says "desktop" and then flips.
      expect(seen[0]).toBe(true);
      expect(seen).not.toContain(false);
      expect(screen.getByTestId('value')).toHaveTextContent('phone');
    });

    it('asks matchMedia for PHONE_QUERY', () => {
      render(<Probe seen={[]} />);
      expect(mm.queries).toContain(PHONE_QUERY);
    });
  });

  describe('on a desktop-width viewport', () => {
    beforeEach(() => {
      mm = installMatchMedia(false);
    });

    it('is false on the first render', () => {
      const seen: boolean[] = [];
      render(<Probe seen={seen} />);

      expect(seen[0]).toBe(false);
      expect(screen.getByTestId('value')).toHaveTextContent('desktop');
    });

    it('re-renders when the viewport crosses the breakpoint', () => {
      render(<Probe seen={[]} />);
      expect(screen.getByTestId('value')).toHaveTextContent('desktop');

      mm.set(true);
      expect(screen.getByTestId('value')).toHaveTextContent('phone');

      mm.set(false);
      expect(screen.getByTestId('value')).toHaveTextContent('desktop');
    });

    it('unsubscribes on unmount', () => {
      const { unmount } = render(<Probe seen={[]} />);
      expect(mm.listenerCount()).toBeGreaterThan(0);

      unmount();
      expect(mm.listenerCount()).toBe(0);
    });
  });
});
