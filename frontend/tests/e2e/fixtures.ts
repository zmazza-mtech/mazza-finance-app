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
 *
 * The recurring seed keeps both. Its series start in the fixture month, so they
 * generate nothing in the past — and the opening-balance back-calculation only
 * ever subtracts real transactions, never forecast instances, so a series could
 * not disturb it in any case.
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

/**
 * The two recurring series the recurring and keyboard flows share.
 *
 * Both are monthly and both fall on days the seed leaves empty, so each one
 * lands alone in its cell and an assertion on that cell can only be about the
 * series.
 *
 * `active` is the series every scenario acts on. It is monthly rather than a
 * one-off so the fixture month holds one instance and the month after holds the
 * next — the pair the single-instance override is measured against.
 *
 * `pending` starts in `pending_review`, which keeps it out of the forecast
 * until the flow confirms it.
 */
export const RECURRING = {
  active: { name: 'E2E Fixture Gym', amount: '-60.00', day: 5 },
  pending: { name: 'E2E Fixture Streaming', amount: '-15.00', day: 25 },
} as const;

export interface RecurringFixture extends CalendarFixture {
  /** The active monthly series, present in the forecast from the start. */
  activeSeriesId: string;
  /** The `pending_review` series, absent from the forecast until confirmed. */
  pendingSeriesId: string;
  /** The month after the fixture month, holding the active series' next instance. */
  followingMonth: string;
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

// The same walk with the active recurring series in it, and the pending one
// still withheld. Hand-computed from OPENING_BALANCE, SEEDED and RECURRING.
const WITH_GYM = {
  beforeGym: '5000.00', // days 1–4
  afterGym: '4940.00', // days 5–9: 5000.00 − 60.00
  afterRent: '3690.00', // days 10–19: 4940.00 − 1250.00
  afterPaycheck: '6090.00', // days 20 onwards: 3690.00 + 2400.00
} as const;

/**
 * The running balance for a day of the fixture month with the recurring seed in
 * place — the active series charged, the pending one not.
 */
export function expectedRecurringBalance(dayOfMonth: number): string {
  if (dayOfMonth < RECURRING.active.day) return WITH_GYM.beforeGym;
  if (dayOfMonth < 10) return WITH_GYM.afterGym;
  if (dayOfMonth < 20) return WITH_GYM.afterRent;
  return WITH_GYM.afterPaycheck;
}

/** `YYYY-MM-DD` for a day of the fixture month. */
export function fixtureDate(month: string, dayOfMonth: number): string {
  return `${month}-${String(dayOfMonth).padStart(2, '0')}`;
}

/** The month after a `YYYY-MM`. */
export function monthAfter(month: string): string {
  const [year, m] = month.split('-').map(Number) as [number, number];
  const d = new Date(year, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
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
 * Adds the two recurring series to an already-seeded account.
 *
 * The pending one is created and then moved to `pending_review`, because
 * `POST /recurring` only ever writes `active` — auto-detection is the only
 * path that produces a pending row, and driving detection here would tie the
 * fixture to the detector's thresholds rather than to the review flow the test
 * is about.
 */
async function seedRecurring(
  accountId: string,
  month: string,
): Promise<{ activeSeriesId: string; pendingSeriesId: string }> {
  const active = await api<{ id: string }>('/recurring', {
    method: 'POST',
    body: JSON.stringify({
      accountId,
      name: RECURRING.active.name,
      amount: RECURRING.active.amount,
      frequency: 'monthly',
      nextDate: fixtureDate(month, RECURRING.active.day),
    }),
  });

  const pending = await api<{ id: string }>('/recurring', {
    method: 'POST',
    body: JSON.stringify({
      accountId,
      name: RECURRING.pending.name,
      amount: RECURRING.pending.amount,
      frequency: 'monthly',
      nextDate: fixtureDate(month, RECURRING.pending.day),
    }),
  });

  await api(`/recurring/${pending.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'pending_review' }),
  });

  return { activeSeriesId: active.id, pendingSeriesId: pending.id };
}

/**
 * Adds one transaction to an already-seeded account.
 *
 * Created through `POST /transactions` like the rest of the seed, so it goes
 * through the same auto-categorization the real path does — a description the
 * keyword map cannot place arrives uncategorized, which is the state the
 * review surface exists for.
 */
export async function seedTransaction(
  accountId: string,
  tx: { date: string; description: string; amount: string },
): Promise<string> {
  const created = await api<{ id: string }>('/transactions', {
    method: 'POST',
    body: JSON.stringify({ accountId, ...tx }),
  });
  return created.id;
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

export const test = base.extend<{
  calendar: CalendarFixture;
  recurring: RecurringFixture;
}>({
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

  /*
   * Layered on the calendar fixture rather than seeded beside it, so the
   * recurring series are charged against balances the calendar flow already
   * proves — a recurring assertion that fails is then about recurring, not
   * about the seed underneath it.
   *
   * Series need no teardown: they are account-scoped and every test seeds its
   * own account, so nothing they leave behind is reachable from another test.
   * The stack's database is discarded at the end of the run in any case.
   */
  recurring: async ({ calendar }, use) => {
    const series = await seedRecurring(calendar.accountId, calendar.month);
    await use({
      ...calendar,
      ...series,
      followingMonth: monthAfter(calendar.month),
    });
  },
});

export { expect };
