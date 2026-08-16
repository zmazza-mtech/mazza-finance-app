/**
 * Integration tests for POST /import/csv, against real Postgres.
 *
 * This is the only endpoint that ingests a user-supplied file, so the
 * rejection cases matter more here than anywhere else: every one of them
 * asserts both the status code and that nothing was written.
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import supertest from 'supertest';
import app from '../../src/app';
import { closeDb } from '../../src/db/client';
import {
  resetDb,
  seedAccount,
  seedTransactions,
  allTransactions,
  ABSENT_UUID,
} from '../helpers/db';
import { parseCsvRecords } from '../helpers/csv';

const request = supertest(app);
const IMPORT = '/api/v1/import/csv';

let accountId: string;

beforeEach(async () => {
  await resetDb();
  accountId = (await seedAccount()).id;
});

afterAll(async () => {
  await closeDb();
});

function row(overrides: Partial<{ date: string; description: string; amount: string }> = {}) {
  return {
    date: '2026-08-10',
    description: 'Whole Foods',
    amount: '-84.21',
    ...overrides,
  };
}

describe('POST /import/csv — happy path', () => {
  it('imports every row and reports the count', async () => {
    const res = await request.post(IMPORT).send({
      accountId,
      transactions: [
        row(),
        row({ date: '2026-08-11', description: 'Shell', amount: '-42.00' }),
      ],
    });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ imported: 2, skipped: 0, errors: [] });
    expect(await allTransactions(accountId)).toHaveLength(2);
  });

  it('persists the amount as an exact decimal string', async () => {
    await request.post(IMPORT).send({
      accountId,
      transactions: [row({ amount: '-1234.56' })],
    });

    const [saved] = await allTransactions(accountId);
    expect(String(saved!.amount)).toBe('-1234.56');
  });

  it('marks imported rows as manual and posted', async () => {
    await request.post(IMPORT).send({ accountId, transactions: [row()] });

    const [saved] = await allTransactions(accountId);
    expect(saved!.type).toBe('manual');
    expect(saved!.status).toBe('posted');
  });

  it('accepts an amount with no decimal part', async () => {
    const res = await request.post(IMPORT).send({
      accountId,
      transactions: [row({ amount: '-42' })],
    });

    expect(res.status).toBe(200);
    expect(res.body.data.imported).toBe(1);
  });
});

describe('POST /import/csv — categorization', () => {
  // Every other write path — POST /transactions, POST /recurring and the sync
  // job — runs the description through categorize(). Import has to as well, or
  // a CSV-seeded account reads as entirely uncategorized on the reports screen
  // until someone runs the batch sweep by hand.
  it('assigns a category from the description', async () => {
    await request.post(IMPORT).send({
      accountId,
      transactions: [row({ description: 'WHOLE FOODS MKT 10241' })],
    });

    const [saved] = await allTransactions(accountId);
    expect(saved!.category).toBe('Groceries');
  });

  it('leaves a description it cannot place uncategorized', async () => {
    await request.post(IMPORT).send({
      accountId,
      transactions: [row({ description: 'ZZQQ 4417' })],
    });

    const [saved] = await allTransactions(accountId);
    expect(saved!.category).toBeNull();
  });

  it('categorizes every row in the batch, not just the first', async () => {
    await request.post(IMPORT).send({
      accountId,
      transactions: [
        row({ date: '2026-08-01', description: 'WHOLE FOODS MKT 10241', amount: '-84.21' }),
        row({ date: '2026-08-02', description: 'SHELL OIL 5729', amount: '-42.00' }),
      ],
    });

    const saved = await allTransactions(accountId);
    expect(saved.map((t) => t.category)).toEqual(['Groceries', 'Transportation']);
  });
});

describe('POST /import/csv — deduplication', () => {
  it('skips a row that already exists', async () => {
    await seedTransactions(accountId, [
      { date: '2026-08-10', description: 'Whole Foods', amount: '-84.21' },
    ]);

    const res = await request.post(IMPORT).send({ accountId, transactions: [row()] });

    expect(res.body.data).toEqual({ imported: 0, skipped: 1, errors: [] });
    expect(await allTransactions(accountId)).toHaveLength(1);
  });

  it('is idempotent — re-importing the same file adds nothing', async () => {
    const body = {
      accountId,
      transactions: [row(), row({ date: '2026-08-11', amount: '-42.00' })],
    };

    await request.post(IMPORT).send(body);
    const second = await request.post(IMPORT).send(body);

    expect(second.body.data).toEqual({ imported: 0, skipped: 2, errors: [] });
    expect(await allTransactions(accountId)).toHaveLength(2);
  });

  it('matches an existing row whose amount is written differently', async () => {
    // Stored as NUMERIC(12,2), so the column reads back "-84.20"; the CSV said
    // "-84.2". Same money, different string — the dedup key normalizes both.
    await seedTransactions(accountId, [
      { date: '2026-08-10', description: 'Whole Foods', amount: '-84.20' },
    ]);

    const res = await request.post(IMPORT).send({
      accountId,
      transactions: [row({ amount: '-84.2' })],
    });

    expect(res.body.data.skipped).toBe(1);
    expect(await allTransactions(accountId)).toHaveLength(1);
  });

  it('keeps two genuinely identical rows in one file', async () => {
    // Two identical charges on one day are a real thing. Dedup is against what
    // is already stored, not within the batch — and a re-import of this same
    // file then skips both, so it stays idempotent either way.
    const res = await request.post(IMPORT).send({
      accountId,
      transactions: [row(), row()],
    });

    expect(res.body.data.imported).toBe(2);
    expect(await allTransactions(accountId)).toHaveLength(2);
  });

  it('does not treat another account\'s transaction as a duplicate', async () => {
    const other = await seedAccount({ name: 'Savings' });
    await seedTransactions(other.id, [
      { date: '2026-08-10', description: 'Whole Foods', amount: '-84.21' },
    ]);

    const res = await request.post(IMPORT).send({ accountId, transactions: [row()] });

    expect(res.body.data.imported).toBe(1);
  });
});

describe('POST /import/csv — validation rejection', () => {
  async function expectRejected(body: unknown, status = 400) {
    const res = await request.post(IMPORT).send(body as object);
    expect(res.status).toBe(status);
    expect(await allTransactions(accountId)).toHaveLength(0);
    return res;
  }

  it('rejects a missing accountId', async () => {
    await expectRejected({ transactions: [row()] });
  });

  it('rejects an accountId that is not a uuid', async () => {
    await expectRejected({ accountId: 'not-a-uuid', transactions: [row()] });
  });

  it('rejects an account that does not exist', async () => {
    await expectRejected({ accountId: ABSENT_UUID, transactions: [row()] });
  });

  it('rejects an empty transaction list', async () => {
    await expectRejected({ accountId, transactions: [] });
  });

  it('rejects a missing transaction list', async () => {
    await expectRejected({ accountId });
  });

  it('rejects a date that is not YYYY-MM-DD', async () => {
    await expectRejected({ accountId, transactions: [row({ date: '08/10/2026' })] });
  });

  it('rejects an amount with three decimal places', async () => {
    await expectRejected({ accountId, transactions: [row({ amount: '-84.219' })] });
  });

  it('rejects an amount that is not a number', async () => {
    await expectRejected({ accountId, transactions: [row({ amount: 'eighty four' })] });
  });

  it('rejects an empty description', async () => {
    await expectRejected({ accountId, transactions: [row({ description: '' })] });
  });

  it('rejects a description over 255 characters', async () => {
    await expectRejected({ accountId, transactions: [row({ description: 'x'.repeat(256) })] });
  });

  it('persists nothing when one row in a valid batch is bad', async () => {
    // Rejection is all-or-nothing: a partial import would leave the user with
    // no way to know which half landed.
    await expectRejected({
      accountId,
      transactions: [row(), row({ date: 'nope' }), row({ date: '2026-08-12' })],
    });
  });
});

describe('POST /import/csv — size limits', () => {
  function manyRows(count: number) {
    return Array.from({ length: count }, (_, i) => ({
      date: '2026-08-10',
      description: `Row ${i}`,
      amount: '-1.00',
    }));
  }

  it('accepts a batch at the 5000-row ceiling', async () => {
    const res = await request.post(IMPORT).send({
      accountId,
      transactions: manyRows(5000),
    });

    expect(res.status).toBe(200);
    expect(res.body.data.imported).toBe(5000);
  });

  it('rejects a batch over the ceiling, persisting nothing', async () => {
    const res = await request.post(IMPORT).send({
      accountId,
      transactions: manyRows(5001),
    });

    expect(res.status).toBe(400);
    expect(await allTransactions(accountId)).toHaveLength(0);
  });

  it('rejects a body over the 2mb parser limit', async () => {
    const res = await request.post(IMPORT).send({
      accountId,
      transactions: [row({ description: 'x'.repeat(3_000_000) })],
    });

    expect(res.status).toBe(413);
    expect(await allTransactions(accountId)).toHaveLength(0);
  });
});

/**
 * Export and re-import, the property that makes the data portable rather than
 * merely visible: what comes out of the export must go back in unchanged.
 *
 * The CSV is read back with the test's own reader — see `helpers/csv.ts` for
 * why there is no production one on this side. A description containing a
 * newline is deliberately not exercised here: `toCsv` quotes it correctly, but
 * the browser's importer reads line by line and cannot reassemble it, so a pass
 * here would claim a round trip the application cannot actually perform.
 */
describe('export and re-import', () => {
  const EXPORT = '/api/v1/reports/transactions.csv';

  async function exportCsv(id: string): Promise<string> {
    const res = await request
      .get(EXPORT)
      .query({ accountId: id, startDate: '2026-08-01', endDate: '2026-08-31' });
    expect(res.status).toBe(200);
    return res.text;
  }

  it('reproduces the original transaction set in an empty account', async () => {
    await seedTransactions(accountId, [
      { date: '2026-08-10', description: 'Whole Foods', amount: '-84.21', category: 'Groceries' },
      { date: '2026-08-12', description: 'Paycheck', amount: '2400.00', category: 'Income' },
    ]);

    const emptyAccount = (await seedAccount({ name: 'Restored' })).id;
    const res = await request.post(IMPORT).send({
      accountId: emptyAccount,
      transactions: parseCsvRecords(await exportCsv(accountId)).map((r) => ({
        date: r['date']!,
        description: r['description']!,
        amount: r['amount']!,
      })),
    });

    expect(res.status).toBe(200);
    expect(res.body.data.imported).toBe(2);

    const restored = await allTransactions(emptyAccount);
    expect(restored.map((t) => [String(t.date), t.description, String(t.amount)])).toEqual([
      ['2026-08-10', 'Whole Foods', '-84.21'],
      ['2026-08-12', 'Paycheck', '2400.00'],
    ]);
  });

  it('carries a description with a comma and a quote through unchanged', async () => {
    const awkward = 'Smith, "Bob" & Co';
    await seedTransactions(accountId, [
      { date: '2026-08-10', description: awkward, amount: '-10.00', category: null },
    ]);

    const emptyAccount = (await seedAccount({ name: 'Restored' })).id;
    await request.post(IMPORT).send({
      accountId: emptyAccount,
      transactions: parseCsvRecords(await exportCsv(accountId)).map((r) => ({
        date: r['date']!,
        description: r['description']!,
        amount: r['amount']!,
      })),
    });

    const [restored] = await allTransactions(emptyAccount);
    expect(restored!.description).toBe(awkward);
  });

  it('keeps an amount to the cent through the round trip', async () => {
    await seedTransactions(accountId, [
      { date: '2026-08-10', description: 'Rent', amount: '-1250.00', category: 'Housing' },
    ]);

    const emptyAccount = (await seedAccount({ name: 'Restored' })).id;
    await request.post(IMPORT).send({
      accountId: emptyAccount,
      transactions: parseCsvRecords(await exportCsv(accountId)).map((r) => ({
        date: r['date']!,
        description: r['description']!,
        amount: r['amount']!,
      })),
    });

    const [restored] = await allTransactions(emptyAccount);
    expect(String(restored!.amount)).toBe('-1250.00');
  });

  it('re-imports into the same account as nothing new, having deduplicated', async () => {
    await seedTransactions(accountId, [
      { date: '2026-08-10', description: 'Whole Foods', amount: '-84.21', category: 'Groceries' },
    ]);

    const res = await request.post(IMPORT).send({
      accountId,
      transactions: parseCsvRecords(await exportCsv(accountId)).map((r) => ({
        date: r['date']!,
        description: r['description']!,
        amount: r['amount']!,
      })),
    });

    expect(res.body.data).toMatchObject({ imported: 0, skipped: 1 });
  });
});
