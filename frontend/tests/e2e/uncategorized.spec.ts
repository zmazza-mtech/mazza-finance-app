import { test, expect, fixtureDate, seedTransaction } from './fixtures';

/**
 * The uncategorized review surface on Settings, against the real API.
 *
 * The grouping is the feature, and it only exists end to end: the endpoint
 * groups by normalized description, the section lists a group, and assigning
 * one posts that same normalized description back to batch-categorize. A unit
 * test can prove any one of those three; only a run against the real stack
 * proves the key survives the round trip.
 *
 * The endpoint is deliberately not account-scoped — bulk assignment is not
 * either — so every merchant here carries a per-run suffix and each assertion
 * names its own group. Nothing a parallel worker seeds can collide.
 */

/** A merchant no keyword in the map can place, unique to this run. */
function uniqueMerchant(): string {
  return `E2EUNCAT${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

test.describe('uncategorized review', () => {
  test('collapses one merchant into a single group', async ({ page, calendar }) => {
    const merchant = uniqueMerchant();
    await seedTransaction(calendar.accountId, {
      date: fixtureDate(calendar.month, 3),
      description: `DBT CRD 0407 27105864 ${merchant}`,
      amount: '-12.00',
    });
    await seedTransaction(calendar.accountId, {
      date: fixtureDate(calendar.month, 4),
      description: `DBT CRD 0937 88104412 ${merchant}`,
      amount: '-18.00',
    });

    await page.goto('/settings');

    const row = page.getByRole('listitem').filter({ hasText: merchant });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('2 transactions');
    await expect(row).toContainText('-$30.00');
  });

  test('assigning a group files every transaction in it', async ({ page, calendar }) => {
    const merchant = uniqueMerchant();
    await seedTransaction(calendar.accountId, {
      date: fixtureDate(calendar.month, 3),
      description: `DBT CRD 0407 27105864 ${merchant}`,
      amount: '-12.00',
    });
    await seedTransaction(calendar.accountId, {
      date: fixtureDate(calendar.month, 4),
      description: `DBT CRD 0937 88104412 ${merchant}`,
      amount: '-18.00',
    });

    await page.goto('/settings');
    await page.getByLabel(`Category for ${merchant}`).selectOption('Dining');

    // The group is gone from the review surface once nothing in it is
    // uncategorized.
    await expect(page.getByRole('listitem').filter({ hasText: merchant })).toHaveCount(0);

    // And both transactions carry the category, not just the one that named it.
    await page.goto('/transactions');
    await page.getByLabel('From').fill(fixtureDate(calendar.month, 1));
    await page.getByLabel('To').fill(fixtureDate(calendar.month, 28));

    const rows = page.getByRole('row').filter({ hasText: merchant });
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toContainText('Dining');
    await expect(rows.last()).toContainText('Dining');
  });
});
