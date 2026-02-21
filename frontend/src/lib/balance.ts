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
      return 'text-green-700 dark:text-green-400';
    case 'warning':
      return 'text-amber-700 dark:text-amber-300';
    case 'critical':
      return 'text-red-700 dark:text-red-400';
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
