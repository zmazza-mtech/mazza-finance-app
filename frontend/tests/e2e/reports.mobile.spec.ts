import { test, expect, fixtureDate } from './fixtures';

/**
 * The phone reports screen.
 *
 * Four components here escaped a narrow viewport by demanding 520–720px and
 * scrolling sideways. The Sankey is the substantive one: a 200x480 canvas with
 * a taller minimum row and at most six named categories, all decided in
 * `buildSankeyLayout` and drawn to match.
 */

test.describe('phone reports', () => {
  test.beforeEach(async ({ page, calendar }) => {
    expect(calendar.accountId).not.toEqual('');
    await page.goto('/reports');

    // The seed lives one month ahead; the screen opens on the current month.
    await page.getByLabel('From').fill(fixtureDate(calendar.month, 1));
    await page.getByLabel('To').fill(fixtureDate(calendar.month, 28));
    await expect(page.getByRole('heading', { name: 'Where the income went' })).toBeVisible();
  });

  test('does not scroll sideways on either chart view', async ({ page }) => {
    const overflow = async () =>
      page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));

    let box = await overflow();
    expect(box.scrollWidth, 'sankey view').toBeLessThanOrEqual(box.clientWidth);

    await page.getByRole('radio', { name: 'Breakdown' }).check();
    await expect(page.getByLabel('Spending breakdown')).toBeVisible();

    box = await overflow();
    expect(box.scrollWidth, 'breakdown view').toBeLessThanOrEqual(box.clientWidth);
  });

  test('draws the Sankey in the narrow column', async ({ page }) => {
    const svg = page.locator('svg[viewBox="0 0 200 480"]');
    await expect(svg).toHaveCount(1);

    // The handoff's phone column. The desktop 560x452 canvas would need the
    // page to pan.
    const box = (await svg.boundingBox())!;
    expect(Math.round(box.width)).toBe(106);
  });

  test('keeps every flow label legible', async ({ page }) => {
    const labels = page.getByLabel('Flow by category').getByRole('listitem');
    await expect(labels.first()).toBeVisible();

    // At most six named categories plus Other plus Kept. More ribbons than
    // that in 480 units cannot carry a readable label.
    const count = await labels.count();
    expect(count).toBeLessThanOrEqual(8);

    for (let i = 0; i < count; i++) {
      const box = (await labels.nth(i).boundingBox())!;
      expect(box.width, `label ${i} is ${box.width}px wide`).toBeGreaterThan(60);
    }
  });

  test('states the income above the diagram rather than beside it', async ({ page }) => {
    // A left-hand label column would leave the ribbons about 60px wide.
    await expect(page.getByText(/^Income \$[\d,]+\.\d{2} →$/)).toBeVisible();
  });

  test('keeps the category column in place while the months pan', async ({
    page,
    calendar,
  }) => {
    await page.getByRole('radio', { name: 'Monthly' }).check();

    // The monthly view has its own month-granularity range; the day range set
    // in beforeEach belongs to the summary view. The seed is next month.
    await page.getByLabel('To').fill(calendar.month);
    await expect(page.getByRole('table')).toBeVisible();

    const header = page.getByRole('columnheader', { name: 'Category' });
    const before = (await header.boundingBox())!.x;

    await page.getByRole('table').evaluate((el) => el.parentElement!.scrollBy(400, 0));

    // Sticky, so comparing a category across months does not mean losing which
    // category you are on — the actual objection to panning a matrix.
    const after = (await header.boundingBox())!.x;
    expect(Math.abs(after - before)).toBeLessThanOrEqual(1);
  });

  test('exports a CSV from the phone', async ({ page }) => {
    // The exports are download links, not buttons — the endpoints answer with
    // a Content-Disposition, so the browser saves rather than navigates.
    const download = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Transactions CSV' }).click();

    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.csv$/);
  });
});
