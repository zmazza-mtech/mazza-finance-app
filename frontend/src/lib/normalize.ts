/**
 * Strips common bank transaction prefixes (card numbers, reference codes)
 * to expose the actual vendor/merchant name.
 *
 * Must stay in sync with backend normalizeDescription in categorize.ts.
 */
export function normalizeDescription(description: string): string {
  let s = description;
  s = s.replace(/^(DBT|POS|CHK|CHECK)\s*(CRD|CARD|DEBIT|PURCHASE)\s+\d{3,4}\s+\d+\s+/i, '');
  s = s.replace(/^(POS|ACH)\s+(DEBIT|CREDIT|WITHDRAWAL|DEPOSIT)\s*(\d+\s+)?/i, '');
  s = s.replace(/^CHECKCARD\s+\d+\s+/i, '');
  s = s.replace(/^RECURRING\s+(DEBIT|CREDIT|PAYMENT)\s*/i, '');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}
