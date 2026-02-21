// All amounts from API are decimal strings — never use parseFloat or Number()

export type Frequency = 'weekly' | 'biweekly' | 'monthly' | 'yearly';
export type RecurringStatus = 'active' | 'disabled' | 'pending_review' | 'ended';
export type AccountType = 'checking' | 'savings' | 'credit';
export type TransactionSource = 'actual' | 'forecast' | 'manual';
export type OverrideType = 'skip' | 'reschedule' | 'amount_change' | 'rename';

export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
}

export interface Account {
  id: string;
  tellerId: string;
  institution: string;
  name: string;
  type: AccountType;
  lastBalance: string | null; // decimal string
  lastSyncedAt: string | null;
  isActive: boolean;
  includeInView: boolean;
}

export interface Transaction {
  id: string;
  accountId: string;
  date: string; // YYYY-MM-DD
  description: string;
  amount: string; // decimal string, negative = debit
  source: TransactionSource;
  recurringId: string | null;
}

export interface ForecastTransaction {
  id: string;
  date: string;
  description: string;
  amount: string; // decimal string, negative = debit
  source: TransactionSource;
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

export interface Setting {
  key: string;
  value: string;
}

// Request body types
export interface CreateTransactionBody {
  accountId: string;
  date: string;
  description: string;
  amount: string; // decimal string
}

export interface UpdateTransactionBody {
  date?: string;
  description?: string;
  amount?: string;
}

export interface CreateRecurringBody {
  accountId: string;
  name: string;
  amount: string;
  frequency: Frequency;
  nextDate: string;
  endDate?: string;
}

export interface UpdateRecurringBody {
  name?: string;
  amount?: string;
  frequency?: Frequency;
  nextDate?: string;
  endDate?: string | null;
  status?: RecurringStatus;
}

export interface CreateOverrideBody {
  overrideType: OverrideType;
  overrideDate?: string;
  overrideAmount?: string;
  overrideName?: string;
}
