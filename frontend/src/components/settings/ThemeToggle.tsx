import { useState, useEffect } from 'react';
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
  const icon = isDark ? '☀️' : '🌙';

  if (compact) {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-label={label}
        className="flex items-center justify-center w-8 h-8 rounded-md text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <span aria-hidden="true">{icon}</span>
        <span className="sr-only">{label}</span>
      </button>
    );
  }

  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
          Appearance
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {isDark ? 'Dark' : 'Light'} mode active
        </p>
      </div>
      <button
        type="button"
        onClick={toggle}
        aria-label={label}
        aria-pressed={isDark}
        className="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 bg-gray-200 dark:bg-blue-600"
      >
        <span
          aria-hidden="true"
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${
            isDark ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}
