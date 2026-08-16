/**
 * A CSV writer, to RFC 4180's quoting rules.
 *
 * Exists so the export endpoints share one opinion about quoting. Two exports
 * assembling rows by string concatenation would eventually disagree about a
 * description containing a comma, and one of them would be wrong — silently,
 * because a broken quote does not fail, it just shifts every later column.
 *
 * Rows are terminated with `\n` rather than RFC 4180's `\r\n`: every reader
 * that matters accepts it, including this application's own import path, and a
 * lone `\n` is what a text editor on the household's machines will show.
 */

/** True when a field cannot be written bare. */
function needsQuoting(field: string): boolean {
  return field.includes(',') || field.includes('"') || field.includes('\n') || field.includes('\r');
}

/** One field, quoted if it must be, with any embedded quote doubled. */
function encodeField(field: string): string {
  if (!needsQuoting(field)) return field;
  return `"${field.replace(/"/g, '""')}"`;
}

/**
 * A complete CSV document: the header row, then one row per entry, each
 * terminated by a newline. Values are written exactly as given — amounts are
 * already decimal strings and must not pick up a currency symbol, a thousands
 * separator, or a rounding on the way out.
 */
export function toCsv(headers: string[], rows: string[][]): string {
  return [headers, ...rows].map((row) => row.map(encodeField).join(',')).join('\n') + '\n';
}
