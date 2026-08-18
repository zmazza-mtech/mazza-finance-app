/**
 * D1 query limits, and the arithmetic that follows from them.
 *
 * A bulk insert binds one parameter per column per row, so the row ceiling
 * depends on how wide the table is — which is why a single magic number is
 * wrong. `transactions` has 13 columns, so 8 rows is 104 parameters and D1
 * rejects the statement; 7 rows is 91 and it does not.
 *
 * Adding a column to a table therefore lowers its ceiling. Deriving the
 * chunk from the column count means that happens automatically instead of
 * silently at whatever row count crosses 100 in production.
 */

/** D1 binds at most this many parameters in one statement. */
export const D1_MAX_BOUND_PARAMS = 100;

/**
 * How many rows one INSERT can carry for a table of `columns` columns.
 *
 * Count every column the insert actually binds, including the ones Drizzle
 * fills from `$defaultFn` — an id and two timestamps are three parameters
 * whether or not the caller passed them.
 */
export function rowsPerInsert(columns: number): number {
  return Math.max(1, Math.floor(D1_MAX_BOUND_PARAMS / columns));
}

/**
 * Ids per `WHERE id IN (...)`. Leaves room for the SET clause and the other
 * predicates, which are parameters too.
 */
export const ID_BATCH = 90;

/** `transactions`: id, household_id, simplefin_id, account_id, date, description, amount, type, status, category, category_source, created_at, updated_at. */
export const TRANSACTION_COLUMNS = 13;

/** `recurring_transactions`: id, household_id, account_id, name, amount, frequency, next_date, end_date, source, status, category, created_at, updated_at. */
export const RECURRING_COLUMNS = 13;
