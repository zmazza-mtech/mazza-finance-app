import { test, expect, seedTransaction } from './fixtures';

/**
 * PRD §10, "Balance Health Banner": the banner scans the forecast for the first
 * day in yellow or red within 30 days, and its link takes the user to that day.
 *
 * The link half is what this covers. It spans three pieces that only meet at
 * runtime — the banner finding the day, the page moving the month, and the
 * calendar selecting and focusing the cell — so a unit test on any one of them
 * cannot show the chain works.
 */

/** A date `days` from today, in the same timezone the browser and app use. */
function isoOffsetFromToday(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Far enough ahead to be inside the banner's 30-day scan and usually in the
 * following month, so the link normally has to cross a month boundary as well
 * as move the selection. Run near the start of a month it stays in-month, and
 * the flow still holds — it just exercises one fewer step.
 */
const DIP_DATE = isoOffsetFromToday(25);

/**
 * Large enough to put the running balance under any configured threshold. The
 * fixture account opens at $5,000.00, so this leaves $50.00.
 */
const DIP_AMOUNT = '-4950.00';

test.describe('balance alert banner', () => {
  test('the View link takes the calendar to the at-risk day', async ({ page, calendar }) => {
    await seedTransaction(calendar.accountId, {
      date: DIP_DATE,
      description: 'E2E Fixture Large Debit',
      amount: DIP_AMOUNT,
    });

    await page.goto('/');

    const banner = page.getByRole('alert').filter({ hasText: /balance is projected to reach/ });
    await expect(banner).toBeVisible();

    // The date itself is the control. Everything in the banner except the
    // dismiss button is the link to the at-risk day.
    await banner.getByRole('button').filter({ hasNotText: 'Dismiss' }).click();

    const dipCell = page.locator(`[data-date="${DIP_DATE}"]`);
    await expect(dipCell).toBeVisible();
    await expect(dipCell).toHaveAttribute('aria-selected', 'true');
    await expect(dipCell).toBeFocused();
  });

  test('no banner is shown while the balance stays healthy', async ({ page, calendar }) => {
    // The calendar fixture on its own never drops below the default thresholds.
    void calendar;

    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Next month' })).toBeVisible();

    await expect(
      page.getByRole('alert').filter({ hasText: /balance is projected to reach/ }),
    ).toHaveCount(0);
  });
});
