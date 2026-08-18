/**
 * A CSV reader, for the round-trip tests only.
 *
 * The application has no production CSV reader on this side — the import
 * endpoint takes rows as JSON, and the browser does the parsing. This exists so
 * a test can read back what `toCsv` wrote and feed it to the importer, which is
 * the only way to assert that an export survives a re-import.
 *
 * It is deliberately not exported from `src`: a reader nothing in production
 * calls would be dead code there. The browser's reader lives in
 * `frontend/src/lib/csv.ts` and is the one that matters; this one exists to
 * check `toCsv`'s output independently of it, and the round-trip tests are what
 * keep the two opinions from drifting apart.
 */

/** Rows of fields, header included, from an RFC 4180 document. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = 0;

  /** Ends the current field, and the row too when `endRow` is set. */
  function commit(endRow: boolean): void {
    row.push(field);
    field = '';
    if (endRow) {
      rows.push(row);
      row = [];
    }
  }

  while (i < text.length) {
    const char = text[i]!;

    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 2;
      } else if (char === '"') {
        quoted = false;
        i += 1;
      } else {
        field += char;
        i += 1;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
      i += 1;
    } else if (char === ',') {
      commit(false);
      i += 1;
    } else if (char === '\n') {
      commit(true);
      i += 1;
    } else if (char === '\r') {
      i += 1;
    } else {
      field += char;
      i += 1;
    }
  }

  // A trailing newline ends the last row; anything left is an unterminated one.
  if (field.length > 0 || row.length > 0) commit(true);

  return rows;
}

/** The data rows of a CSV as objects keyed by its header row. */
export function parseCsvRecords(text: string): Record<string, string>[] {
  const [headers, ...rows] = parseCsv(text);
  if (!headers) return [];

  return rows.map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])),
  );
}
