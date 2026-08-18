/**
 * D1 (SQLite) schema — tenancy-ready from migration #1 per the replatform
 * spec (docs/superpowers/specs/2026-08-17-cloudflare-native-replatform.md).
 *
 * Dialect rules (spec decisions 3 and 11):
 * - Money is TEXT decimal strings. No SQL aggregation or arithmetic on
 *   amount columns — fetch rows and sum with decimal.js in the service layer.
 * - IDs are TEXT UUIDs generated app-side (crypto.randomUUID()).
 * - Dates are ISO-8601 TEXT: YYYY-MM-DD for dates, full timestamps for
 *   instants, always UTC.
 */
import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

const id = () =>
  text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

const nowIso = () => new Date().toISOString();

const createdAt = () =>
  text('created_at').notNull().$defaultFn(nowIso);
const updatedAt = () =>
  text('updated_at').notNull().$defaultFn(nowIso).$onUpdateFn(nowIso);

// ---------------------------------------------------------------------------
// Tenancy: households own all financial data; users belong to households.
// ---------------------------------------------------------------------------

export const households = sqliteTable('households', {
  id: id(),
  name: text('name').notNull(),
  createdAt: createdAt(),
});

export const users = sqliteTable('users', {
  id: id(),
  // JIT-provisioned from the verified Clerk JWT on first authenticated request.
  clerkUserId: text('clerk_user_id').notNull().unique(),
  email: text('email').notNull(),
  createdAt: createdAt(),
});

export const householdMemberships = sqliteTable(
  'household_memberships',
  {
    id: id(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    role: text('role').notNull(), // owner | member
    createdAt: createdAt(),
  },
  (t) => ({
    uqMembership: uniqueIndex('uq_membership_household_user').on(t.householdId, t.userId),
    membershipRoleCheck: check('membership_role_check', sql`${t.role} IN ('owner', 'member')`),
  })
);

// Replaces app_settings for household-scoped values:
// balance_threshold_green | balance_threshold_yellow | last_sync_at
export const householdSettings = sqliteTable(
  'household_settings',
  {
    householdId: text('household_id')
      .notNull()
      .references(() => households.id),
    key: text('key').notNull(),
    value: text('value').notNull(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    uqHouseholdSetting: uniqueIndex('uq_household_setting').on(t.householdId, t.key),
  })
);

// Replaces app_settings for per-user values: theme
export const userSettings = sqliteTable(
  'user_settings',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    key: text('key').notNull(),
    value: text('value').notNull(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    uqUserSetting: uniqueIndex('uq_user_setting').on(t.userId, t.key),
  })
);

// Per-household SimpleFIN access URL, AES-256-GCM encrypted
// ("nonce:ciphertext:tag" hex) with the master key in Wrangler secrets.
// The key NEVER lives in the database. key_version enables rotation.
export const simplefinConnections = sqliteTable('simplefin_connections', {
  id: id(),
  householdId: text('household_id')
    .notNull()
    .unique()
    .references(() => households.id),
  encryptedAccessUrl: text('encrypted_access_url').notNull(),
  keyVersion: integer('key_version').notNull().default(1),
  createdAt: createdAt(),
  rotatedAt: text('rotated_at'),
});

// ---------------------------------------------------------------------------
// accounts
// ---------------------------------------------------------------------------
export const accounts = sqliteTable(
  'accounts',
  {
    id: id(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id),
    simplefinId: text('simplefin_id'), // null for manually created accounts
    institution: text('institution').notNull(),
    name: text('name').notNull(),
    type: text('type').notNull(), // checking | savings | credit
    subtype: text('subtype'),
    currency: text('currency').notNull().default('USD'),
    lastBalance: text('last_balance'), // decimal string
    lastSyncedAt: text('last_synced_at'),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    includeInView: integer('include_in_view', { mode: 'boolean' }).notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    // Two households could link the same institution — uniqueness is per household.
    uqAccountSimplefin: uniqueIndex('uq_accounts_household_simplefin').on(
      t.householdId,
      t.simplefinId
    ),
    idxAccountsHousehold: index('idx_accounts_household').on(t.householdId),
    accountsTypeCheck: check('accounts_type_check', sql`${t.type} IN ('checking', 'savings', 'credit')`),
  })
);

// ---------------------------------------------------------------------------
// transactions
// ---------------------------------------------------------------------------
export const transactions = sqliteTable(
  'transactions',
  {
    id: id(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id),
    simplefinId: text('simplefin_id'), // null for manual entries
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id),
    date: text('date').notNull(), // YYYY-MM-DD
    description: text('description').notNull(),
    amount: text('amount').notNull(), // decimal string; negative = debit
    type: text('type').notNull(), // actual | manual
    status: text('status').notNull().default('posted'), // posted | pending
    category: text('category'), // null means uncategorized
    // Who chose the category. A 'user' row is never re-categorized: reverting a
    // correction on the next sync would teach the user the column cannot be
    // trusted.
    categorySource: text('category_source').notNull().default('auto'), // auto | user
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    uqTransactionSimplefin: uniqueIndex('uq_transactions_household_simplefin').on(
      t.householdId,
      t.simplefinId
    ),
    idxTransactionsAccountDate: index('idx_transactions_account_date').on(t.accountId, t.date),
    idxTransactionsHousehold: index('idx_transactions_household').on(t.householdId),
    transactionsTypeCheck: check('transactions_type_check', sql`${t.type} IN ('actual', 'manual')`),
    transactionsStatusCheck: check('transactions_status_check', sql`${t.status} IN ('posted', 'pending')`),
    transactionsCategorySourceCheck: check(
      'transactions_category_source_check',
      sql`${t.categorySource} IN ('auto', 'user')`
    ),
  })
);

// ---------------------------------------------------------------------------
// recurring_transactions
// ---------------------------------------------------------------------------
export const recurringTransactions = sqliteTable(
  'recurring_transactions',
  {
    id: id(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id),
    name: text('name').notNull(),
    amount: text('amount').notNull(), // decimal string; negative = debit
    frequency: text('frequency').notNull(), // weekly | biweekly | monthly | yearly
    nextDate: text('next_date').notNull(),
    endDate: text('end_date'),
    source: text('source').notNull(), // auto_detected | manual
    status: text('status').notNull().default('pending_review'), // active | disabled | pending_review | ended
    category: text('category'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    idxRecurringAccount: index('idx_recurring_account').on(t.accountId),
    idxRecurringHousehold: index('idx_recurring_household').on(t.householdId),
    recurringFrequencyCheck: check(
      'recurring_frequency_check',
      sql`${t.frequency} IN ('weekly', 'biweekly', 'monthly', 'yearly')`
    ),
    recurringSourceCheck: check('recurring_source_check', sql`${t.source} IN ('auto_detected', 'manual')`),
    recurringStatusCheck: check(
      'recurring_status_check',
      sql`${t.status} IN ('active', 'disabled', 'pending_review', 'ended')`
    ),
  })
);

// ---------------------------------------------------------------------------
// recurring_overrides — scope inherited via the recurring FK; household_id is
// carried anyway for defense-in-depth and simpler scoped deletes.
// ---------------------------------------------------------------------------
export const recurringOverrides = sqliteTable(
  'recurring_overrides',
  {
    id: id(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id),
    recurringTransactionId: text('recurring_transaction_id')
      .notNull()
      .references(() => recurringTransactions.id, { onDelete: 'cascade' }),
    originalDate: text('original_date').notNull(),
    overrideType: text('override_type').notNull(), // modified | deleted
    overrideDate: text('override_date'),
    overrideAmount: text('override_amount'), // decimal string
    overrideName: text('override_name'),
    createdAt: createdAt(),
  },
  (t) => ({
    idxOverridesRecurring: index('idx_overrides_recurring').on(t.recurringTransactionId),
    // One override per occurrence. The upsert in the recurring router has
    // always assumed this; migration 0002 is where it became true (#100).
    uqOverrideOccurrence: uniqueIndex('uq_override_occurrence').on(
      t.recurringTransactionId,
      t.originalDate
    ),
    overrideTypeCheck: check('override_type_check', sql`${t.overrideType} IN ('modified', 'deleted')`),
  })
);

// ---------------------------------------------------------------------------
// sync_log — also the per-household sync guard (a 'running' row with a
// staleness timeout) and the 24/day budget counter (rows since midnight UTC).
// ---------------------------------------------------------------------------
export const syncLog = sqliteTable(
  'sync_log',
  {
    id: id(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id),
    startedAt: text('started_at').notNull(),
    completedAt: text('completed_at'),
    status: text('status').notNull(), // running | success | partial | failed
    accountsSynced: integer('accounts_synced').default(0),
    transactionsFetched: integer('transactions_fetched').default(0),
    transactionsReconciled: integer('transactions_reconciled').default(0),
    // Fixed vocabulary — never raw API response text
    errorCode: text('error_code'),
    createdAt: createdAt(),
  },
  (t) => ({
    idxSyncLogHousehold: index('idx_sync_log_household_started').on(t.householdId, t.startedAt),
  })
);

// Allowed settings keys — enforced at API layer via Zod
export const HOUSEHOLD_SETTINGS_KEYS = [
  'balance_threshold_green',
  'balance_threshold_yellow',
  'last_sync_at',
] as const;
export const USER_SETTINGS_KEYS = ['theme'] as const;
