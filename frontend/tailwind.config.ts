import type { Config } from 'tailwindcss';
import plugin from 'tailwindcss/plugin';
import { PALETTE } from './src/lib/palette';
import {
  CATEGORY_HUES,
  UNCATEGORIZED_HUES,
  UNCATEGORIZED_VAR,
  categoryVarName,
} from './src/lib/categoryPalette';

/**
 * Momoski Tech design system tokens.
 *
 * Every color resolves through a CSS custom property rather than a literal, so
 * light and dark are one data change in `src/lib/palette.ts` instead of a
 * `dark:` variant on every element. `.dark` on <html> reassigns the variables
 * and the whole tree follows.
 *
 * Variables hold space-separated RGB channels, not hex, so Tailwind's alpha
 * shorthand still works: `bg-scrim/50` compiles to `rgb(var(--c-scrim) / 0.5)`.
 */

/** `#5D4037` -> `93 64 55`. */
function channels(hex: string): string {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
}

type Vars = Record<string, string>;

function buildVars(mode: 'light' | 'dark'): Vars {
  const vars: Vars = {};

  for (const [name, pair] of Object.entries(PALETTE)) {
    vars[`--c-${name}`] = channels(pair[mode]);
  }

  // Category hues are consumed as inline `fill`/`background-color`, so they
  // stay whole colors rather than channels.
  for (const [category, hues] of Object.entries(CATEGORY_HUES)) {
    vars[categoryVarName(category)] = hues[mode];
  }
  vars[UNCATEGORIZED_VAR] = UNCATEGORIZED_HUES[mode];

  return vars;
}

/** `cream` -> `rgb(var(--c-cream) / <alpha-value>)` for every token. */
const colors = Object.fromEntries(
  Object.keys(PALETTE).map((name) => [name, `rgb(var(--c-${name}) / <alpha-value>)`]),
);

const config: Config = {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors,
      // Tailwind's ring offset defaults to white, which reads as a halo on a
      // dark card. Every offset ring in the app sits on a card.
      ringOffsetColor: {
        DEFAULT: 'rgb(var(--c-surface))',
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', 'Georgia', 'serif'],
        sans: ['"Instrument Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      // Major third scale
      fontSize: {
        xs: '0.75rem',
        sm: '0.875rem',
        base: '1rem',
        lg: '1.125rem',
        xl: '1.25rem',
        '2xl': '1.563rem',
        '3xl': '1.953rem',
        '4xl': '2.441rem',
      },
      borderRadius: {
        sm: '4px',
        md: '8px',
        lg: '16px',
        xl: '24px',
      },
      // Warm-tinted, never black
      boxShadow: {
        sm: '0 1px 2px rgba(93,64,55,.06)',
        md: '0 4px 12px rgba(93,64,55,.08)',
        lg: '0 8px 32px rgba(93,64,55,.12)',
        xl: '0 16px 48px rgba(93,64,55,.16)',
      },
      transitionTimingFunction: {
        'ease-out': 'cubic-bezier(.16,1,.3,1)',
        'ease-spring': 'cubic-bezier(.34,1.56,.64,1)',
      },
      transitionDuration: {
        150: '150ms',
        300: '300ms',
        500: '500ms',
      },
      maxWidth: {
        shell: '1200px',
      },
      // iOS reports the notch and home-indicator insets through env(). Every
      // other platform resolves them to the 0px fallback, so these are safe to
      // apply unconditionally. Compose them with the design's own padding via
      // calc() at the call site — the inset is added on top of that padding,
      // never a replacement for it.
      spacing: {
        'safe-top': 'env(safe-area-inset-top, 0px)',
        'safe-bottom': 'env(safe-area-inset-bottom, 0px)',
      },
      letterSpacing: {
        label: '0.12em',
        'label-wide': '0.14em',
      },
    },
  },
  plugins: [
    plugin(({ addBase }) => {
      addBase({
        ':root': buildVars('light'),
        '.dark': buildVars('dark'),
      });
    }),
  ],
};

export default config;
