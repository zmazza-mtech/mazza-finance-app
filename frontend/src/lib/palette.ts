/**
 * The Momoski palette, light and dark.
 *
 * Every token is a role, not a literal hue: `cream` is the page, `charcoal` is
 * the ink, `bark` is the strongest ink and the fill of an inverted pill. In
 * dark mode the metaphor flips — the page is near-black and the ink is near-
 * cream — so the pairs below are counterparts by role, not by hue.
 *
 * The design handoff specifies no dark palette. These counterparts are derived
 * from it, holding the warm cast throughout: grounds move toward espresso, ink
 * toward cream, and no value is allowed to go neutral gray.
 *
 * This file has no imports on purpose. It is read by `tailwind.config.ts`,
 * which turns each pair into a CSS custom property, and by the contrast tests.
 * Components never read it directly — they use the Tailwind class, and the
 * class resolves through the variable.
 */

export interface TokenPair {
  light: string;
  dark: string;
}

export const PALETTE = {
  // --- Grounds and surfaces -------------------------------------------------
  /** The page. Also every sunken fill: inputs, table headers, chart tracks. */
  cream: { light: '#FAF7F2', dark: '#1E1A17' },
  /** Rules, and the stronger sunken fill. */
  'cream-mid': { light: '#F0EBE3', dark: '#332C27' },
  /** The heavier rule, for a card that needs more edge than a row does. */
  'border-mid': { light: '#E3DDD2', dark: '#40372F' },
  /** Cards. Raised above the page in both modes. */
  surface: { light: '#FFFFFF', dark: '#292320' },
  /** A surface that recedes — the month grid's filler cells. */
  'surface-muted': { light: '#FDFCFA', dark: '#231E1B' },
  /** Modal backdrop, always applied at an alpha. */
  scrim: { light: '#3E2723', dark: '#000000' },

  // --- Ink ------------------------------------------------------------------
  /** Body text. */
  charcoal: { light: '#3A3530', dark: '#E9E2D9' },
  /** Secondary text: explainers, metadata, inactive pills. */
  stone: { light: '#8A8279', dark: '#ADA49A' },
  /** Tertiary text: the mono labels. Small, so it still has to clear 4.5:1. */
  'warm-gray': { light: '#B5AEA4', dark: '#A0978D' },

  // --- Bark: strong ink, and the fill of an inverted pill -------------------
  bark: { light: '#5D4037', dark: '#E9E2D9' },
  'bark-dark': { light: '#3E2723', dark: '#F5F0E8' },
  /** Expense amounts. */
  'bark-light': { light: '#7B5B4F', dark: '#CCA99A' },
  'bark-lighter': { light: '#A68B7B', dark: '#B79C8D' },

  // --- Sage: money coming in, confirmation, focus ---------------------------
  /** Focus rings and toggle tracks. */
  sage: { light: '#7B9E7B', dark: '#8AB48A' },
  /** Hover borders and underlines. */
  'sage-light': { light: '#A3BFA3', dark: '#7B9B7B' },
  /** The active-pill fill. Pale in light, deep in dark. */
  'sage-lighter': { light: '#D4E4D4', dark: '#2E4530' },
  /** Secondary sage text, and the confirm-pill fill. */
  'sage-dark': { light: '#5A7A5A', dark: '#A6C9A6' },
  /** Income amounts, active-pill text. */
  'sage-deep': { light: '#3D5C3D', dark: '#C3DEC3' },

  // --- Copper: the primary action, and overspend ----------------------------
  copper: { light: '#C17D4A', dark: '#D08A55' },
  'copper-light': { light: '#D9A373', dark: '#E3B48D' },
  'copper-dark': { light: '#9B5F30', dark: '#E9AE77' },

  // --- Error ----------------------------------------------------------------
  error: { light: '#C1574A', dark: '#D9705F' },
  /**
   * Body-text weight. `error` clears 3:1 on cream but only 3.86:1 on the
   * critical alert tint, short of the 4.5:1 text minimum.
   */
  'error-dark': { light: '#A8483D', dark: '#F09383' },

  // --- Alert tints ----------------------------------------------------------
  'danger-bg': { light: '#F7EDEB', dark: '#3A2320' },
  'danger-line': { light: '#E8D3CE', dark: '#5E3C36' },
  'warning-bg': { light: '#FAF0E6', dark: '#382A1D' },
  'warning-line': { light: '#EBD5BE', dark: '#5C4630' },

  // --- The projection panel -------------------------------------------------
  // Already dark on a light page, so it does not invert. It lifts slightly in
  // dark mode to stay legible as a raised panel rather than a hole.
  panel: { light: '#2A2420', dark: '#372F2A' },
  'panel-ink': { light: '#FAF7F2', dark: '#FAF7F2' },
  'panel-ink-muted': { light: '#B5AEA4', dark: '#B5AEA4' },
  'panel-ink-faint': { light: '#8A8279', dark: '#A69D93' },
  'panel-positive': { light: '#A3BFA3', dark: '#A3BFA3' },
  'panel-warning': { light: '#D9A373', dark: '#D9A373' },

  // --- Balance health -------------------------------------------------------
  // Always paired with a text label, so color is never the sole signal.
  'balance-good': { light: '#3D5C3D', dark: '#C3DEC3' },
  'balance-warning': { light: '#C17D4A', dark: '#E3B48D' },
  'balance-critical': { light: '#C1574A', dark: '#F09383' },
} as const satisfies Record<string, TokenPair>;

export type TokenName = keyof typeof PALETTE;

/** The ground each token is read against, for contrast checking. */
export const GROUNDS = {
  page: 'cream',
  surface: 'surface',
  panel: 'panel',
} as const;
