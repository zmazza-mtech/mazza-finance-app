import type { ApiResponse } from './types';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

/**
 * Core fetch wrapper.
 * - Always parses JSON as { data, error }
 * - Throws on network errors
 * - Returns ApiResponse<T> for all responses
 */
async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<ApiResponse<T>> {
  const url = `${BASE_URL}${path}`;
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  const json = (await response.json()) as ApiResponse<T>;
  return json;
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

import type { Account, CreateAccountBody } from './types';

export async function getAccounts(): Promise<Account[]> {
  const res = await request<Account[]>('/accounts');
  if (res.error) throw new Error(res.error);
  return res.data ?? [];
}

export async function createAccount(body: CreateAccountBody): Promise<Account> {
  const res = await request<Account>('/accounts', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (res.error) throw new Error(String(res.error));
  if (!res.data) throw new Error('No data returned');
  return res.data;
}

export async function updateAccount(
  id: string,
  body: Partial<Pick<Account, 'includeInView' | 'isActive' | 'lastBalance'>>,
): Promise<Account> {
  const res = await request<Account>(`/accounts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  if (res.error) throw new Error(res.error);
  if (!res.data) throw new Error('No data returned');
  return res.data;
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

import type {
  Transaction,
  CreateTransactionBody,
  UpdateTransactionBody,
} from './types';

export async function getTransactions(params: {
  accountId: string;
  startDate: string;
  endDate: string;
}): Promise<Transaction[]> {
  const query = new URLSearchParams(params).toString();
  const res = await request<Transaction[]>(`/transactions?${query}`);
  if (res.error) throw new Error(res.error);
  return res.data ?? [];
}

export async function createTransaction(
  body: CreateTransactionBody,
): Promise<Transaction> {
  const res = await request<Transaction>('/transactions', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (res.error) throw new Error(res.error);
  if (!res.data) throw new Error('No data returned');
  return res.data;
}

export async function updateTransaction(
  id: string,
  body: UpdateTransactionBody,
): Promise<Transaction> {
  const res = await request<Transaction>(`/transactions/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  if (res.error) throw new Error(res.error);
  if (!res.data) throw new Error('No data returned');
  return res.data;
}

export async function deleteTransaction(id: string): Promise<void> {
  const res = await request<null>(`/transactions/${id}`, { method: 'DELETE' });
  if (res.error) throw new Error(res.error);
}

// ---------------------------------------------------------------------------
// Recurring
// ---------------------------------------------------------------------------

import type {
  Recurring,
  Override,
  CreateRecurringBody,
  UpdateRecurringBody,
  CreateOverrideBody,
  DetectResult,
} from './types';

export async function getRecurring(accountId: string): Promise<Recurring[]> {
  const res = await request<Recurring[]>(`/recurring?accountId=${accountId}`);
  if (res.error) throw new Error(res.error);
  return res.data ?? [];
}

export async function createRecurring(
  body: CreateRecurringBody,
): Promise<Recurring> {
  const res = await request<Recurring>('/recurring', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (res.error) throw new Error(res.error);
  if (!res.data) throw new Error('No data returned');
  return res.data;
}

export async function updateRecurring(
  id: string,
  body: UpdateRecurringBody,
): Promise<Recurring> {
  const res = await request<Recurring>(`/recurring/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  if (res.error) throw new Error(res.error);
  if (!res.data) throw new Error('No data returned');
  return res.data;
}

export async function deleteRecurring(id: string): Promise<void> {
  const res = await request<null>(`/recurring/${id}`, { method: 'DELETE' });
  if (res.error) throw new Error(res.error);
}

export async function detectRecurringPatterns(
  accountId: string,
): Promise<DetectResult> {
  const res = await request<DetectResult>('/recurring/detect', {
    method: 'POST',
    body: JSON.stringify({ accountId }),
  });
  if (res.error) throw new Error(String(res.error));
  if (!res.data) throw new Error('No data returned');
  return res.data;
}

export async function getOverrides(recurringId: string): Promise<Override[]> {
  const res = await request<Override[]>(`/recurring/${recurringId}/overrides`);
  if (res.error) throw new Error(res.error);
  return res.data ?? [];
}

export async function createOverride(
  recurringId: string,
  originalDate: string,
  body: CreateOverrideBody,
): Promise<Override> {
  const res = await request<Override>(
    `/recurring/${recurringId}/overrides/${originalDate}`,
    { method: 'POST', body: JSON.stringify(body) },
  );
  if (res.error) throw new Error(res.error);
  if (!res.data) throw new Error('No data returned');
  return res.data;
}

export async function deleteOverride(
  recurringId: string,
  originalDate: string,
): Promise<void> {
  const res = await request<null>(
    `/recurring/${recurringId}/overrides/${originalDate}`,
    { method: 'DELETE' },
  );
  if (res.error) throw new Error(res.error);
}

// ---------------------------------------------------------------------------
// Forecast
// ---------------------------------------------------------------------------

import type { ForecastDay } from './types';

export async function getForecast(params: {
  accountId: string;
  startDate: string;
  endDate: string;
}): Promise<ForecastDay[]> {
  const query = new URLSearchParams(params).toString();
  const res = await request<ForecastDay[]>(`/forecast?${query}`);
  if (res.error) throw new Error(res.error);
  return res.data ?? [];
}

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

import type { SyncStatusResponse } from './types';

export async function triggerSync(): Promise<void> {
  const res = await request<{ accepted: true }>('/sync', { method: 'POST' });
  if (res.error) throw new Error(res.error);
}

export async function getSyncStatus(): Promise<SyncStatusResponse> {
  const res = await request<SyncStatusResponse>('/sync/status');
  if (res.error) throw new Error(res.error);
  return res.data ?? { lastSync: null, syncsToday: 0, dailyLimit: 24 };
}

// ---------------------------------------------------------------------------
// CSV Import
// ---------------------------------------------------------------------------

import type { ImportBody, ImportResult } from './types';

export async function importTransactions(body: ImportBody): Promise<ImportResult> {
  const res = await request<ImportResult>('/import/csv', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (res.error) throw new Error(String(res.error));
  if (!res.data) throw new Error('No data returned');
  return res.data;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

import type { Setting } from './types';

export async function getSettings(): Promise<Setting[]> {
  const res = await request<Setting[]>('/settings');
  if (res.error) throw new Error(res.error);
  return res.data ?? [];
}

export async function updateSetting(
  key: string,
  value: string,
): Promise<Setting> {
  const res = await request<Setting>(`/settings/${key}`, {
    method: 'PUT',
    body: JSON.stringify({ value }),
  });
  if (res.error) throw new Error(res.error);
  if (!res.data) throw new Error('No data returned');
  return res.data;
}
