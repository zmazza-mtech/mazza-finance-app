import { describe, it, expect } from 'vitest';
import { parseCsvRecords, parseTransactionsCsv } from '@/lib/csv';

// ---------------------------------------------------------------------------
// parseCsvRecords — the RFC 4180 reader
// ---------------------------------------------------------------------------

describe('parseCsvRecords', () => {
  it('splits a plain file into records and fields', () => {
    expect(parseCsvRecords('a,b\n1,2\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('keeps a record together when a quoted field contains a newline', () => {
    // The whole point of the issue: a line-based reader splits this record in
    // two and loses both halves.
    const text = 'Date,Description,Amount\n2026-01-15,"Line one\nLine two",-10.00\n';

    expect(parseCsvRecords(text)).toEqual([
      ['Date', 'Description', 'Amount'],
      ['2026-01-15', 'Line one\nLine two', '-10.00'],
    ]);
  });

  it('unescapes a doubled quote inside a quoted field', () => {
    expect(parseCsvRecords('a\n"He said ""hi"""\n')).toEqual([['a'], ['He said "hi"']]);
  });

  it('keeps a comma inside a quoted field', () => {
    expect(parseCsvRecords('a,b\n"Smith, John",2\n')).toEqual([
      ['a', 'b'],
      ['Smith, John', '2'],
    ]);
  });

  it('reads CRLF line endings', () => {
    expect(parseCsvRecords('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('normalizes a CRLF inside a quoted field to a bare newline', () => {
    const [, record] = parseCsvRecords('a\r\n"one\r\ntwo"\r\n');

    expect(record).toEqual(['one\ntwo']);
  });

  it('reads a final record with no trailing newline', () => {
    expect(parseCsvRecords('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('does not invent a trailing empty record after the final newline', () => {
    expect(parseCsvRecords('a,b\n')).toHaveLength(1);
  });

  it('preserves an empty field between two commas', () => {
    expect(parseCsvRecords('a,,c\n')).toEqual([['a', '', 'c']]);
  });

  it('returns nothing for empty input', () => {
    expect(parseCsvRecords('')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// parseTransactionsCsv — column detection and row extraction
// ---------------------------------------------------------------------------

describe('parseTransactionsCsv', () => {
  it('reads a description spanning a newline as one transaction', () => {
    const { rows } = parseTransactionsCsv(
      'Date,Description,Amount\n2026-01-15,"ACME CORP\nINVOICE 4471",-42.50\n',
    );

    expect(rows).toEqual([
      { date: '2026-01-15', description: 'ACME CORP\nINVOICE 4471', amount: '-42.50' },
    ]);
  });

  it('still reads a plain bank export', () => {
    const { rows } = parseTransactionsCsv(
      'Transaction Date,Merchant,Amount\n01/15/2026,Netflix,-15.99\n01/16/2026,Paycheck,2400.00\n',
    );

    expect(rows).toEqual([
      { date: '2026-01-15', description: 'Netflix', amount: '-15.99' },
      { date: '2026-01-16', description: 'Paycheck', amount: '2400.00' },
    ]);
  });

  it('still applies the debit/credit column pair', () => {
    const { rows } = parseTransactionsCsv(
      'Post Date,Payee,Debit,Credit\n2026-01-15,Rent,1250.00,\n2026-01-20,Salary,,2400.00\n',
    );

    expect(rows).toEqual([
      { date: '2026-01-15', description: 'Rent', amount: '-1250.00' },
      { date: '2026-01-20', description: 'Salary', amount: '2400.00' },
    ]);
  });

  it('still applies a type column as the sign', () => {
    const { rows } = parseTransactionsCsv(
      'Date,Description,Amount,Type\n2026-01-15,Coffee,4.50,Debit\n2026-01-16,Refund,9.00,Credit\n',
    );

    expect(rows).toEqual([
      { date: '2026-01-15', description: 'Coffee', amount: '-4.50' },
      { date: '2026-01-16', description: 'Refund', amount: '9.00' },
    ]);
  });

  it('skips a blank line between records rather than failing on it', () => {
    const { rows } = parseTransactionsCsv(
      'Date,Description,Amount\n2026-01-15,Netflix,-15.99\n\n2026-01-16,Spotify,-9.99\n',
    );

    expect(rows).toHaveLength(2);
  });

  it('throws when the file is empty', () => {
    expect(() => parseTransactionsCsv('')).toThrow(/empty/i);
  });

  it('throws when no date column can be found', () => {
    expect(() => parseTransactionsCsv('Foo,Description,Amount\n1,2,3\n')).toThrow(/date column/i);
  });

  it('throws when no amount column can be found', () => {
    expect(() => parseTransactionsCsv('Date,Description\n2026-01-15,Netflix\n')).toThrow(
      /amount column/i,
    );
  });

  it('reports which columns it matched', () => {
    const { columnInfo } = parseTransactionsCsv(
      'Post Date,Merchant,Amount\n2026-01-15,Netflix,-15.99\n',
    );

    expect(columnInfo).toContain('Post Date');
    expect(columnInfo).toContain('Merchant');
  });
});

// ---------------------------------------------------------------------------
// Round trip against the exporter's quoting rules
// ---------------------------------------------------------------------------

describe('round trip with the export format', () => {
  /** The exporter's rule, from `backend/src/lib/csv.ts`. */
  function encodeField(field: string): string {
    const needsQuoting = /[,"\n\r]/.test(field);
    return needsQuoting ? `"${field.replace(/"/g, '""')}"` : field;
  }

  function toCsv(headers: string[], rows: string[][]): string {
    return [headers, ...rows].map((r) => r.map(encodeField).join(',')).join('\n') + '\n';
  }

  it.each([
    ['a comma', 'ACME, Inc.'],
    ['a quote', 'The "Good" Store'],
    ['a newline', 'ACME CORP\nINVOICE 4471'],
    ['all three', 'ACME, "Inc."\nINVOICE 4471'],
  ])('survives a description containing %s', (_label, description) => {
    const exported = toCsv(
      ['Date', 'Description', 'Amount'],
      [['2026-01-15', description, '-42.50']],
    );

    const { rows } = parseTransactionsCsv(exported);

    expect(rows).toEqual([{ date: '2026-01-15', description, amount: '-42.50' }]);
  });
});
