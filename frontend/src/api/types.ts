// All amounts from API are decimal strings — never use parseFloat or Number()

export type Frequency = 'weekly' | 'biweekly' | 'monthly' | 'yearly';
export type RecurringStatus = 'active' | 'disabled' | 'pending_review' | 'ended';
export type AccountType = 'checking' | 'savings' | 'credit';
export type TransactionSource = 'actual' | 'forecast' | 'manual';
export type OverrideType = 'skip' | 'reschedule' | 'amount_change' | 'rename';
export type Category =
  | 'Income' | 'Housing' | 'Utilities' | 'Groceries' | 'Transportation'
  | 'Insurance' | 'Healthcare' | 'Entertainment' | 'Dining' | 'Shopping'
  | 'Subscriptions' | 'Loan Payments' | 'Taxes' | 'Fitness'
  | 'Transfers' | 'Other';

/** Who chose a transaction's category. */
export type CategorySource = 'auto' | 'user';

export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
}

export interface Account {
  id: string;
  simplefinId: string | null;
  institution: string;
  name: string;
  type: AccountType;
  lastBalance: string | null; // decimal string
  lastSyncedAt: string | null;
  isActive: boolean;
  includeInView: boolean;
}

/**
 * A `transactions` row exactly as the API sends it.
 *
 * Kept separate from `Transaction` because the two disagree on one field: the
 * stored column is `type`, while the app — and the forecast endpoint, which
 * does this translation server-side — calls it `source`. `toTransaction` in
 * `mappers.ts` is the only place that gap is crossed.
 */
export interface ApiTransaction {
  id: string;
  accountId: string;
  simplefinId: string | null;
  date: string; // YYYY-MM-DD
  description: string;
  amount: string; // decimal string, negative = debit
  category: Category | null;
  categorySource: CategorySource;
  type: 'actual' | 'manual';
  status: 'posted' | 'pending';
  createdAt: string;
  updatedAt: string;
}

export interface Transaction {
  id: string;
  accountId: string;
  date: string; // YYYY-MM-DD
  description: string;
  amount: string; // decimal string, negative = debit
  source: TransactionSource;
  category: Category | null;
  /**
   * Who chose the category. A `user` row is never re-categorized, so a
   * correction survives the next sync.
   */
  categorySource: CategorySource;
}

export interface ForecastTransaction {
  id: string;
  date: string;
  description: string;
  amount: string; // decimal string, negative = debit
  source: TransactionSource;
  category: Category | null;
}

export interface ForecastDay {
  date: string; // YYYY-MM-DD
  transactions: ForecastTransaction[];
  dailyNet: string; // decimal string
  runningBalance: string; // decimal string
}

export interface Recurring {
  id: string;
  accountId: string;
  name: string;
  amount: string; // decimal string
  frequency: Frequency;
  nextDate: string; // YYYY-MM-DD
  endDate: string | null;
  source: 'auto_detected' | 'manual';
  status: RecurringStatus;
  category: Category | null;
}

export interface Override {
  id: string;
  recurringId: string;
  originalDate: string;
  overrideType: OverrideType;
  overrideDate: string | null;
  overrideAmount: string | null;
  overrideName: string | null;
}

export interface SyncLog {
  id: string;
  startedAt: string;
  completedAt: string | null;
  status: 'running' | 'success' | 'error';
  message: string | null;
}

export interface SyncStatusResponse {
  lastSync: SyncLog | null;
  syncsToday: number;
  dailyLimit: number;
}

export interface Setting {
  key: string;
  value: string;
}

// Request body types
export interface CreateAccountBody {
  institution: string;
  name: string;
  type: AccountType;
}

export interface CreateTransactionBody {
  accountId: string;
  date: string;
  description: string;
  amount: string; // decimal string
  category?: Category | null;
}

export interface UpdateTransactionBody {
  date?: string;
  description?: string;
  amount?: string;
  category?: Category | null;
}

export interface CreateRecurringBody {
  accountId: string;
  name: string;
  amount: string;
  frequency: Frequency;
  nextDate: string;
  endDate?: string;
  category?: Category | null;
}

export interface UpdateRecurringBody {
  name?: string;
  amount?: string;
  frequency?: Frequency;
  nextDate?: string;
  endDate?: string | null;
  status?: RecurringStatus;
  category?: Category | null;
}

export interface CreateOverrideBody {
  overrideType: OverrideType;
  overrideDate?: string;
  overrideAmount?: string;
  overrideName?: string;
}

export interface ImportBody {
  accountId: string;
  transactions: Array<{ date: string; description: string; amount: string }>;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

export interface DetectResult {
  detected: number;
  expired: number;
}

// Reports
export interface CategorySummaryItem {
  category: string;
  total: string; // decimal string
}

export interface CategorySummaryResponse {
  income: CategorySummaryItem[];
  expenses: CategorySummaryItem[];
  transfers: CategorySummaryItem[];
}

/**
 * One month of category totals, covering month-start through the same
 * day-of-month as the requested `asOf` (clamped to the month's length).
 */
export interface CategoryTrendMonth extends CategorySummaryResponse {
  month: string; // YYYY-MM
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
}

export interface CategoryTrendResponse {
  /** Newest first; index 0 contains the requested `asOf`. */
  months: CategoryTrendMonth[];
}

/** One category's total for a month, with its movement against the month before. */
export interface MonthlyCategory {
  category: string;
  total: string;
  /**
   * Movement against the prior month, on magnitudes: a bigger charge reads as
   * an increase. Null when the prior month had no such category — an absence
   * is not a change from zero.
   */
  change: string | null;
  /** That movement as a percent. Null when there is no prior figure, or it was zero. */
  changePercent: string | null;
}

/** One whole calendar month. Present even when it holds nothing. */
export interface MonthlySummaryMonth {
  /** YYYY-MM */
  month: string;
  /** Transfers excluded from all three. */
  income: string;
  expenses: string;
  net: string;
  categories: MonthlyCategory[];
}

export interface MonthlySummaryResponse {
  /** Oldest first. */
  months: MonthlySummaryMonth[];
}

/** One merchant's worth of transactions that nothing has categorized yet. */
export interface UncategorizedGroup {
  /**
   * The normalized description. Sending this back to batch-categorize is what
   * assigns the whole group, so it is the group's identity, not a label.
   */
  description: string;
  count: number;
  total: string;
}

export interface UncategorizedResponse {
  /** Every uncategorized amount summed, as a decimal string. */
  total: string;
  /** Largest first by size of amount. */
  groups: UncategorizedGroup[];
}
