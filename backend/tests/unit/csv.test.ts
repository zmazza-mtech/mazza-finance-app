import { describe, it, expect } from 'vitest';
import { toCsv } from '../../src/lib/csv';

/**
 * The CSV writer, against RFC 4180's quoting rules.
 *
 * These assert whole documents rather than single fields: quoting is only
 * correct in the context of the row it sits in, and a field-level assertion
 * would pass on a writer that forgot the separator.
 */
describe('toCsv', () => {
  it('writes a header row even with nothing under it', () => {
    expect(toCsv(['date', 'amount'], [])).toBe('date,amount\n');
  });

  it('separates fields with commas and rows with newlines', () => {
    expect(toCsv(['date', 'amount'], [['2026-08-01', '-15.99']])).toBe(
      'date,amount\n2026-08-01,-15.99\n',
    );
  });

  it('leaves an ordinary field unquoted', () => {
    expect(toCsv(['description'], [['KROGER 118']])).toBe('description\nKROGER 118\n');
  });

  it('quotes a field containing a comma', () => {
    expect(toCsv(['description'], [['Smith, Bob']])).toBe('description\n"Smith, Bob"\n');
  });

  it('doubles a quote inside a quoted field', () => {
    expect(toCsv(['description'], [['Bob "The Builder"']])).toBe(
      'description\n"Bob ""The Builder"""\n',
    );
  });

  it('quotes a field containing a newline rather than breaking the row', () => {
    expect(toCsv(['description'], [['line one\nline two']])).toBe(
      'description\n"line one\nline two"\n',
    );
  });

  it('quotes a field containing a carriage return', () => {
    expect(toCsv(['description'], [['line one\r\nline two']])).toBe(
      'description\n"line one\r\nline two"\n',
    );
  });

  it('handles the comma, the quote and the newline in one field', () => {
    expect(toCsv(['description'], [['Smith, "Bob"\n& Co']])).toBe(
      'description\n"Smith, ""Bob""\n& Co"\n',
    );
  });

  it('quotes a header that needs it, exactly as it quotes a value', () => {
    expect(toCsv(['a,b'], [['x']])).toBe('"a,b"\nx\n');
  });

  it('writes an empty field as nothing between two commas', () => {
    expect(toCsv(['a', 'b', 'c'], [['1', '', '3']])).toBe('a,b,c\n1,,3\n');
  });

  it('carries an amount through untouched, with no formatting of its own', () => {
    expect(toCsv(['amount'], [['-1250.00']])).toBe('amount\n-1250.00\n');
  });
});
