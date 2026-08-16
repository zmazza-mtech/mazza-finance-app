import { test, expect } from './fixtures';

/**
 * The phone settings screen.
 *
 * Settings was already a single column of cards, so most of the work was
 * mechanical. The one substantive piece is the account selector: the phone
 * header has no room for it, and parity forbids dropping it, so it lands here
 * — and it has to actually change what the other screens show.
 */

test.describe('phone settings', () => {
  test.beforeEach(async ({ page, calendar }) => {
    expect(calendar.accountId).not.toEqual('');
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  });

  test('does not scroll sideways', async ({ page }) => {
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test('offers the account selector the header has no room for', async ({ page }) => {
    // Exactly one in the accessibility tree: the header's copy is not rendered
    // at this width, and this one is not rendered above it.
    const selector = page.getByLabel('Showing');
    await expect(selector).toBeVisible();
    await expect(page.getByLabel('Select account')).toBeHidden();
  });

  test('the selector drives what the other screens show', async ({ page }) => {
    const selector = page.getByLabel('Showing');
    const chosen = await selector.locator('option:checked').textContent();
    expect(chosen).toBeTruthy();

    // The header's selector is gone at this width, so if this one were wired
    // to its own state instead of the shared context, nothing else would
    // follow it. The transactions subtitle names the active account.
    await page.getByRole('link', { name: 'Activity' }).click();
    await expect(page.getByText(new RegExp(`· ${chosen!.split(' — ').pop()}`))).toBeVisible();
  });

  test('the account toggle is a real switch, not a styled span', async ({ page }) => {
    const toggle = page.getByRole('switch').first();
    await expect(toggle).toBeVisible();

    // A programmatically determinable state, and keyboard operable — the two
    // things a div-with-an-onclick would not give.
    const before = await toggle.getAttribute('aria-checked');
    await toggle.focus();
    await page.keyboard.press('Space');
    await expect(toggle).not.toHaveAttribute('aria-checked', before!);

    const box = (await toggle.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
  });

  test('account rows clear the 56px minimum', async ({ page }) => {
    const row = page.getByRole('listitem').filter({ has: page.getByRole('switch') }).first();
    await expect(row).toBeVisible();

    const box = (await row.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(56);
  });

  test('primary actions run the full width of their card', async ({ page }) => {
    const card = page.getByRole('region', { name: 'Bank sync' });
    const button = card.getByRole('button', { name: /sync/i }).first();
    await expect(button).toBeVisible();

    const buttonBox = (await button.boundingBox())!;
    const cardBox = (await card.boundingBox())!;

    // Within the card's own padding, either side.
    expect(cardBox.width - buttonBox.width).toBeLessThanOrEqual(34);
  });

  test('threshold fields stack and stay numeric', async ({ page }) => {
    const good = page.getByLabel('Good — at or above');
    const low = page.getByLabel('Low — at or below');

    await expect(good).toHaveAttribute('type', 'number');
    await expect(low).toHaveAttribute('type', 'number');

    // Stacked, not side by side: two number fields across 393px leave neither
    // readable.
    const goodBox = (await good.boundingBox())!;
    const lowBox = (await low.boundingBox())!;
    expect(lowBox.y).toBeGreaterThan(goodBox.y + goodBox.height - 1);
  });

  test('offers a file picker rather than a drop target', async ({ page }) => {
    const input = page.getByLabel('Select a CSV file to import');
    await expect(input).toHaveAttribute('type', 'file');

    // Nothing on this screen tells a phone user to drag anything.
    await expect(page.getByText(/drag/i)).toHaveCount(0);
  });
});
