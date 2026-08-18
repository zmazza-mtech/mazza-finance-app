import { useRef, useState } from 'react';
import { useAccounts } from '@/hooks/useAccounts';
import { useImportTransactions } from '@/hooks/useImport';
import { parseTransactionsCsv, type ParseResult } from '@/lib/csv';

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
