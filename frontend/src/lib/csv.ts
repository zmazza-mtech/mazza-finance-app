import Decimal from 'decimal.js';
import type { ImportBody } from '@/api/types';

// ---------------------------------------------------------------------------
// Column detection
// ---------------------------------------------------------------------------

const DATE_COLS = [
  'date',
  'transaction date',
  'post date',
  'posted date',
  'processed date',
  'processed dt',
  'settlement date',
];
const DESC_COLS = [
  'description',
  'merchant',
  'merchant name',
  'name',
  'payee',
  'memo',
  'transaction description',
];
const AMOUNT_COLS = ['amount', 'transaction amount'];
const DEBIT_COLS = ['debit', 'withdrawals', 'debit amount'];
const CREDIT_COLS = ['credit', 'deposits', 'credit amount'];
// Type/direction indicator column: value is "Credit" or "Debit" text.
// When present, the Amount column is treated as always positive and this
// column determines the sign (Debit → negative, Credit → positive).
const TYPE_COLS = ['type', 'credit or debit', 'details', 'transaction type'];

export interface ParseResult {
  rows: ImportBody['transactions'];
  columnInfo: string;
}

// ---------------------------------------------------------------------------
// parseCsvRecords
// ---------------------------------------------------------------------------

/**
 * Splits CSV text into records, to RFC 4180's quoting rules.
 *
 * Reads character by character rather than splitting on newlines first, because
 * a newline inside a quoted field is part of the field, not the end of the
 * record. The exporter in `backend/src/lib/csv.ts` quotes such a description
 * correctly, so a line-based reader could not read back what this application
 * itself writes — the record arrived as two broken halves and both were
 * discarded.
 *
 * A `\r\n` inside a quoted field is normalized to `\n`, so a description reads
 * the same whichever line ending the file arrived with.
 */
export function parseCsvRecords(text: string): string[][] {
  const records: string[][] = [];
  let fields: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  function endRecord() {
    fields.push(field);
    records.push(fields);
    fields = [];
    field = '';
  }

  while (i < text.length) {
    const char = text[i]!;

    if (inQuotes) {
      if (char === '"') {
        // A doubled quote is one literal quote; a single one closes the field.
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
        continue;
      }
      if (char === '\r' && text[i + 1] === '\n') {
        field += '\n';
        i += 2;
        continue;
      }
      field += char;
      i++;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (char === ',') {
      fields.push(field);
      field = '';
      i++;
      continue;
    }
    if (char === '\r') {
      i += text[i + 1] === '\n' ? 2 : 1;
      endRecord();
      continue;
    }
    if (char === '\n') {
      i++;
      endRecord();
      continue;
    }

    field += char;
    i++;
  }

  // A file that ends without a trailing newline still has a final record. One
  // that ends with a newline does not — the record was closed by it.
  if (field.length > 0 || fields.length > 0) {
    endRecord();
  }

  return records;
}

// ---------------------------------------------------------------------------
// Field normalization
// ---------------------------------------------------------------------------

/** Normalize date strings to YYYY-MM-DD. Supports MM/DD/YYYY and MM-DD-YYYY. */
function normalizeDate(raw: string): string | null {
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, m, d, y] = slashMatch;
    return `${y}-${m!.padStart(2, '0')}-${d!.padStart(2, '0')}`;
  }

  const dashMatch = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dashMatch) {
    const [, m, d, y] = dashMatch;
    return `${y}-${m!.padStart(2, '0')}-${d!.padStart(2, '0')}`;
  }

  return null;
}

/**
 * Strip currency symbols, thousands separators, and convert parenthetical
 * negatives like (4.50) to -4.50. Returns null if the result is not numeric.
 */
function cleanAmountString(raw: string): string | null {
  const stripped = raw.trim().replace(/[$£€,\s]/g, '').replace(/\((\d+\.?\d*)\)/, '-$1');
  if (!stripped || !/^-?\d+(\.\d+)?$/.test(stripped)) return null;
  return stripped;
}

/** True when a record carries no content at all — a blank line in the file. */
function isBlankRecord(record: string[]): boolean {
  return record.every((f) => f.trim().length === 0);
}

// ---------------------------------------------------------------------------
// parseTransactionsCsv
// ---------------------------------------------------------------------------

/** Parse the full CSV text into validated transaction rows. */
export function parseTransactionsCsv(text: string): ParseResult {
  const records = parseCsvRecords(text);

  const headerIdx = records.findIndex((r) => !isBlankRecord(r));
  if (headerIdx === -1) throw new Error('CSV appears to be empty.');

  const headers = records[headerIdx]!;
  const lower = headers.map((h) => h.trim().toLowerCase());

  const dateIdx = lower.findIndex((h) => DATE_COLS.includes(h));
  const descIdx = lower.findIndex((h) => DESC_COLS.includes(h));
  const amountIdx = lower.findIndex((h) => AMOUNT_COLS.includes(h));
  const debitIdx = lower.findIndex((h) => DEBIT_COLS.includes(h));
  const creditIdx = lower.findIndex((h) => CREDIT_COLS.includes(h));
  // typeIdx: column whose value is "Credit" or "Debit" text (direction indicator)
  const typeIdx = lower.findIndex((h) => TYPE_COLS.includes(h));

  if (dateIdx === -1) {
    throw new Error(
      `No date column found. Headers: ${headers.join(', ')}. ` +
        `Expected one of: ${DATE_COLS.join(', ')}.`,
    );
  }
  if (descIdx === -1) {
    throw new Error(
      `No description column found. Headers: ${headers.join(', ')}. ` +
        `Expected one of: ${DESC_COLS.join(', ')}.`,
    );
  }
  const hasAmount = amountIdx !== -1;
  const hasDebitCredit = debitIdx !== -1 && creditIdx !== -1;
  if (!hasAmount && !hasDebitCredit) {
    throw new Error(
      `No amount column found. Headers: ${headers.join(', ')}. ` +
        `Expected "${AMOUNT_COLS.join('" or "')}", or both debit and credit columns.`,
    );
  }

  // When a type/direction column exists alongside a plain Amount column,
  // the Amount is always positive and the type value ("Debit"/"Credit")
  // determines the sign. Without a type column the Amount is used as-is.
  const hasTypeIndicator = typeIdx !== -1 && hasAmount;

  const amountColLabel = hasAmount
    ? (headers[amountIdx]!)
    : `${headers[debitIdx]!} / ${headers[creditIdx]!}`;
  const typeColLabel = hasTypeIndicator ? ` · ${headers[typeIdx]!} → sign` : '';
  const columnInfo = `${headers[dateIdx]!} → date · ${headers[descIdx]!} → description · ${amountColLabel} → amount${typeColLabel}`;

  const rows: ParseResult['rows'] = [];

  for (let i = headerIdx + 1; i < records.length; i++) {
    const fields = records[i]!;
    if (isBlankRecord(fields)) continue;

    const dateRaw = fields[dateIdx]?.trim() ?? '';
    const desc = fields[descIdx]?.trim() ?? '';

    if (!dateRaw || !desc) continue;

    const date = normalizeDate(dateRaw);
    if (!date) continue; // unrecognized date format — skip silently

    let amount: string;
    if (hasAmount) {
      const cleaned = cleanAmountString(fields[amountIdx]?.trim() ?? '');
      if (!cleaned) continue;
      // Use Decimal for accurate fixed-point string formatting
      try {
        let decimal = new Decimal(cleaned);
        if (hasTypeIndicator) {
          // "Credit or Debit" / "Type" column: "Debit" means money leaving account
          const typVal = (fields[typeIdx]?.trim() ?? '').toLowerCase();
          if (typVal.includes('debit') && decimal.greaterThan(0)) {
            decimal = decimal.negated();
          }
        }
        amount = decimal.toFixed(2);
      } catch {
        continue;
      }
    } else {
      const debitClean = cleanAmountString(fields[debitIdx!]?.trim() ?? '');
      const creditClean = cleanAmountString(fields[creditIdx!]?.trim() ?? '');
      const debitVal = debitClean ? new Decimal(debitClean) : new Decimal(0);
      const creditVal = creditClean ? new Decimal(creditClean) : new Decimal(0);
      if (debitVal.isZero() && creditVal.isZero()) continue;
      // Debit column values represent money leaving the account (negative)
      amount = debitVal.greaterThan(0)
        ? debitVal.negated().toFixed(2)
        : creditVal.toFixed(2);
    }

    // Validate the final amount matches the backend's expected regex
    if (!/^-?\d+(\.\d{1,2})?$/.test(amount)) continue;

    rows.push({ date, description: desc.slice(0, 255), amount });
  }

  if (rows.length === 0) {
    throw new Error(
      'No valid transactions found. Verify the file has data rows and the columns were detected correctly.',
    );
  }

  return { rows, columnInfo };
}
