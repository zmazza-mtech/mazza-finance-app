import { test, expect, fixtureDate } from './fixtures';
import type { Page } from '@playwright/test';

/**
 * The PRD's keyboard flow (§10, "Testing — Frontend"; §5.1 for the model):
 * Tab reaches the calendar as one focusable unit, arrow keys move between day
 * cells, `T` returns to today, Enter opens entry and Escape closes it.
 *
 * Every assertion here is on `document.activeElement`, never on which cell is
 * painted with a focus ring. The two came apart once already — a ring that
 * moves while focus stays put reads as working to a sighted mouse user and is
 * unusable with a screen reader (issue #28) — so the ring is not evidence.
 *
 * The fixture is the recurring seed, shared with `recurring.spec.ts`: it fills
 * enough cells of the fixture month that arrowing across it crosses real data.
 */

/** The `data-date` of whatever currently holds focus, or null if it is not a cell. */
async function focusedDate(page: Page): Promise<string | null> {
  return page.evaluate(() => document.activeElement?.getAttribute('data-date') ?? null);
}

/** Walks the calendar forward from the current month, which is where it opens. */
async function showMonthsAhead(page: Page, months: number): Promise<void> {
  for (let i = 0; i < months; i += 1) {
    await page.getByRole('button', { name: 'Next month' }).click();
  }
}

/**
 * Tabs from the last control ahead of the grid into the grid itself.
 *
 * Anchored on that control rather than tabbing from the top of the document:
 * the count of stops before the calendar depends on the header, the account
 * selector and the projection panel, none of which this flow is about.
 */
async function tabIntoCalendar(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Next month' }).focus();
  await page.keyboard.press('Tab');
}

test.describe('calendar keyboard navigation', () => {
  test('Tab reaches the grid as a single stop', async ({ page, recurring }) => {
    await page.goto('/');
    await showMonthsAhead(page, 1);

    const firstOfMonth = fixtureDate(recurring.month, 1);

    // Roving tabindex, not a stop per day: exactly one cell is tabbable, and
    // that is the one Tab lands on. PRD §5.1 — "Tab moves focus to the calendar
    // widget as a single focusable unit".
    await expect(page.locator('[data-date][tabindex="0"]')).toHaveCount(1);

    await tabIntoCalendar(page);
    expect(await focusedDate(page)).toEqual(firstOfMonth);

    // And Tab again leaves the grid rather than stepping to the second day.
    await page.keyboard.press('Tab');
    expect(await focusedDate(page)).toBeNull();
  });

  test('arrow keys move focus by day and by week', async ({ page, recurring }) => {
    await page.goto('/');
    await showMonthsAhead(page, 1);
    await tabIntoCalendar(page);

    await page.keyboard.press('ArrowRight');
    expect(await focusedDate(page)).toEqual(fixtureDate(recurring.month, 2));

    // Down is a week, not a day.
    await page.keyboard.press('ArrowDown');
    expect(await focusedDate(page)).toEqual(fixtureDate(recurring.month, 9));

    await page.keyboard.press('ArrowUp');
    expect(await focusedDate(page)).toEqual(fixtureDate(recurring.month, 2));

    await page.keyboard.press('ArrowLeft');
    expect(await focusedDate(page)).toEqual(fixtureDate(recurring.month, 1));

    // The tabbable cell followed focus; it did not stay behind on the first day
    // of the walk.
    await expect(page.locator('[data-date][tabindex="0"]')).toHaveCount(1);
    await expect(
      page.locator(`[data-date="${fixtureDate(recurring.month, 1)}"]`),
    ).toHaveAttribute('tabindex', '0');
  });

  test('T returns focus to today from another month', async ({ page, recurring }) => {
    await page.goto('/');
    await showMonthsAhead(page, 1);
    await tabIntoCalendar(page);
    await page.keyboard.press('ArrowRight');

    // Away from today, in both month and cell, before the shortcut is pressed.
    expect(await focusedDate(page)).toEqual(fixtureDate(recurring.month, 2));

    await page.keyboard.press('T');

    const today = await page.evaluate(() => {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
        now.getDate(),
      ).padStart(2, '0')}`;
    });

    // It crossed the month boundary as well as the cell: the grid is showing
    // today's month and focus is on today itself.
    expect(await focusedDate(page)).toEqual(today);
    await expect(page.locator(`[data-date="${today}"]`)).toHaveAttribute(
      'aria-label',
      `${today}, today`,
    );
  });

  test('Enter opens entry and Escape hands focus back to the day cell', async ({
    page,
    recurring,
  }) => {
    await page.goto('/');
    await showMonthsAhead(page, 1);
    await tabIntoCalendar(page);
    await page.keyboard.press('ArrowRight');

    const entryDate = fixtureDate(recurring.month, 2);
    expect(await focusedDate(page)).toEqual(entryDate);

    await page.keyboard.press('Enter');

    // Entry opens on the focused day, with focus inside it — PRD §5.2, "When
    // inline entry activates: focus moves to the description field".
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();
    await expect(modal.getByLabel('Description')).toBeFocused();

    await page.keyboard.press('Escape');

    await expect(modal).toBeHidden();
    // PRD §5.2, "Focus Management": closing returns focus to the trigger. Without
    // this the cell is still ringed but focus has fallen to the document body,
    // and the next Tab restarts from the top of the page.
    expect(await focusedDate(page)).toEqual(entryDate);
  });
});
