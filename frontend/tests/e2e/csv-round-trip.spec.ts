import { readFile } from 'node:fs/promises';
import { test, expect, fixtureDate, seedTransaction } from './fixtures';
import { API_URL } from './stack';

/**
 * The export/re-import round trip, across the seam neither package can test
 * alone: the backend writes the CSV, the browser reads it back.
 *
 * `backend/tests/integration/import.test.ts` proves `toCsv` quotes a newline
 * correctly, but it reads the file with its own reader, so it cannot show the
 * importer copes. The frontend unit tests prove the importer copes, but against
 * a re-implementation of the exporter's quoting rules. Only this test runs the
 * real exporter's output through the real importer.
 */

/** A description that spans two physical lines once the exporter quotes it. */
const MULTILINE = 'ACME CORP\nINVOICE 4471';

test.describe('csv export and re-import', () => {
  test('a description containing a newline survives the round trip', async ({
    page,
    calendar,
  }) => {
    await seedTransaction(calendar.accountId, {
      date: fixtureDate(calendar.month, 14),
      description: MULTILINE,
      amount: '-42.50',
    });

    // --- Export -----------------------------------------------------------
    await page.goto('/reports');
    await page.getByLabel('From').fill(fixtureDate(calendar.month, 1));
    await page.getByLabel('To').fill(fixtureDate(calendar.month, 28));

    const downloading = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Transactions CSV' }).click();
    const download = await downloading;
    const exportPath = (await download.path())!;

    // The record really does span two lines, or the test proves nothing: four
    // header/data lines plus the one the quoted newline adds.
    const csv = await readFile(exportPath, 'utf8');
    expect(csv).toContain('"ACME CORP\nINVOICE 4471"');

    // --- Re-import --------------------------------------------------------
    await page.goto('/settings');
    await page.getByLabel('Select a CSV file to import').setInputFiles(exportPath);

    // Three seeded transactions: the fixture's two, plus the multiline one. A
    // line-based reader loses the multiline record and reports two.
    await expect(page.getByText('3 transactions detected')).toBeVisible();

    await page.getByLabel('Import to account').selectOption(calendar.accountId);
    await page.getByRole('button', { name: 'Import', exact: true }).click();

    // --- Verify what landed ----------------------------------------------
    await expect(page.getByText(/imported/i).first()).toBeVisible();

    const response = await fetch(`${API_URL}/transactions?accountId=${calendar.accountId}`);
    const body = (await response.json()) as { data: { description: string; amount: string }[] };

    const restored = body.data.filter((t) => t.description === MULTILINE);
    expect(restored.length).toBeGreaterThanOrEqual(1);
    expect(restored.every((t) => t.amount === '-42.50')).toBe(true);
  });
});
