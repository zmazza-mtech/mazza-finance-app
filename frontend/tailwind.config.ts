import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Balance health tokens — verified 4.5:1 contrast
        balance: {
          good: {
            light: '#15803d',   // green-700
            dark: '#4ade80',    // green-400
          },
          warning: {
            light: '#b45309',   // amber-700
            dark: '#fcd34d',    // amber-300
          },
          critical: {
            light: '#b91c1c',   // red-700
            dark: '#f87171',    // red-400
          },
        },
      },
    },
  },
  plugins: [],
};

export default config;
