import Decimal from 'decimal.js';
import { CATEGORIES } from '@/lib/categories';
import type { Category, Transaction } from '@/api/types';

/**
 * The category filter selection above the transactions table.
 *
 * `'all'` is the default pill; `'uncategorized'` is offered only when the
 * range actually contains rows the categorizer left alone, so the pill row
 * never advertises an empty filter.
 */
export type CategoryFilter = Category | 'uncategorized' | 'all';

export interface TransactionSummary {
  /** Sum of credits, as a positive decimal string. */
  moneyIn: string;
  /** Sum of debits, as a positive magnitude — the card labels the direction. */
  moneyOut: string;
  /** Credits less debits, signed. */
  net: string;
  count: number;
}

/**
 * Totals for the three summary cards.
 *
 * Every row counts, transfers included: this screen is the raw ledger, not the
 * income-versus-expense report, and hiding a transfer here would make the cards
 * disagree with the rows beneath them.
 */
export function summarizeTransactions(transactions: Transaction[]): TransactionSummary {
  let moneyIn = new Decimal(0);
  let moneyOut = new Decimal(0);

  for (const tx of transactions) {
    const amount = new Decimal(tx.amount);
    if (amount.isNegative()) {
      moneyOut = moneyOut.plus(amount.abs());
    } else {
      moneyIn = moneyIn.plus(amount);
    }
  }

  return {
    moneyIn: moneyIn.toFixed(2),
    moneyOut: moneyOut.toFixed(2),
    net: moneyIn.minus(moneyOut).toFixed(2),
    count: transactions.length,
  };
}

/**
 * The categories the given transactions actually use, in canonical order.
 *
 * Ordering by `CATEGORIES` rather than by first appearance keeps the pill row
 * stable as rows are recategorized — pills never reshuffle under the cursor.
 */
export function categoriesPresent(
  transactions: Transaction[],
): Exclude<CategoryFilter, 'all'>[] {
  const used = new Set<Category>();
  let hasUncategorized = false;

  for (const tx of transactions) {
    if (tx.category) {
      used.add(tx.category);
    } else {
      hasUncategorized = true;
    }
  }

  const present: Exclude<CategoryFilter, 'all'>[] = CATEGORIES.filter((cat) =>
    used.has(cat),
  );
  if (hasUncategorized) present.push('uncategorized');
  return present;
}

/**
 * Applies the category pill and the description search to the fetched rows.
 *
 * Both filters run client-side against the full range so the pill row can list
 * every category in the range rather than collapsing to the one already
 * selected, and so the summary cards can recompute without a refetch.
 * Incoming order is preserved, which is the server's sort.
 */
export function filterTransactions(
  transactions: Transaction[],
  category: CategoryFilter,
  query: string,
): Transaction[] {
  const needle = query.trim().toLowerCase();

  return transactions.filter((tx) => {
    if (category === 'uncategorized' && tx.category !== null) return false;
    if (category !== 'all' && category !== 'uncategorized' && tx.category !== category) {
      return false;
    }
    if (needle && !tx.description.toLowerCase().includes(needle)) return false;
    return true;
  });
}
