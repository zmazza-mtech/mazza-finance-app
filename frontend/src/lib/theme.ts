/**
 * Theme management utilities.
 * The flash-prevention script in index.html reads localStorage before React
 * hydrates. This module provides the runtime API for toggling theme.
 */

export type Theme = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'mazza-theme';

/**
 * Returns the currently active theme preference from localStorage.
 * Falls back to 'system' if nothing is stored.
 */
export function getStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored;
    }
  } catch (_) {
    // localStorage unavailable (e.g., SSR or private mode)
  }
  return 'system';
}

/**
 * Persists a theme preference and applies it to the document.
 */
export function applyTheme(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch (_) {}

  const html = document.documentElement;
  if (theme === 'dark') {
    html.classList.add('dark');
  } else if (theme === 'light') {
    html.classList.remove('dark');
  } else {
    // system: respect OS preference
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (prefersDark) {
      html.classList.add('dark');
    } else {
      html.classList.remove('dark');
    }
  }
}

/**
 * Returns true if the page is currently rendered in dark mode.
 */
export function isDarkMode(): boolean {
  return document.documentElement.classList.contains('dark');
}
