import {
  test,
  expect,
  RECURRING,
  expectedRecurringBalance,
  fixtureDate,
  formatBalance,
  overrideInstance,
} from './fixtures';
import type { Page } from '@playwright/test';

/**
 * The PRD's recurring management flow (§10, "Testing — Frontend"; §5.3 for the
 * page itself): confirm a detected series, edit a series, override a single
 * instance, delete a series — each one measured on the calendar rather than on
 * the recurring page, because the calendar is where a wrong answer costs money.
 *
 * Every balance is an exact rendered string, hand-computed from the fixture.
 * A shifted-by-a-cent forecast is exactly the failure decimal.js exists to
 * prevent, and a greater-than assertion would sail past it.
 *
 * Each scenario re-seeds, so each one starts from the same arithmetic. The
 * alternative — one flow that confirms, edits, overrides and deletes in
 * sequence — would make every balance depend on the step before it, and a
 * failure in the middle would say nothing about which step was wrong.
 */

/** Days the seed leaves empty either side of the active series. */
const BEFORE_SERIES_DAY = 3;
const RENT_DAY = 10;
const PAYCHECK_DAY = 20;

// --- Confirming the pending series ------------------------------------------
// The pending series is −15.00 on day 25, so it lands after the paycheck.
const AFTER_CONFIRM = '6075.00'; // 6090.00 − 15.00

// --- Editing the active series ----------------------------------------------
const EDITED_AMOUNT = '75.00'; // was 60.00
const EDITED_SERIES_DAY = '4925.00'; // 5000.00 − 75.00
const EDITED_RENT_DAY = '3675.00'; // 4925.00 − 1250.00
const EDITED_PAYCHECK_DAY = '6075.00'; // 3675.00 + 2400.00
const EDITED_FOLLOWING = '6000.00'; // 6075.00 − 75.00

// --- Overriding one instance -------------------------------------------------
const OVERRIDE_AMOUNT = '-10.00'; // this instance only; the series stays −60.00
const OVERRIDDEN_SERIES_DAY = '4990.00'; // 5000.00 − 10.00
// The override lifts every later day by the 50.00 it did not spend, so the
// following month opens 50.00 higher and its own instance still costs 60.00.
const FOLLOWING_BEFORE_SERIES = '6140.00'; // 6090.00 + 50.00
const FOLLOWING_AFTER_SERIES = '6080.00'; // 6140.00 − 60.00

// --- Deleting the active series ----------------------------------------------
// With the series gone the walk is the plain seed again.
const DELETED_SERIES_DAY = '5000.00';
const DELETED_RENT_DAY = '3750.00'; // 5000.00 − 1250.00
const DELETED_PAYCHECK_DAY = '6150.00'; // 3750.00 + 2400.00

/** The running balance rendered in a given day's cell. */
function cellBalance(page: Page, date: string, amount: string) {
  return page.locator(`[data-date="${date}"]`).getByText(formatBalance(amount), { exact: true });
}

/** Walks the calendar forward from the current month, which is where it opens. */
async function showMonthsAhead(page: Page, months: number): Promise<void> {
  for (let i = 0; i < months; i += 1) {
    await page.getByRole('button', { name: 'Next month' }).click();
  }
}

/** Opens the day panel on a date and returns it. */
async function openDay(page: Page, date: string) {
  await page.locator(`[data-date="${date}"]`).click();
  return page.getByRole('complementary');
}

/** The panel row for a named series on the open day. */
function panelRow(page: Page, name: string) {
  return page.getByRole('complementary').getByRole('listitem').filter({ hasText: name });
}

/**
 * The named series' row in the recurring list.
 *
 * The whole row, not its name cell: the actions cell carries the name too, in
 * the aria-labels on its buttons, so a cell-level match is ambiguous.
 */
function seriesRow(page: Page, name: string) {
  return page.getByRole('row').filter({ hasText: name });
}

test.describe('recurring management', () => {
  test('confirming a pending series puts it into the forecast', async ({ page, recurring }) => {
    const pendingDate = fixtureDate(recurring.month, RECURRING.pending.day);

    await page.goto('/');
    await showMonthsAhead(page, 1);

    // Pending means withheld: the day carries the seed's balance and the series
    // is nowhere on it. PRD §5.3 — "Pending items do NOT appear in the forecast
    // until explicitly confirmed".
    await expect(
      cellBalance(page, pendingDate, expectedRecurringBalance(RECURRING.pending.day)),
    ).toBeVisible();
    await openDay(page, pendingDate);
    await expect(panelRow(page, RECURRING.pending.name)).toHaveCount(0);

    await page.getByRole('link', { name: 'Recurring' }).click();

    const review = page.getByRole('region', { name: 'Pending review' });
    await expect(review.getByText(RECURRING.pending.name)).toBeVisible();
    await review.getByRole('button', { name: `Confirm ${RECURRING.pending.name}` }).click();

    // Confirmed items leave the review section for the list proper, active.
    await expect(review).toBeHidden();
    await expect(seriesRow(page, RECURRING.pending.name)).toContainText('Active');

    await page.getByRole('link', { name: 'Calendar' }).click();
    await showMonthsAhead(page, 1);

    await expect(cellBalance(page, pendingDate, AFTER_CONFIRM)).toBeVisible();
    await openDay(page, pendingDate);
    await expect(panelRow(page, RECURRING.pending.name)).toHaveCount(1);
  });

  test('editing a series moves every future instance', async ({ page, recurring }) => {
    const seriesDate = fixtureDate(recurring.month, RECURRING.active.day);
    const followingDate = fixtureDate(recurring.followingMonth, RECURRING.active.day);

    await page.goto('/');
    await page.getByRole('link', { name: 'Recurring' }).click();

    await page.getByRole('button', { name: `Edit ${RECURRING.active.name}` }).click();
    const modal = page.getByRole('dialog');
    await modal.getByLabel('Amount in dollars').fill(EDITED_AMOUNT);
    await modal.getByRole('button', { name: 'Save Changes' }).click();
    await expect(modal).toBeHidden();

    await page.getByRole('link', { name: 'Calendar' }).click();
    await showMonthsAhead(page, 1);

    // The instance itself, and every day the series carried afterwards.
    await expect(cellBalance(page, seriesDate, EDITED_SERIES_DAY)).toBeVisible();
    await expect(
      cellBalance(page, fixtureDate(recurring.month, RENT_DAY), EDITED_RENT_DAY),
    ).toBeVisible();
    await expect(
      cellBalance(page, fixtureDate(recurring.month, PAYCHECK_DAY), EDITED_PAYCHECK_DAY),
    ).toBeVisible();

    // "All future instances", not just the next one — the month after moves too.
    await showMonthsAhead(page, 1);
    await expect(cellBalance(page, followingDate, EDITED_FOLLOWING)).toBeVisible();
  });

  test('overriding one instance leaves the following one alone', async ({ page, recurring }) => {
    const seriesDate = fixtureDate(recurring.month, RECURRING.active.day);
    const followingDate = fixtureDate(recurring.followingMonth, RECURRING.active.day);

    await page.goto('/');
    await showMonthsAhead(page, 1);
    await expect(
      cellBalance(page, seriesDate, expectedRecurringBalance(RECURRING.active.day)),
    ).toBeVisible();

    // Written through the API, not the UI — see overrideInstance and issue #26.
    await overrideInstance(recurring.activeSeriesId, seriesDate, {
      overrideType: 'modified',
      overrideAmount: OVERRIDE_AMOUNT,
    });
    await page.reload();
    await showMonthsAhead(page, 1);

    // The overridden day carries the override's amount...
    await expect(cellBalance(page, seriesDate, OVERRIDDEN_SERIES_DAY)).toBeVisible();
    await openDay(page, seriesDate);
    await expect(panelRow(page, RECURRING.active.name)).toContainText('−$10.00');

    // ...and the next instance is untouched: still the series amount, on a day
    // whose balance moved only by the 50.00 the override left unspent.
    await showMonthsAhead(page, 1);
    await expect(
      cellBalance(
        page,
        fixtureDate(recurring.followingMonth, RECURRING.active.day - 1),
        FOLLOWING_BEFORE_SERIES,
      ),
    ).toBeVisible();
    await expect(cellBalance(page, followingDate, FOLLOWING_AFTER_SERIES)).toBeVisible();
    await openDay(page, followingDate);
    await expect(panelRow(page, RECURRING.active.name)).toContainText('−$60.00');
  });

  test('deleting a series clears its future occurrences', async ({ page, recurring }) => {
    const seriesDate = fixtureDate(recurring.month, RECURRING.active.day);
    const followingDate = fixtureDate(recurring.followingMonth, RECURRING.active.day);

    await page.goto('/');
    await page.getByRole('link', { name: 'Recurring' }).click();

    await page.getByRole('button', { name: `Delete ${RECURRING.active.name}` }).click();

    // PRD §5.3 — deleting a series is confirmed before it happens.
    const confirm = page.getByRole('dialog');
    await expect(confirm.getByText('Delete recurring transaction?')).toBeVisible();
    await confirm.getByRole('button', { name: 'Delete' }).click();
    await expect(confirm).toBeHidden();
    await expect(seriesRow(page, RECURRING.active.name)).toHaveCount(0);

    await page.getByRole('link', { name: 'Calendar' }).click();
    await showMonthsAhead(page, 1);

    // Every day walks the seed alone again, from before the series' day through
    // the two seeded transactions.
    await expect(
      cellBalance(
        page,
        fixtureDate(recurring.month, BEFORE_SERIES_DAY),
        expectedRecurringBalance(BEFORE_SERIES_DAY),
      ),
    ).toBeVisible();
    await expect(cellBalance(page, seriesDate, DELETED_SERIES_DAY)).toBeVisible();
    await expect(
      cellBalance(page, fixtureDate(recurring.month, RENT_DAY), DELETED_RENT_DAY),
    ).toBeVisible();
    await expect(
      cellBalance(page, fixtureDate(recurring.month, PAYCHECK_DAY), DELETED_PAYCHECK_DAY),
    ).toBeVisible();

    await openDay(page, seriesDate);
    await expect(panelRow(page, RECURRING.active.name)).toHaveCount(0);

    // And the series is gone from the months after it, not just this one.
    await showMonthsAhead(page, 1);
    await expect(cellBalance(page, followingDate, DELETED_PAYCHECK_DAY)).toBeVisible();
  });
});
