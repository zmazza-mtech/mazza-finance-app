import { test, expect, expectedBalance, fixtureDate, formatBalance } from './fixtures';
import type { Page } from '@playwright/test';

/**
 * The PRD's first E2E flow: view the calendar, add a transaction, verify the
 * balance updates (§10, "Testing — Frontend").
 *
 * Every balance is asserted as an exact rendered string. A greater-than
 * comparison would pass just as happily against arithmetic that had lost a cent,
 * which is the class of bug this whole codebase's decimal.js rule exists to
 * prevent.
 */

/** The day the flow adds its transaction to — between the two seeded ones. */
const ENTRY_DAY = 15;
/** A day after the entry, whose balance must shift by the same amount. */
const LATER_DAY = 25;
/** A day before the entry, whose balance must not move at all. */
const EARLIER_DAY = 5;

const ENTRY_DESCRIPTION = 'E2E Coffee Fund';
const ENTRY_AMOUNT = '137.25';

// Hand-computed from the fixture. Debits reduce the running balance from the
// entry day onwards and leave every earlier day alone.
const ENTRY_DAY_AFTER = '3612.75'; // 3750.00 − 137.25
const LATER_DAY_AFTER = '6012.75'; // 6150.00 − 137.25

/** The running balance rendered in a given day's cell. */
function cellBalance(page: Page, date: string, amount: string) {
  return page.locator(`[data-date="${date}"]`).getByText(formatBalance(amount), { exact: true });
}

test.describe('calendar', () => {
  test('adding a transaction shifts that day and every later day', async ({
    page,
    calendar,
  }) => {
    const entryDate = fixtureDate(calendar.month, ENTRY_DAY);

    await page.goto('/');

    // The fixture data lives one month ahead, so the seeded balances are not
    // tangled with whatever the current month happens to hold.
    await page.getByRole('button', { name: 'Next month' }).click();
    await expect(page.locator(`[data-date="${entryDate}"]`)).toBeVisible();

    // The seed renders as expected before anything is added — otherwise a later
    // failure cannot distinguish a bad entry from a bad fixture.
    await expect(
      cellBalance(page, fixtureDate(calendar.month, EARLIER_DAY), expectedBalance(EARLIER_DAY)),
    ).toBeVisible();
    await expect(
      cellBalance(page, entryDate, expectedBalance(ENTRY_DAY)),
    ).toBeVisible();
    await expect(
      cellBalance(page, fixtureDate(calendar.month, LATER_DAY), expectedBalance(LATER_DAY)),
    ).toBeVisible();

    // Select the day, then add through the panel's entry point.
    await page.locator(`[data-date="${entryDate}"]`).click();

    const panel = page.getByRole('complementary');
    await expect(panel.getByText(formatBalance(expectedBalance(ENTRY_DAY)))).toBeVisible();
    await panel.getByRole('button', { name: 'Add transaction' }).click();

    const modal = page.getByRole('dialog');
    await modal.getByLabel('Description').fill(ENTRY_DESCRIPTION);
    await modal.getByLabel('Amount in dollars').fill(ENTRY_AMOUNT);
    await modal.getByRole('radio', { name: 'Debit (money out)' }).check();
    await modal.getByRole('button', { name: 'Add transaction' }).click();
    await expect(modal).toBeHidden();

    // The entry day and every later day move by exactly the debit.
    await expect(cellBalance(page, entryDate, ENTRY_DAY_AFTER)).toBeVisible();
    await expect(
      cellBalance(page, fixtureDate(calendar.month, LATER_DAY), LATER_DAY_AFTER),
    ).toBeVisible();

    // Earlier days do not.
    await expect(
      cellBalance(page, fixtureDate(calendar.month, EARLIER_DAY), expectedBalance(EARLIER_DAY)),
    ).toBeVisible();

    // And the transaction itself is on the day it was entered on, carrying the
    // amount as a debit. Scoped to its own row — the day-net tile reads the
    // same figure, and matching either one would prove less.
    const entryRow = panel.getByRole('listitem').filter({ hasText: ENTRY_DESCRIPTION });
    await expect(entryRow).toHaveCount(1);
    await expect(entryRow.getByText(`−$${ENTRY_AMOUNT}`)).toBeVisible();
  });

  test('today is marked in the current month', async ({ page, calendar }) => {
    // Seeded through the fixture so an account exists to select; this flow reads
    // the current month rather than the fixture month.
    expect(calendar.accountId).not.toEqual('');

    await page.goto('/');

    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
      now.getDate(),
    ).padStart(2, '0')}`;

    await expect(page.locator(`[data-date="${today}"]`)).toHaveAttribute(
      'aria-label',
      `${today}, today`,
    );
  });
});
