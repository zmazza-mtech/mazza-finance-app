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
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Import transactions from a bank CSV export. Duplicates are automatically skipped.
      </p>

      {/* File picker */}
      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileChange}
          aria-label="Select a CSV file to import"
          className="text-sm text-gray-700 dark:text-gray-300 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-blue-900/30 dark:file:text-blue-400 dark:hover:file:bg-blue-900/50"
        />
      </div>

      {/* Parse error */}
      {parseError && (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {parseError}
        </p>
      )}

      {/* Parse success — show row count, column mapping, account selector, import button */}
      {parsedRows && !importMutation.isSuccess && (
        <div className="space-y-3">
          <div className="text-sm text-gray-700 dark:text-gray-300">
            <p>
              <span className="font-medium">{parsedRows.rows.length}</span> transaction
              {parsedRows.rows.length !== 1 ? 's' : ''} detected
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {parsedRows.columnInfo}
            </p>
          </div>

          <div>
            <label
              htmlFor="import-account"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Import to account
            </label>
            <select
              id="import-account"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="block w-full max-w-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100 py-1.5 px-2"
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
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {importMutation.isPending ? 'Importing…' : 'Import'}
            </button>
            <button
              onClick={handleReset}
              className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
            >
              Cancel
            </button>
          </div>

          {importMutation.isError && (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              Import failed — please try again.
            </p>
          )}
        </div>
      )}

      {/* Import result */}
      {importMutation.isSuccess && importMutation.data && (
        <div
          role="status"
          className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-3 space-y-2"
        >
          <p className="text-sm text-green-800 dark:text-green-300">
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
            <ul className="text-xs text-red-700 dark:text-red-400 space-y-0.5 list-disc list-inside">
              {importMutation.data.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
          <button
            onClick={handleReset}
            className="text-xs text-green-700 dark:text-green-400 underline"
          >
            Import another file
          </button>
        </div>
      )}
    </div>
  );
}
