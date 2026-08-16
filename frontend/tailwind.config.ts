import type { Config } from 'tailwindcss';

/**
 * Momoski Tech design system tokens.
 *
 * Dark mode is retained as a class strategy but has no counterpart palette
 * yet — restyled components carry no `dark:` variants, so dark currently
 * renders identically to light. See issue #23.
 */
const config: Config = {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        sage: {
          DEFAULT: '#7B9E7B',
          light: '#A3BFA3',
          lighter: '#D4E4D4',
          dark: '#5A7A5A',
          deep: '#3D5C3D',
        },
        bark: {
          DEFAULT: '#5D4037',
          light: '#7B5B4F',
          lighter: '#A68B7B',
          dark: '#3E2723',
        },
        cream: {
          DEFAULT: '#FAF7F2',
          mid: '#F0EBE3',
        },
        copper: {
          DEFAULT: '#C17D4A',
          light: '#D9A373',
          dark: '#9B5F30',
        },
        'warm-gray': '#B5AEA4',
        stone: '#8A8279',
        charcoal: '#3A3530',
        espresso: '#2A2420',
        error: '#C1574A',
        'border-mid': '#E3DDD2',

        // Balance health — contrast on cream is at least 4.5:1 for all three.
        // Paired with a text label so color is never the sole signal.
        balance: {
          good: '#3D5C3D',
          warning: '#C17D4A',
          critical: '#C1574A',
        },
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
      letterSpacing: {
        label: '0.12em',
        'label-wide': '0.14em',
      },
    },
  },
  plugins: [],
};

export default config;
