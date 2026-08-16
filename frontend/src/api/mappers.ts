import type { ApiTransaction, Transaction } from './types';

/**
 * Translates a transaction row from the wire shape into the app's shape.
 *
 * The endpoint returns raw database rows, where the column is `type`; the app
 * reads it as `source`, matching the forecast payload, which already performs
 * this rename server-side. Every response carrying a transaction goes through
 * here, so the two vocabularies meet in one place (issue #34).
 */
export function toTransaction(row: ApiTransaction): Transaction {
  return {
    id: row.id,
    accountId: row.accountId,
    date: row.date,
    description: row.description,
    amount: row.amount,
    source: row.type,
    category: row.category,
    categorySource: row.categorySource,
  };
}
