import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

/**
 * The phone shell: bottom tab bar, one navigation landmark, and a viewport
 * that does not scroll sideways.
 *
 * These are the properties a desktop-only CI cannot see. Everything asserted
 * here is measured from the rendered page — geometry from
 * `getBoundingClientRect`, scroll width from the document — rather than from
 * class names, which would only test the stylesheet's spelling.
 */

const TABS = ['Calendar', 'Activity', 'Recurring', 'Reports', 'Settings'] as const;

/** Where the tab bar sits, and how tall its tallest tab is. */
async function tabBarBox(page: Page) {
  return page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Main navigation"]');
    if (!nav) return null;
    const rect = nav.getBoundingClientRect();
    const tab = nav.querySelector('a')!.getBoundingClientRect();
    return {
      top: rect.top,
      bottom: rect.bottom,
      innerHeight: window.innerHeight,
      tabHeight: tab.height,
    };
  });
}

test.describe('phone shell', () => {
  test('carries exactly one navigation landmark', async ({ page, calendar }) => {
    expect(calendar.accountId).not.toEqual('');
    await page.goto('/');

    // Two "Main navigation" landmarks would mean the desktop header nav and
    // the tab bar are both in the DOM — duplicate landmarks, and every link
    // present twice under the same accessible name.
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toHaveCount(1);
  });

  test('the tab bar reaches every screen', async ({ page, calendar }) => {
    expect(calendar.accountId).not.toEqual('');
    await page.goto('/');

    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    await expect(nav.getByRole('link')).toHaveText([...TABS]);

    for (const label of TABS) {
      await nav.getByRole('link', { name: label }).click();

      // aria-current, not a colour: the active tab has to be announced.
      await expect(nav.getByRole('link', { name: label })).toHaveAttribute(
        'aria-current',
        'page',
      );
      await expect(page.getByRole('main')).toBeVisible();
    }
  });

  test('labels the transactions route Activity while still routing to it', async ({
    page,
    calendar,
  }) => {
    expect(calendar.accountId).not.toEqual('');
    await page.goto('/');

    await page.getByRole('link', { name: 'Activity' }).click();
    await expect(page).toHaveURL(/\/transactions$/);
  });

  test('the tab bar sits on the bottom edge and clears the minimum height', async ({
    page,
    calendar,
  }) => {
    expect(calendar.accountId).not.toEqual('');
    await page.goto('/');

    const box = await tabBarBox(page);
    expect(box).not.toBeNull();

    // Flush with the bottom of the viewport, within a rounding pixel.
    expect(Math.abs(box!.bottom - box!.innerHeight)).toBeLessThanOrEqual(1);
    expect(box!.tabHeight).toBeGreaterThanOrEqual(52);
  });

  test('no screen scrolls sideways', async ({ page, calendar }) => {
    expect(calendar.accountId).not.toEqual('');

    for (const [label, path] of [
      ['Calendar', '/'],
      ['Activity', '/transactions'],
      ['Recurring', '/recurring'],
      ['Reports', '/reports'],
      ['Settings', '/settings'],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole('main')).toBeVisible();

      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));

      // A page that pans sideways loses the row the reader is on. Reported
      // with the screen name so a failure says which one.
      expect(
        overflow.scrollWidth,
        `${label} scrolls sideways: ${overflow.scrollWidth}px in a ${overflow.clientWidth}px viewport`,
      ).toBeLessThanOrEqual(overflow.clientWidth);
    }
  });

  test('the tab bar stays put while content scrolls under it', async ({ page, calendar }) => {
    expect(calendar.accountId).not.toEqual('');
    await page.goto('/');

    const before = await tabBarBox(page);
    await page.getByRole('main').evaluate((el) => el.scrollBy(0, 400));
    const after = await tabBarBox(page);

    // The shell is a flex column with main as the only scroller, so scrolling
    // must not move the bar. If the page scrolled instead, this drifts.
    expect(after!.top).toBeCloseTo(before!.top, 0);
  });
});
