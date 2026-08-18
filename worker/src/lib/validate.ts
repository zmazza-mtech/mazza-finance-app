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

// ---------------------------------------------------------------------------
// Recurring transactions
// ---------------------------------------------------------------------------

export const FrequencyEnum = z.enum(['weekly', 'biweekly', 'monthly', 'yearly']);
export const RecurringStatusEnum = z.enum(['active', 'disabled', 'pending_review', 'ended']);

export const CreateRecurringSchema = z.object({
  accountId: uuid,
  name: z.string().min(1).max(255),
  amount: decimalAmount,
  frequency: FrequencyEnum,
  nextDate: dateString,
  endDate: dateString.nullable().optional(),
  category: CategoryEnum.nullable().optional(),
});

export const UpdateRecurringSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  amount: decimalAmount.optional(),
  frequency: FrequencyEnum.optional(),
  nextDate: dateString.optional(),
  endDate: dateString.nullable().optional(),
  status: RecurringStatusEnum.optional(),
  category: CategoryEnum.nullable().optional(),
});

export const CreateOverrideSchema = z.object({
  overrideType: z.enum(['modified', 'deleted']),
  overrideDate: dateString.nullable().optional(),
  overrideAmount: decimalAmount.nullable().optional(),
  overrideName: z.string().min(1).max(255).nullable().optional(),
});

export const ForecastQuerySchema = z.object({
  accountId: uuid,
  startDate: dateString,
  endDate: dateString,
});

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export const ReportQuerySchema = z.object({
  accountId: uuid,
  startDate: dateString,
  endDate: dateString,
});

/** YYYY-MM month string */
const monthString = z.string().regex(/^\d{4}-\d{2}$/, 'Must be YYYY-MM');

/** Absolute month index, for comparing two YYYY-MM strings. */
function monthIndex(month: string): number {
  const [year, m] = month.split('-').map(Number) as [number, number];
  return year * 12 + (m - 1);
}

export const MonthlySummaryQuerySchema = z
  .object({
    accountId: uuid,
    startMonth: monthString,
    endMonth: monthString,
  })
  .refine((q) => monthIndex(q.endMonth) >= monthIndex(q.startMonth), {
    message: 'endMonth must not precede startMonth',
    path: ['endMonth'],
  });

export const CategoryTrendQuerySchema = z.object({
  accountId: uuid,
  asOf: dateString,
  months: z.coerce.number().int().min(1).max(12),
});

// ---------------------------------------------------------------------------
// CSV import
// ---------------------------------------------------------------------------

const ImportRowSchema = z.object({
  date: dateString,
  description: z.string().min(1).max(255),
  amount: decimalAmount,
});

export const ImportCsvBodySchema = z.object({
  accountId: uuid,
  transactions: z.array(ImportRowSchema).min(1).max(5000),
});
