import {
  pgTable,
  uuid,
  text,
  numeric,
  boolean,
  date,
  integer,
  timestamp,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// accounts
// ---------------------------------------------------------------------------
export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    simplefinId: text('simplefin_id').unique(), // null for manually created accounts
    institution: text('institution').notNull(),
    name: text('name').notNull(),
    type: text('type').notNull(), // checking | savings | credit
    subtype: text('subtype'),
    currency: text('currency').notNull().default('USD'),
    lastBalance: numeric('last_balance', { precision: 12, scale: 2 })
      .$type<string>(),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    isActive: boolean('is_active').notNull().default(true),
    includeInView: boolean('include_in_view').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    accountsTypeCheck: check('accounts_type_check', sql`${t.type} IN ('checking', 'savings', 'credit')`),
  })
);

// ---------------------------------------------------------------------------
// transactions
// ---------------------------------------------------------------------------
export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    simplefinId: text('simplefin_id').unique(), // null for manual entries
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id),
    date: date('date').notNull(),
    description: text('description').notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 })
      .notNull()
      .$type<string>(), // negative = debit, positive = deposit
    type: text('type').notNull(), // actual | manual
    status: text('status').notNull().default('posted'), // posted | pending
    category: text('category'), // nullable — null means uncategorized
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    idxTransactionsAccountDate: index('idx_transactions_account_date').on(t.accountId, t.date),
    transactionsTypeCheck: check('transactions_type_check', sql`${t.type} IN ('actual', 'manual')`),
    transactionsStatusCheck: check('transactions_status_check', sql`${t.status} IN ('posted', 'pending')`),
  })
);

// ---------------------------------------------------------------------------
// recurring_transactions
// ---------------------------------------------------------------------------
export const recurringTransactions = pgTable(
  'recurring_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id),
    name: text('name').notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 })
      .notNull()
      .$type<string>(), // negative = debit, positive = deposit
    frequency: text('frequency').notNull(), // weekly | biweekly | monthly | yearly
    nextDate: date('next_date').notNull(),
    endDate: date('end_date'),
    source: text('source').notNull(), // auto_detected | manual
    status: text('status').notNull().default('pending_review'), // active | disabled | pending_review | ended
    category: text('category'), // nullable — null means uncategorized
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    idxRecurringAccount: index('idx_recurring_account').on(t.accountId),
    recurringFrequencyCheck: check('recurring_frequency_check', sql`${t.frequency} IN ('weekly', 'biweekly', 'monthly', 'yearly')`),
    recurringSourceCheck: check('recurring_source_check', sql`${t.source} IN ('auto_detected', 'manual')`),
    recurringStatusCheck: check('recurring_status_check', sql`${t.status} IN ('active', 'disabled', 'pending_review', 'ended')`),
  })
);

// ---------------------------------------------------------------------------
// recurring_overrides
// ---------------------------------------------------------------------------
export const recurringOverrides = pgTable(
  'recurring_overrides',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    recurringTransactionId: uuid('recurring_transaction_id')
      .notNull()
      .references(() => recurringTransactions.id, { onDelete: 'cascade' }),
    originalDate: date('original_date').notNull(),
    overrideType: text('override_type').notNull(), // modified | deleted
    overrideDate: date('override_date'),
    overrideAmount: numeric('override_amount', { precision: 12, scale: 2 })
      .$type<string>(),
    overrideName: text('override_name'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    idxOverridesRecurring: index('idx_overrides_recurring').on(t.recurringTransactionId),
    overrideTypeCheck: check('override_type_check', sql`${t.overrideType} IN ('modified', 'deleted')`),
  })
);

// ---------------------------------------------------------------------------
// sync_log
// ---------------------------------------------------------------------------
export const syncLog = pgTable('sync_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  status: text('status').notNull(), // running | success | partial | failed
  accountsSynced: integer('accounts_synced').default(0),
  transactionsFetched: integer('transactions_fetched').default(0),
  transactionsReconciled: integer('transactions_reconciled').default(0),
  // Fixed vocabulary — never raw API response text
  errorCode: text('error_code'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ---------------------------------------------------------------------------
// app_settings
// ---------------------------------------------------------------------------
export const appSettings = pgTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Allowed settings keys — enforced at API layer via Zod
export const ALLOWED_SETTINGS_KEYS = [
  'balance_threshold_green',
  'balance_threshold_yellow',
  'theme',
  'last_sync_at',
] as const;
export type SettingsKey = (typeof ALLOWED_SETTINGS_KEYS)[number];
