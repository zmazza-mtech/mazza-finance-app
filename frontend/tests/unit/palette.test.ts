import { describe, it, expect } from 'vitest';
import { PALETTE, type TokenName } from '@/lib/palette';
import { CATEGORY_HUES, UNCATEGORIZED_HUES } from '@/lib/categoryPalette';

/**
 * Contrast budget for the palette.
 *
 * Three claims are made here, deliberately separate.
 *
 * AA_PAIRS clear WCAG AA in both modes. The derived dark palette clears AA on
 * every pair, without exception. And parts of the *light* palette, inherited
 * from the handoff, do not clear AA at all.
 *
 * That last one is why the split exists. Those pairs are enumerated in
 * LIGHT_SHORTFALLS with their measured ratios, so the gap is visible in the
 * suite rather than papered over, and so a further slip fails the build.
 * Raising them is a design change, tracked separately.
 */

type Mode = 'light' | 'dark';
const MODES: Mode[] = ['light', 'dark'];

/** WCAG AA: 4.5:1 for body text, 3:1 for a graphical indicator. */
const TEXT_MIN = 4.5;

function luminance(hex: string): number {
  const value = hex.replace('#', '');
  const channels = [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16) / 255);
  const linear = channels.map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

function token(name: TokenName, mode: Mode): string {
  return PALETTE[name][mode];
}

function ratio(fg: TokenName, bg: TokenName, mode: Mode): number {
  return contrast(token(fg, mode), token(bg, mode));
}

describe('palette — shape', () => {
  it('gives every token a counterpart in both modes', () => {
    for (const [name, pair] of Object.entries(PALETTE)) {
      expect(pair.light, `${name}.light`).toMatch(/^#[0-9A-F]{6}$/i);
      expect(pair.dark, `${name}.dark`).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });

  it('gives every category a counterpart in both modes', () => {
    for (const [name, pair] of Object.entries(CATEGORY_HUES)) {
      expect(pair.light, `${name}.light`).toMatch(/^#[0-9A-F]{6}$/i);
      expect(pair.dark, `${name}.dark`).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });

  it('inverts the page and the ink between modes', () => {
    expect(luminance(token('cream', 'light'))).toBeGreaterThan(0.8);
    expect(luminance(token('cream', 'dark'))).toBeLessThan(0.05);
    expect(luminance(token('charcoal', 'light'))).toBeLessThan(0.1);
    expect(luminance(token('charcoal', 'dark'))).toBeGreaterThan(0.7);
  });

  it('raises a card above the page in both modes', () => {
    for (const mode of MODES) {
      expect(
        luminance(token('surface', mode)),
        mode,
      ).toBeGreaterThan(luminance(token('cream', mode)));
    }
  });

  it('keeps the warm cast — no dark ground goes neutral', () => {
    // A neutral gray has equal channels. Every ground should stay warmer on
    // red than on blue.
    for (const name of ['cream', 'cream-mid', 'surface', 'panel'] as TokenName[]) {
      const hex = token(name, 'dark').replace('#', '');
      const r = parseInt(hex.slice(0, 2), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      expect(r, name).toBeGreaterThan(b);
    }
  });
});

// ---------------------------------------------------------------------------
// Absolute: these clear AA in both modes.
// ---------------------------------------------------------------------------

const AA_PAIRS: [TokenName, TokenName][] = [
  ['charcoal', 'surface'],
  ['charcoal', 'cream'],
  ['charcoal', 'cream-mid'],
  ['bark', 'surface'],
  ['bark-dark', 'surface'],
  ['bark-dark', 'cream'],
  ['bark-light', 'surface'],
  ['sage-dark', 'surface'],
  ['sage-deep', 'surface'],
  ['copper-dark', 'surface'],
  ['error-dark', 'surface'],
  ['balance-good', 'surface'],
  ['balance-good', 'cream'],
  // Pills: ink on fill.
  ['cream', 'bark'],
  ['cream', 'sage-dark'],
  ['sage-deep', 'sage-lighter'],
  // Alert tints.
  ['error-dark', 'danger-bg'],
  ['copper-dark', 'warning-bg'],
  // The projection panel, which stays dark in both modes.
  ['panel-ink', 'panel'],
  ['panel-ink-muted', 'panel'],
  ['panel-positive', 'panel'],
  ['panel-warning', 'panel'],
];

describe('palette — WCAG AA', () => {
  for (const [fg, bg] of AA_PAIRS) {
    for (const mode of MODES) {
      it(`${fg} on ${bg} clears ${TEXT_MIN}:1 in ${mode}`, () => {
        expect(ratio(fg, bg, mode)).toBeGreaterThanOrEqual(TEXT_MIN);
      });
    }
  }
});

// ---------------------------------------------------------------------------
// Known light-mode shortfalls, inherited from the handoff.
//
// Each entry is the measured light ratio, floored. Dark is held to full AA,
// which every one of them already clears. Raising the light values is a design
// change, not a dark-mode change.
// ---------------------------------------------------------------------------

const LIGHT_SHORTFALLS: [TokenName, TokenName, number][] = [
  ['stone', 'surface', 3.77],
  ['stone', 'cream', 3.53],
  ['warm-gray', 'surface', 2.19],
  ['warm-gray', 'cream', 2.05],
  ['warm-gray', 'cream-mid', 1.84],
  ['error', 'surface', 4.43],
  ['balance-warning', 'surface', 3.32],
  ['balance-warning', 'cream', 3.11],
  ['balance-critical', 'surface', 4.43],
  ['balance-critical', 'cream', 4.14],
  ['panel-ink-faint', 'panel', 4.04],
];

describe('palette — inherited light-mode shortfalls', () => {
  for (const [fg, bg, floor] of LIGHT_SHORTFALLS) {
    it(`${fg} on ${bg} holds at ${floor}:1 in light and clears AA in dark`, () => {
      expect(ratio(fg, bg, 'light'), 'light must not regress further').toBeGreaterThanOrEqual(
        floor,
      );
      expect(ratio(fg, bg, 'dark'), 'dark must clear AA').toBeGreaterThanOrEqual(TEXT_MIN);
    });
  }
});

// ---------------------------------------------------------------------------
// The claim that actually covers this change: dark clears AA everywhere, and
// beats light on every pair light gets wrong.
// ---------------------------------------------------------------------------

describe('palette — dark clears AA everywhere', () => {
  const EVERY_PAIR: [TokenName, TokenName][] = [
    ...AA_PAIRS,
    ...LIGHT_SHORTFALLS.map(([fg, bg]) => [fg, bg] as [TokenName, TokenName]),
    ['error', 'cream'],
    ['copper-dark', 'cream'],
    ['sage-deep', 'cream'],
    ['bark', 'cream'],
    ['bark-light', 'cream'],
  ];

  for (const [fg, bg] of EVERY_PAIR) {
    it(`${fg} on ${bg} clears ${TEXT_MIN}:1 in dark`, () => {
      expect(ratio(fg, bg, 'dark')).toBeGreaterThanOrEqual(TEXT_MIN);
    });
  }

  it('beats light on every pair light gets wrong', () => {
    for (const [fg, bg] of LIGHT_SHORTFALLS) {
      expect(ratio(fg, bg, 'dark'), `${fg} on ${bg}`).toBeGreaterThan(
        ratio(fg, bg, 'light'),
      );
    }
  });

  it('lifts every category hue that light leaves too pale', () => {
    for (const [name, pair] of Object.entries(CATEGORY_HUES)) {
      const light = contrast(pair.light, token('surface', 'light'));
      if (light >= 3) continue;
      expect(contrast(pair.dark, token('surface', 'dark')), name).toBeGreaterThan(light);
    }
  });
});

describe('palette — category hues', () => {
  // A category dot is decorative: the name always sits beside it, so the hue
  // is never the sole signal and the 3:1 indicator bar does not bind. What
  // does matter is that dark is not a wash — every hue must separate from the
  // card it sits on, and from the uncategorized gray.
  it('separates every category from the card in dark', () => {
    for (const [name, pair] of Object.entries(CATEGORY_HUES)) {
      expect(contrast(pair.dark, token('surface', 'dark')), name).toBeGreaterThanOrEqual(3);
    }
  });

  it('keeps the uncategorized hue quieter than any real category', () => {
    for (const mode of MODES) {
      const uncategorized = contrast(UNCATEGORIZED_HUES[mode], token('surface', mode));
      const quietest = Math.min(
        ...Object.values(CATEGORY_HUES).map((h) => contrast(h[mode], token('surface', mode))),
      );
      expect(uncategorized, mode).toBeLessThan(quietest);
    }
  });

  it('gives Subscriptions and Other the same hue, as designed', () => {
    expect(CATEGORY_HUES.Subscriptions).toEqual(CATEGORY_HUES.Other);
  });
});
