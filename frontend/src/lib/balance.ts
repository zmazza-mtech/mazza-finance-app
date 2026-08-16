import Decimal from 'decimal.js';

export type BalanceHealth = 'good' | 'warning' | 'critical';

// Default thresholds (used when settings are unavailable)
const DEFAULT_GREEN_THRESHOLD = '1000';
const DEFAULT_CRITICAL_THRESHOLD = '200';

/**
 * Determines the health state of a balance given configurable thresholds.
 * All values are decimal strings to avoid floating-point errors.
 *
 * - good: balance > greenThreshold
 * - warning: criticalThreshold < balance <= greenThreshold
 * - critical: balance <= criticalThreshold
 */
export function getBalanceHealth(
  balance: string,
  greenThreshold: string = DEFAULT_GREEN_THRESHOLD,
  criticalThreshold: string = DEFAULT_CRITICAL_THRESHOLD,
): BalanceHealth {
  const bal = new Decimal(balance);
  const green = new Decimal(greenThreshold);
  const critical = new Decimal(criticalThreshold);

  if (bal.greaterThan(green)) {
    return 'good';
  }
  if (bal.greaterThan(critical)) {
    return 'warning';
  }
  return 'critical';
}

/**
 * Formats a decimal string amount to a locale string with commas and
 * exactly two decimal places. Strips any negative sign.
 */
export function formatAmount(amount: string): string {
  const dec = new Decimal(amount).abs();
  // toFixed(2) gives us two decimal places
  const fixed = dec.toFixed(2);
  // Add thousands separator
  const [intPart, decPart] = fixed.split('.');
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${withCommas}.${decPart}`;
}

/**
 * Formats a decimal string as a dollar currency value.
 * Negative values display as "-$X.XX".
 */
export function formatCurrency(amount: string): string {
  const dec = new Decimal(amount);
  const abs = formatAmount(amount);
  if (dec.isNegative() && !dec.isZero()) {
    return `-$${abs}`;
  }
  return `$${abs}`;
}

/**
 * Formats a decimal string as whole dollars: "$244", "$1,244".
 *
 * For rates and averages, where cents are false precision — a burn rate is a
 * derived average, not an amount anyone was charged.
 */
export function formatWholeCurrency(amount: string): string {
  const rounded = new Decimal(amount).toDecimalPlaces(0);
  const withCommas = rounded.abs().toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return rounded.isNegative() && !rounded.isZero() ? `-$${withCommas}` : `$${withCommas}`;
}

/**
 * Returns true if the decimal string represents a negative value.
 */
export function isNegative(amount: string): boolean {
  return new Decimal(amount).isNegative() && !new Decimal(amount).isZero();
}

/**
 * Returns the CSS class names for balance health coloring.
 * Pairs color with text label — color is never the sole indicator.
 */
export function getBalanceHealthClasses(health: BalanceHealth): string {
  switch (health) {
    case 'good':
      return 'text-balance-good';
    case 'warning':
      return 'text-balance-warning';
    case 'critical':
      return 'text-balance-critical';
  }
}

/**
 * Returns the human-readable label for a balance health state.
 */
export function getBalanceHealthLabel(health: BalanceHealth): string {
  switch (health) {
    case 'good':
      return 'Good';
    case 'warning':
      return 'Low';
    case 'critical':
      return 'Critical';
  }
}
