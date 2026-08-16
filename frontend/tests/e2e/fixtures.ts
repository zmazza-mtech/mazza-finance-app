import { test as base, expect } from '@playwright/test';
import { API_URL } from './stack';

/**
 * Seeded data for the E2E flows, and the exact balances it implies.
 *
 * The balances the calendar renders are asserted as exact strings, so the seed
 * has to be arithmetic anyone can check by hand rather than a value read back
 * out of the app.
 *
 * Two properties make that possible:
 *
 *   1. Every seeded transaction lands in *next* month. The forecast endpoint
 *      back-calculates the opening balance by subtracting transactions dated on
 *      or before the server's today from the account's last known balance. With
 *      nothing in the past, that subtraction is zero and the opening balance is
 *      exactly OPENING_BALANCE — no dependence on which day the suite runs, or
 *      on the container clock agreeing with the host's.
 *   2. Each test gets its own account, and the browser is told which one to
 *      select before the app loads. Tests never compete over "the first
 *      account", so they stay independent of each other and of run order.
 */

/** The account's last known balance, and therefore every day's opening balance. */
const OPENING_BALANCE = '5000.00';

const SEEDED = [
  { day: 10, description: 'E2E Fixture Rent', amount: '-1250.00' },
  { day: 20, description: 'E2E Fixture Paycheck', amount: '2400.00' },
] as const;

// Running balance for each stretch of the fixture month, hand-computed from
// OPENING_BALANCE and SEEDED above.
const BEFORE_RENT = '5000.00'; // days 1–9
const AFTER_RENT = '3750.00'; // days 10–19: 5000.00 − 1250.00
const AFTER_PAYCHECK = '6150.00'; // days 20 onwards: 3750.00 + 2400.00

export interface CalendarFixture {
  /** The account seeded for this test. */
  accountId: string;
  /** The month the fixture data lives in, as `YYYY-MM`. One month ahead of today. */
  month: string;
  /** IDs of every transaction this fixture created, for teardown. */
  transactionIds: string[];
}

// ---------------------------------------------------------------------------
// Expected values
// ---------------------------------------------------------------------------

/** The running balance the fixture implies for a day of the fixture month. */
export function expectedBalance(dayOfMonth: number): string {
  if (dayOfMonth < 10) return BEFORE_RENT;
  if (dayOfMonth < 20) return AFTER_RENT;
  return AFTER_PAYCHECK;
}

/** `YYYY-MM-DD` for a day of the fixture month. */
export function fixtureDate(month: string, dayOfMonth: number): string {
  return `${month}-${String(dayOfMonth).padStart(2, '0')}`;
}

/** The same formatting the calendar applies to a running balance. */
export function formatBalance(amount: string): string {
  const negative = amount.startsWith('-');
  const [whole, cents] = amount.replace('-', '').split('.') as [string, string];
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}$${grouped}.${cents}`;
}

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

/** The month after the current one, in the same timezone the browser uses. */
function nextMonth(): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });

  if (response.status === 204) return undefined as T;

  const body = (await response.json()) as { data: T; error: unknown };
  if (!response.ok || body.error) {
    throw new Error(
      `${init?.method ?? 'GET'} ${path} failed (${response.status}): ${JSON.stringify(body.error)}`,
    );
  }
  return body.data;
}

async function seed(): Promise<CalendarFixture> {
  const month = nextMonth();

  const account = await api<{ id: string }>('/accounts', {
    method: 'POST',
    body: JSON.stringify({
      institution: 'E2E Test Bank',
      name: `E2E Checking ${Date.now()}`,
      type: 'checking',
    }),
  });

  // POST /accounts cannot set a balance; the forecast needs one to seed from.
  await api(`/accounts/${account.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ lastBalance: OPENING_BALANCE }),
  });

  const transactionIds: string[] = [];
  for (const tx of SEEDED) {
    const created = await api<{ id: string }>('/transactions', {
      method: 'POST',
      body: JSON.stringify({
        accountId: account.id,
        date: fixtureDate(month, tx.day),
        description: tx.description,
        amount: tx.amount,
      }),
    });
    transactionIds.push(created.id);
  }

  return { accountId: account.id, month, transactionIds };
}

/**
 * Removes every transaction on the fixture account, including any the test
 * created through the UI.
 *
 * Deleting by account rather than by remembered ID is deliberate: a test that
 * adds a transaction and then fails partway through still leaves nothing
 * behind. Accounts themselves have no delete endpoint — the stack's database is
 * discarded wholesale at the end of the run, so they need none.
 */
async function teardown(accountId: string): Promise<void> {
  const remaining = await api<{ id: string; type: string }[]>(
    `/transactions?accountId=${accountId}`,
  );

  for (const tx of remaining) {
    if (tx.type === 'manual') {
      await api(`/transactions/${tx.id}`, { method: 'DELETE' });
    }
  }
}

// ---------------------------------------------------------------------------
// Playwright fixture
// ---------------------------------------------------------------------------

/** localStorage key the app reads the selected account from. */
const ACCOUNT_KEY = 'mazza-selected-account';

export const test = base.extend<{ calendar: CalendarFixture }>({
  calendar: async ({ page }, use) => {
    const fixture = await seed();

    // Pin the selection before any app code runs. Left to itself the app picks
    // whichever bank account sorts first, which is not this test's.
    await page.addInitScript(
      ([key, id]) => window.localStorage.setItem(key!, id!),
      [ACCOUNT_KEY, fixture.accountId],
    );

    try {
      await use(fixture);
    } finally {
      await teardown(fixture.accountId);
    }
  },
});

export { expect };
