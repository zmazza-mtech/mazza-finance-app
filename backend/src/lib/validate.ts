import { z } from 'zod';
import { ALLOWED_SETTINGS_KEYS } from '../db/schema';

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** YYYY-MM-DD date string */
const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD');

/** Decimal amount string — allows negative, max 2 decimal places */
const decimalAmount = z
  .string()
  .regex(/^-?\d+(\.\d{1,2})?$/, 'Must be a decimal amount (e.g. "-15.99")');

/** UUID string */
const uuid = z.string().uuid();

/** Transaction category */
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
  'Transfers',
  'Other',
]);

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Recurring transactions
// ---------------------------------------------------------------------------

const FrequencyEnum = z.enum(['weekly', 'biweekly', 'monthly', 'yearly']);
const RecurringStatusEnum = z.enum(['active', 'disabled', 'pending_review', 'ended']);

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

// ---------------------------------------------------------------------------
// Recurring overrides (single-instance edits)
// ---------------------------------------------------------------------------

export const CreateOverrideSchema = z.object({
  overrideType: z.enum(['modified', 'deleted']),
  overrideDate: dateString.nullable().optional(),
  overrideAmount: decimalAmount.nullable().optional(),
  overrideName: z.string().min(1).max(255).nullable().optional(),
});

// ---------------------------------------------------------------------------
// App settings
// ---------------------------------------------------------------------------

export const UpdateSettingSchema = z.object({
  value: z.string().min(1).max(255),
});

export const SettingKeyParamSchema = z.object({
  key: z.enum(ALLOWED_SETTINGS_KEYS),
});

// ---------------------------------------------------------------------------
// Path parameters
// ---------------------------------------------------------------------------

/** Validates a single :id path param as UUID. */
export const UuidParamSchema = z.object({ id: uuid });

/** Validates a YYYY-MM-DD :originalDate path param. */
export const OriginalDateParamSchema = z.object({ originalDate: dateString });

// ---------------------------------------------------------------------------
// Query params
// ---------------------------------------------------------------------------

export const ForecastQuerySchema = z.object({
  accountId: uuid,
  startDate: dateString,
  endDate: dateString,
});

export const TransactionsQuerySchema = z.object({
  accountId: uuid.optional(),
  startDate: dateString.optional(),
  endDate: dateString.optional(),
  sortBy: z.enum(['date', 'amount', 'description', 'category']).optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
  category: CategoryEnum.optional(),
});

export const ReportQuerySchema = z.object({
  accountId: uuid,
  startDate: dateString,
  endDate: dateString,
});

// ---------------------------------------------------------------------------
// Type exports
// ---------------------------------------------------------------------------

export type CreateManualTransactionInput = z.infer<typeof CreateManualTransactionSchema>;
export type UpdateManualTransactionInput = z.infer<typeof UpdateManualTransactionSchema>;
export type CreateRecurringInput = z.infer<typeof CreateRecurringSchema>;
export type UpdateRecurringInput = z.infer<typeof UpdateRecurringSchema>;
export type CreateOverrideInput = z.infer<typeof CreateOverrideSchema>;
export type UpdateSettingInput = z.infer<typeof UpdateSettingSchema>;
export type ForecastQuery = z.infer<typeof ForecastQuerySchema>;
export type TransactionsQuery = z.infer<typeof TransactionsQuerySchema>;
export type UuidParam = z.infer<typeof UuidParamSchema>;
export type OriginalDateParam = z.infer<typeof OriginalDateParamSchema>;
