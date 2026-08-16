import { useState, useEffect } from 'react';
import { Icon } from '@/components/shared/Icon';
import { PillToggle } from '@/components/shared/PillToggle';
import { getStoredTheme, applyTheme, isDarkMode } from '@/lib/theme';
import type { Theme } from '@/lib/theme';

interface ThemeToggleProps {
  /** Compact variant for nav header */
  compact?: boolean;
}

/**
 * Theme toggle control.
 * Persists to localStorage and applies the class to <html> immediately.
 * The flash-prevention inline script in index.html ensures no FOUC on load.
 */
export function ThemeToggle({ compact = false }: ThemeToggleProps) {
  const [theme, setTheme] = useState<Theme>(() => getStoredTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Sync state with actual DOM on mount (flash-prevention script may have run)
  useEffect(() => {
    const stored = getStoredTheme();
    setTheme(stored);
  }, []);

  function toggle() {
    const next: Theme = isDarkMode() ? 'light' : 'dark';
    setTheme(next);
  }

  const isDark = theme === 'dark' || (theme === 'system' && isDarkMode());
  const label = isDark ? 'Switch to light mode' : 'Switch to dark mode';

  if (compact) {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-label={label}
        className="hit-target flex h-9 w-9 items-center justify-center rounded-full text-stone transition-colors duration-150 hover:bg-cream-mid hover:text-bark focus:outline-none focus-visible:ring-2 focus-visible:ring-sage"
      >
        <Icon name={isDark ? 'sun' : 'moon'} size={16} />
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-stone">{isDark ? 'Dark' : 'Light'} mode active</p>
      <PillToggle checked={isDark} onChange={toggle} label={label} />
    </div>
  );
}
