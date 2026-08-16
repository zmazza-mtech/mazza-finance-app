import { test, expect, fixtureDate } from './fixtures';

/**
 * The phone transactions screen: cards instead of a 720px-wide table.
 *
 * The point of the card list is that nothing becomes desktop-only, so most of
 * this is about capability parity — sorting and category correction have to
 * work here even though the column headers that drove them are gone.
 */

test.describe('phone transactions', () => {
  test.beforeEach(async ({ page, calendar }) => {
    expect(calendar.accountId).not.toEqual('');
    await page.goto('/transactions');

    // The seed lives one month ahead; the screen opens on the current month.
    await page.getByLabel('From').fill(fixtureDate(calendar.month, 1));
    await page.getByLabel('To').fill(fixtureDate(calendar.month, 28));
    await expect(page.getByTestId('transaction-cards')).toBeVisible();
  });

  test('renders cards, not a table', async ({ page }) => {
    // The table is not hidden — it is not rendered. Both trees at once would
    // announce every transaction twice.
    await expect(page.getByRole('table')).toHaveCount(0);
    await expect(page.getByTestId('transaction-cards').getByRole('listitem').first()).toBeVisible();
  });

  test('does not scroll sideways', async ({ page }) => {
    await expect(page.getByTestId('transaction-cards').getByRole('listitem').first()).toBeVisible();

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test('rows clear the 56px list-row height', async ({ page }) => {
    const row = page.getByTestId('transaction-cards').getByRole('listitem').first();
    await expect(row).toBeVisible();

    const box = (await row.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(56);
  });

  test('groups by day while sorted by date', async ({ page }) => {
    // The default sort. Headers read "Sat · Aug 15".
    const headings = page.getByTestId('transaction-cards').getByRole('heading', { level: 3 });
    await expect(headings.first()).toBeVisible();
    await expect(headings.first()).toHaveText(/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat) · \w{3} \d{1,2}$/);
  });

  test('drops the day headers when sorted by amount', async ({ page }) => {
    await expect(page.getByTestId('transaction-cards').getByRole('heading', { level: 3 }).first()).toBeVisible();

    await page.getByLabel('Sort', { exact: true }).selectOption('amount');

    // One header per row would say nothing, so grouping stops.
    await expect(page.getByTestId('transaction-cards').getByRole('heading', { level: 3 })).toHaveCount(0);
    await expect(page.getByTestId('transaction-cards').getByRole('listitem').first()).toBeVisible();
  });

  test('sorts from the card control, in both directions', async ({ page }) => {
    // The amount is the card's own last child, not a span nested in the
    // description block — `span:last-of-type` would find one of those first.
    const amounts = page
      .getByTestId('transaction-cards')
      .getByRole('listitem')
      .locator(':scope > span');

    // Exact strings from the fixture, and an auto-waiting assertion:
    // `evaluateAll` reads whatever is in the DOM at that instant, which during
    // a refetch is nothing.
    // Choosing a new column starts ascending, so the debit leads.
    await page.getByLabel('Sort', { exact: true }).selectOption('amount');
    await expect(amounts).toHaveText(['−$1,250.00', '+$2,400.00']);

    await page.getByRole('button', { name: /^Sort Amount/ }).click();
    await expect(amounts).toHaveText(['+$2,400.00', '−$1,250.00']);
  });

  test('corrects a category from a card', async ({ page }) => {
    const card = page.getByTestId('transaction-cards').getByRole('listitem').first();
    const select = card.getByRole('combobox');

    await expect(select).toBeVisible();
    await select.selectOption('Groceries');

    // Asserted on the control's value: the pill text and the <option> both
    // read "Groceries", so matching by text is ambiguous.
    await expect(select).toHaveValue('Groceries');
  });

  test('scrolls the filter chips without moving the page', async ({ page }) => {
    const strip = page.getByRole('button', { name: 'All' }).locator('..');
    await expect(strip).toBeVisible();

    // Chips are independent, so panning them loses nothing — this is the one
    // horizontal scroll the phone layout keeps on purpose.
    const scrollable = await strip.evaluate((el) => el.scrollWidth >= el.clientWidth);
    expect(scrollable).toBe(true);

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });
});
