import { test, expect, RECURRING } from './fixtures';

/**
 * The phone recurring screen.
 *
 * This screen already had a card list — it was just gated at `md:` (768px)
 * rather than the 640px every other breakpoint in the app uses, so between the
 * two the cards showed on a viewport wide enough for the table. Most of what
 * is asserted here is that the split now happens in the right place and that
 * nothing about the actions became unreachable.
 */

test.describe('phone recurring', () => {
  test.beforeEach(async ({ page, recurring }) => {
    expect(recurring.activeSeriesId).not.toEqual('');
    await page.goto('/recurring');
  });

  test('renders cards, not the table', async ({ page }) => {
    await expect(page.getByRole('table')).toHaveCount(0);
    await expect(page.getByText(RECURRING.active.name)).toBeVisible();
  });

  test('does not scroll sideways', async ({ page }) => {
    await expect(page.getByText(RECURRING.active.name)).toBeVisible();

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test('every action clears the touch target minimum', async ({ page }) => {
    for (const label of [
      `Edit ${RECURRING.active.name}`,
      `Disable ${RECURRING.active.name}`,
      `Delete ${RECURRING.active.name}`,
    ]) {
      const button = page.getByRole('button', { name: label });
      await expect(button).toBeVisible();

      const box = (await button.boundingBox())!;
      expect(box.height, `${label} is ${box.height}px tall`).toBeGreaterThanOrEqual(44);
    }
  });

  test('the three actions share the card width evenly', async ({ page }) => {
    const widths: number[] = [];
    for (const label of [
      `Edit ${RECURRING.active.name}`,
      `Disable ${RECURRING.active.name}`,
      `Delete ${RECURRING.active.name}`,
    ]) {
      widths.push((await page.getByRole('button', { name: label }).boundingBox())!.width);
    }

    // The handoff draws three equal buttons. Left to `flex-wrap` with
    // auto-width pills, Delete ends up stranded on a line of its own.
    const [first] = widths as [number, number, number];
    for (const width of widths) expect(Math.abs(width - first)).toBeLessThanOrEqual(1);
  });

  test('deleting still goes through a confirmation', async ({ page }) => {
    await page.getByRole('button', { name: `Delete ${RECURRING.active.name}` }).click();

    // A single tap must not destroy a series — the confirm is a dialog now,
    // rendered through the shared Sheet.
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.getByText(RECURRING.active.name)).toBeVisible();
  });

  test('editing opens the series form as a sheet', async ({ page }) => {
    await page.getByRole('button', { name: `Edit ${RECURRING.active.name}` }).click();

    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    await expect(sheet.getByLabel('Name')).toHaveValue(RECURRING.active.name);

    // Bottom-anchored, not centred: the panel's lower edge meets the viewport.
    //
    // Polled rather than measured once. `toBeVisible` does not wait for
    // animations, and the sheet slides up over 300ms — a single read lands
    // mid-travel, hundreds of pixels below where it settles.
    await expect
      .poll(async () => {
        const box = (await sheet.boundingBox())!;
        const container = await sheet.evaluate(
          (el) => el.parentElement!.getBoundingClientRect().height,
        );
        return Math.round(box.y + box.height - container);
      })
      .toBeLessThanOrEqual(1);
  });
});

test.describe('phone recurring with reduced motion', () => {
  test('raises the sheet with no travel', async ({ page, recurring }) => {
    expect(recurring.activeSeriesId).not.toEqual('');

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/recurring');
    await page.getByRole('button', { name: `Edit ${RECURRING.active.name}` }).click();

    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();

    // The slide is applied through `motion-safe:`, which Tailwind compiles to
    // `@media (prefers-reduced-motion: no-preference)`. Under `reduce` the
    // rule never matches, so the sheet is already at rest on the first frame
    // — no polling needed, and that is the assertion.
    const box = (await sheet.boundingBox())!;
    const container = await sheet.evaluate(
      (el) => el.parentElement!.getBoundingClientRect().height,
    );
    expect(Math.abs(box.y + box.height - container)).toBeLessThanOrEqual(1);
  });
});
