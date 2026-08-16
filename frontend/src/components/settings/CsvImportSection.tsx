import { useRef, useState } from 'react';
import Decimal from 'decimal.js';
import { useAccounts } from '@/hooks/useAccounts';
import { useImportTransactions } from '@/hooks/useImport';
import type { ImportBody } from '@/api/types';

// ---------------------------------------------------------------------------
// CSV parsing utilities
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

interface ParseResult {
  rows: ImportBody['transactions'];
  columnInfo: string;
}

/** Parse a single CSV line, handling double-quoted fields with embedded commas. */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      let field = '';
      i++; // skip opening quote
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') {
          field += '"';
          i += 2;
        } else if (line[i] === '"') {
          i++; // skip closing quote
          break;
        } else {
          field += line[i]!;
          i++;
        }
      }
      fields.push(field);
      if (line[i] === ',') i++;
    } else {
      const end = line.indexOf(',', i);
      if (end === -1) {
        fields.push(line.slice(i));
        break;
      } else {
        fields.push(line.slice(i, end));
        i = end + 1;
      }
    }
  }
  return fields;
}

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

/** Parse the full CSV text into validated transaction rows. */
function parseTransactionsCsv(text: string): ParseResult {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  const headerLineIdx = lines.findIndex((l) => l.trim().length > 0);
  if (headerLineIdx === -1) throw new Error('CSV appears to be empty.');

  const headers = parseCsvLine(lines[headerLineIdx]!);
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

  for (let i = headerLineIdx + 1; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;

    const fields = parseCsvLine(lines[i]!);

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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CsvImportSection() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { data: accounts = [] } = useAccounts();
  const importMutation = useImportTransactions();

  const [accountId, setAccountId] = useState('');
  const [parsedRows, setParsedRows] = useState<ParseResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset any previous import state when a new file is selected
    importMutation.reset();
    setParsedRows(null);
    setParseError(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result;
      if (typeof text !== 'string') return;
      try {
        setParsedRows(parseTransactionsCsv(text));
      } catch (err) {
        setParseError(err instanceof Error ? err.message : 'Failed to parse CSV.');
      }
    };
    reader.readAsText(file);
  }

  function handleImport() {
    if (!parsedRows || !accountId) return;
    importMutation.mutate({ accountId, transactions: parsedRows.rows });
  }

  function handleReset() {
    setParsedRows(null);
    setParseError(null);
    importMutation.reset();
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-stone">
        CSV with date, description and amount columns. Duplicates are skipped.
      </p>

      {/*
        A file picker, not a drop target — there is no drag handler here, and on
        a phone there would be nothing to drag. The dashed border is the
        handoff's tap-to-choose box.
      */}
      <div className="rounded-lg border border-dashed border-border-mid bg-cream p-4 text-center sm:p-7">
        <p className="text-sm text-stone">Choose a CSV export from your bank.</p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileChange}
          aria-label="Select a CSV file to import"
          className="hit-target mt-3 w-full text-sm text-stone file:mr-3 file:cursor-pointer file:rounded-full file:border file:border-cream-mid file:bg-surface file:px-4 file:py-2 file:text-sm file:text-bark hover:file:border-sage-light"
        />
      </div>

      {/* Parse error */}
      {parseError && (
        <p className="text-sm text-error" role="alert">
          {parseError}
        </p>
      )}

      {/* Parse success — show row count, column mapping, account selector, import button */}
      {parsedRows && !importMutation.isSuccess && (
        <div className="space-y-3">
          <div className="text-sm text-charcoal">
            <p>
              <span className="font-medium">{parsedRows.rows.length}</span> transaction
              {parsedRows.rows.length !== 1 ? 's' : ''} detected
            </p>
            <p className="label-mono mt-1">
              {parsedRows.columnInfo}
            </p>
          </div>

          <div>
            <label
              htmlFor="import-account"
              className="mb-1 block text-[13px] font-medium text-charcoal"
            >
              Import to account
            </label>
            <select
              id="import-account"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="hit-target block w-full max-w-sm rounded-md border border-cream-mid bg-cream px-3.5 py-[11px] text-sm text-charcoal focus:outline-none focus-visible:ring-2 focus-visible:ring-sage"
            >
              <option value="">Select an account…</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.institution} — {a.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleImport}
              disabled={!accountId || importMutation.isPending}
              className="hit-target rounded-full bg-copper px-[18px] py-[11px] text-sm font-semibold text-cream transition-all duration-150 ease-out hover:-translate-y-px hover:bg-copper-dark hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-sage disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
            >
              {importMutation.isPending ? 'Importing…' : 'Import'}
            </button>
            <button
              onClick={handleReset}
              className="hit-target rounded-full border border-cream-mid bg-surface px-[18px] py-[11px] text-sm text-stone transition-colors duration-150 hover:border-sage-light hover:text-bark focus:outline-none focus-visible:ring-2 focus-visible:ring-sage"
            >
              Cancel
            </button>
          </div>

          {importMutation.isError && (
            <p className="text-sm text-error" role="alert">
              Import failed — please try again.
            </p>
          )}
        </div>
      )}

      {/* Import result */}
      {importMutation.isSuccess && importMutation.data && (
        <div
          role="status"
          className="space-y-2 rounded-md border border-sage-light bg-sage-lighter/40 p-3.5"
        >
          <p className="text-sm text-sage-deep">
            Imported{' '}
            <span className="font-medium">{importMutation.data.imported}</span>
            {importMutation.data.skipped > 0 && (
              <>
                {' · '}Skipped{' '}
                <span className="font-medium">{importMutation.data.skipped}</span> duplicates
              </>
            )}
            {importMutation.data.errors.length > 0 && (
              <>
                {' · '}
                <span className="font-medium">{importMutation.data.errors.length}</span> errors
              </>
            )}
          </p>
          {importMutation.data.errors.length > 0 && (
            <ul className="list-inside list-disc space-y-0.5 text-xs text-error">
              {importMutation.data.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
          <button
            onClick={handleReset}
            className="hit-target text-[13px] text-sage-dark underline decoration-sage-light underline-offset-2 hover:text-sage-deep"
          >
            Import another file
          </button>
        </div>
      )}
    </div>
  );
}
