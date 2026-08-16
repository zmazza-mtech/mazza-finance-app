import { test, expect, expectedBalance, fixtureDate, formatBalance } from './fixtures';

/**
 * The phone calendar: a compact grid, and the day detail as a bottom sheet.
 *
 * On desktop, selecting a day updates a persistent panel. On a phone it opens
 * something modal, which makes "selected" and "open" two different pieces of
 * state — most of what is asserted here is about keeping those two straight.
 */

const ENTRY_DAY = 15;
const ENTRY_DESCRIPTION = 'E2E Phone Coffee';
const ENTRY_AMOUNT = '42.50';
const ENTRY_DAY_AFTER = '3707.50'; // 3750.00 − 42.50

/** The compact form the phone cell renders: no cents, no dollar sign. */
function compact(amount: string): string {
  return Math.round(Number(amount)).toLocaleString('en-US');
}

test.describe('phone calendar', () => {
  test('cells stay compact and the grid does not overflow', async ({ page, calendar }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Next month' }).click();

    const cell = page.locator(`[data-date="${fixtureDate(calendar.month, ENTRY_DAY)}"]`);
    await expect(cell).toBeVisible();

    const box = (await cell.boundingBox())!;
    // The handoff's cell is 62px. Seven of them have to fit 393px across.
    expect(box.height).toBeGreaterThanOrEqual(60);
    expect(box.width).toBeGreaterThanOrEqual(44);

    // The month grid, by its label: there is an outer role="grid" wrapper too.
    // See the note on nested grid roles in the issue.
    const grid = (await page.getByRole('grid', { name: /\d{4}$/ }).boundingBox())!;
    expect(grid.width).toBeLessThanOrEqual(393);
  });

  test('shows the balance without cents, and the full figure in the sheet', async ({
    page,
    calendar,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Next month' }).click();

    const date = fixtureDate(calendar.month, ENTRY_DAY);
    const cell = page.locator(`[data-date="${date}"]`);

    await expect(cell.getByText(compact(expectedBalance(ENTRY_DAY)), { exact: true })).toBeVisible();
    // The full form is display:none here, so it is out of the tree entirely.
    await expect(
      cell.getByText(formatBalance(expectedBalance(ENTRY_DAY)), { exact: true }),
    ).toBeHidden();

    await cell.click();
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByText(formatBalance(expectedBalance(ENTRY_DAY)))).toBeVisible();
  });

  test('tapping a day raises the sheet, and it closes three ways', async ({ page, calendar }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Next month' }).click();
    const cell = page.locator(`[data-date="${fixtureDate(calendar.month, ENTRY_DAY)}"]`);

    // Nothing is raised until a day is tapped.
    await expect(page.getByRole('dialog')).toBeHidden();

    await cell.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Close day detail' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();

    await cell.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();

    await cell.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByTestId('sheet-backdrop').click({ position: { x: 10, y: 10 } });
    await expect(page.getByRole('dialog')).toBeHidden();
  });

  test('closing the sheet leaves the day selected', async ({ page, calendar }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Next month' }).click();

    const date = fixtureDate(calendar.month, ENTRY_DAY);
    const cell = page.locator(`[data-date="${date}"]`);

    await cell.click();
    await page.keyboard.press('Escape');

    // Selected, but not raised — leaving the calendar and coming back must not
    // reopen a sheet the reader dismissed.
    await expect(cell).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('dialog')).toBeHidden();

    await page.getByRole('link', { name: 'Reports' }).click();
    await page.getByRole('link', { name: 'Calendar' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
  });

  test('the raised sheet blocks the calendar behind it', async ({ page, calendar }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Next month' }).click();

    await page.locator(`[data-date="${fixtureDate(calendar.month, ENTRY_DAY)}"]`).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // The month controls are behind the backdrop while the sheet is up. This
    // is why the code's "close the sheet on month change" guard cannot be
    // reached by tapping — it exists for the resize path, where a desktop
    // selection carries across the breakpoint. Asserted as the modal property
    // it actually is, rather than pretending the navigation is reachable.
    //
    // Hit-tested rather than checked for visibility: the button is on screen,
    // it just cannot be reached.
    const covered = await page
      .getByRole('button', { name: 'Next month' })
      .evaluate((el) => {
        const { x, y, width, height } = el.getBoundingClientRect();
        const top = document.elementFromPoint(x + width / 2, y + height / 2);
        return top !== el && !el.contains(top);
      });
    expect(covered).toBe(true);
  });

  test('month navigation works once the sheet is dismissed', async ({ page, calendar }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Next month' }).click();

    await page.locator(`[data-date="${fixtureDate(calendar.month, ENTRY_DAY)}"]`).click();
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Next month' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
  });

  test('adds a transaction through the sheet without stacking dialogs', async ({
    page,
    calendar,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Next month' }).click();

    const date = fixtureDate(calendar.month, ENTRY_DAY);
    await page.locator(`[data-date="${date}"]`).click();
    await page.getByRole('button', { name: 'Add transaction' }).click();

    // The day sheet steps aside rather than sitting under the form.
    await expect(page.getByRole('dialog')).toHaveCount(1);

    const form = page.getByRole('dialog');
    await form.getByLabel('Description').fill(ENTRY_DESCRIPTION);
    await form.getByLabel('Amount in dollars').fill(ENTRY_AMOUNT);
    await form.getByRole('radio', { name: 'Debit (money out)' }).check();
    await form.getByRole('button', { name: 'Add transaction' }).click();
    await expect(form).toBeHidden();

    // The compact cell balance moves by exactly the debit.
    await expect(
      page.locator(`[data-date="${date}"]`).getByText(compact(ENTRY_DAY_AFTER), { exact: true }),
    ).toBeVisible();
  });

  test('the search field opens from its toggle', async ({ page, calendar }) => {
    expect(calendar.accountId).not.toEqual('');
    await page.goto('/');

    // Hidden behind a toggle at this width — 160px of field alongside three
    // month controls does not fit.
    await expect(page.getByLabel('Search transactions')).toBeHidden();

    await page.getByRole('button', { name: 'Show search' }).click();
    const field = page.getByLabel('Search transactions');
    await expect(field).toBeVisible();
    await expect(field).toBeFocused();
  });
});
