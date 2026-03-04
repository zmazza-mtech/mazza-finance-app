import type { ForecastDay, ForecastTransaction } from '@/api/types';

/**
 * Tests whether a transaction matches the search query.
 * Case-insensitive substring match on description and amount.
 */
export function transactionMatchesQuery(
  tx: ForecastTransaction,
  query: string,
): boolean {
  if (!query) return false;
  const q = query.toLowerCase();
  if (tx.description.toLowerCase().includes(q)) return true;
  if (tx.amount.includes(q)) return true;
  return false;
}

/**
 * Returns a Set of dates that contain at least one matching transaction.
 */
export function findMatchingDates(
  days: ForecastDay[],
  query: string,
): Set<string> {
  const matches = new Set<string>();
  if (!query) return matches;
  for (const day of days) {
    for (const tx of day.transactions) {
      if (transactionMatchesQuery(tx, query)) {
        matches.add(day.date);
        break;
      }
    }
  }
  return matches;
}

/**
 * Returns a Set of transaction IDs that match the query within a list.
 */
export function findMatchingTransactionIds(
  transactions: ForecastTransaction[],
  query: string,
): Set<string> {
  const ids = new Set<string>();
  if (!query) return ids;
  for (const tx of transactions) {
    if (transactionMatchesQuery(tx, query)) {
      ids.add(tx.id);
    }
  }
  return ids;
}
