import { test, expect, fixtureDate } from './fixtures';

/**
 * The Transactions screen against the real API.
 *
 * The unit tests could not catch #34 — the Source column rendering an empty
 * pill — because they build their own fixtures from the `Transaction` type, and
 * the type was the thing that was wrong. Only a run against the real payload
 * can tell whether the column is populated, so that is what this flow does.
 */

/** The seeded transactions, both created through `POST /transactions`. */
const SEEDED_DESCRIPTIONS = ['E2E Fixture Rent', 'E2E Fixture Paycheck'];

test.describe('transactions', () => {
  test('every row names where it came from', async ({ page, calendar }) => {
    await page.goto('/transactions');

    // The seed lives one month ahead; the screen opens on the current month.
    await page.getByLabel('From').fill(fixtureDate(calendar.month, 1));
    await page.getByLabel('To').fill(fixtureDate(calendar.month, 28));

    for (const description of SEEDED_DESCRIPTIONS) {
      const row = page.getByRole('row').filter({ hasText: description });
      await expect(row).toBeVisible();
      await expect(row.getByLabel(/^Transaction source: /)).toHaveText('Manual');
    }
  });

  test('renders no badge labelled with an undefined field', async ({ page, calendar }) => {
    await page.goto('/transactions');

    await page.getByLabel('From').fill(fixtureDate(calendar.month, 1));
    await page.getByLabel('To').fill(fixtureDate(calendar.month, 28));

    await expect(
      page.getByRole('row').filter({ hasText: SEEDED_DESCRIPTIONS[0]! }),
    ).toBeVisible();

    await expect(page.locator('[aria-label*="undefined"]')).toHaveCount(0);
  });
});
