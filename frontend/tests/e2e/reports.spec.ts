import { readFile } from 'node:fs/promises';
import { test, expect, fixtureDate } from './fixtures';

/**
 * The Reports page against the real API.
 *
 * The two views answer different questions over different time granularities —
 * a Sankey over an arbitrary range, and whole calendar months side by side — so
 * each keeps its own picker and the toggle switches between them. This flow is
 * what proves the toggle actually swaps both the view and its control, which no
 * component test can see.
 *
 * The seed lives one month ahead: a paycheck of 2400.00 filed as Income, and
 * rent of -1250.00 that the keyword map cannot place. Net for that month is
 * 1150.00.
 */

/** `2026-08` as the column header renders it, `Aug 2026`. */
function monthHeader(month: string): string {
  const [year, index] = month.split('-').map(Number) as [number, number];
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${names[index - 1]} ${year}`;
}

test.describe('reports', () => {
  // `calendar` is requested for its side effect: it seeds an account and pins
  // it as the selection before the app loads. Without it the page would report
  // on whichever account sorts first, which is some other test's.
  test('opens on the breakdown view', async ({ page, calendar: _calendar }) => {
    await page.goto('/reports');

    await expect(page.getByRole('radio', { name: 'Breakdown' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(page.getByRole('heading', { name: 'Where the income went' })).toBeVisible();
  });

  test('switches to whole calendar months', async ({ page, calendar: _calendar }) => {
    await page.goto('/reports');
    await page.getByRole('radio', { name: 'Monthly' }).click();

    // The day-level picker is gone with the view it belonged to.
    await expect(page.getByRole('heading', { name: 'Month over month' })).toBeVisible();
    await expect(page.getByLabel('To')).toHaveAttribute('type', 'month');
  });

  test('reports a month’s income, expenses and net', async ({ page, calendar }) => {
    await page.goto('/reports');
    await page.getByRole('radio', { name: 'Monthly' }).click();

    // The seed is next month; the default range ends on this one.
    await page.getByLabel('To').fill(calendar.month);

    await expect(
      page.getByRole('columnheader', { name: monthHeader(calendar.month) }),
    ).toBeVisible();
    await expect(page.getByRole('row', { name: /^Net/ })).toContainText('$1,150.00');
  });

  test('carries a category across the months it appears in', async ({ page, calendar }) => {
    await page.goto('/reports');
    await page.getByRole('radio', { name: 'Monthly' }).click();
    await page.getByLabel('To').fill(calendar.month);

    const row = page.getByRole('row', { name: /Income/ });
    await expect(row).toContainText('$2,400.00');
  });
});

test.describe('csv export', () => {
  test('exports the transactions on screen, quoting included', async ({ page, calendar }) => {
    await page.goto('/reports');

    // The seed lives one month ahead; the breakdown opens on the current month.
    await page.getByLabel('From').fill(fixtureDate(calendar.month, 1));
    await page.getByLabel('To').fill(fixtureDate(calendar.month, 28));

    const downloading = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Transactions CSV' }).click();
    const download = await downloading;

    const path = await download.path();
    const csv = await readFile(path, 'utf8');

    expect(csv.split('\n')[0]).toBe('date,description,amount,category');
    expect(csv).toContain('E2E Fixture Rent');
    expect(csv).toContain('-1250.00');
  });

  test('names the file after the range it covers', async ({ page, calendar }) => {
    await page.goto('/reports');
    await page.getByLabel('From').fill(fixtureDate(calendar.month, 1));
    await page.getByLabel('To').fill(fixtureDate(calendar.month, 28));

    const downloading = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Category summary CSV' }).click();
    const download = await downloading;

    expect(download.suggestedFilename()).toBe(
      `category-summary-${fixtureDate(calendar.month, 1)}-to-${fixtureDate(calendar.month, 28)}.csv`,
    );
  });
});
