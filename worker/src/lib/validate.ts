/**
 * Request validation, ported from `backend/src/lib/validate.ts` (#68).
 *
 * Zod on every write endpoint, no exceptions — the invariant is carried over
 * from epic #1 unchanged. The schemas are copied rather than imported so the
 * worker does not depend on the Express package it replaces.
 */
import { z } from 'zod';

/** YYYY-MM-DD date string */
export const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD');

/** Decimal amount string — allows negative, max 2 decimal places */
export const decimalAmount = z
  .string()
  .regex(/^-?\d+(\.\d{1,2})?$/, 'Must be a decimal amount (e.g. "-15.99")');

export const uuid = z.string().uuid();

export const CategoryEnum = z.enum([
  'Income',
  'Housing',
  'Utilities',
  'Groceries',
  'Transportation',
  'Insurance',
  'Healthcare',
  'Entertainment',
  'Dining',
  'Shopping',
  'Subscriptions',
  'Loan Payments',
  'Taxes',
  'Fitness',
  'Transfers',
  'Other',
]);

export const CreateManualTransactionSchema = z.object({
  accountId: uuid,
  date: dateString,
  description: z.string().min(1).max(255),
  amount: decimalAmount,
  category: CategoryEnum.nullable().optional(),
});

export const UpdateManualTransactionSchema = z.object({
  date: dateString.optional(),
  description: z.string().min(1).max(255).optional(),
  amount: decimalAmount.optional(),
  category: CategoryEnum.nullable().optional(),
});

export const BatchCategorizeSchema = z.object({
  description: z.string().min(1).max(255),
  category: CategoryEnum.nullable(),
});

export const TransactionsQuerySchema = z.object({
  accountId: uuid.optional(),
  startDate: dateString.optional(),
  endDate: dateString.optional(),
  sortBy: z.enum(['date', 'amount', 'description', 'category']).optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
  category: CategoryEnum.optional(),
});
