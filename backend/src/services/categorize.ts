export const CATEGORIES = [
  'Income',
  'Housing',
  'Utilities',
  'Groceries',
  'Transportation',
  'Insurance',
  'Healthcare',
  'Entertainment',
  'Dining',
  'Shopping',
  'Subscriptions',
  'Transfers',
  'Other',
] as const;

export type Category = (typeof CATEGORIES)[number];

// ---------------------------------------------------------------------------
// Description normalization — strip bank transaction prefixes
// ---------------------------------------------------------------------------

/**
 * Strips common bank transaction prefixes (card numbers, reference codes)
 * to expose the actual vendor/merchant name for keyword matching.
 *
 * Examples:
 *   "DBT CRD 0407 27105864 TSTDRIP KITCHEN AND CO ATHEN..." → "TSTDRIP KITCHEN AND CO ATHEN..."
 *   "POS DEBIT 1234 STARBUCKS COFFEE" → "STARBUCKS COFFEE"
 *   "ACH DEBIT NETFLIX.COM" → "NETFLIX.COM"
 */
export function normalizeDescription(description: string): string {
  let s = description;
  // DBT CRD XXXX XXXXXXXX, POS CRD XXXX XXXXXXXX, CHK CRD XXXX XXXXXXXX
  s = s.replace(/^(DBT|POS|CHK|CHECK)\s*(CRD|CARD|DEBIT|PURCHASE)\s+\d{3,4}\s+\d+\s+/i, '');
  // POS DEBIT XXXX, ACH DEBIT, ACH CREDIT
  s = s.replace(/^(POS|ACH)\s+(DEBIT|CREDIT|WITHDRAWAL|DEPOSIT)\s*(\d+\s+)?/i, '');
  // CHECKCARD XXXX
  s = s.replace(/^CHECKCARD\s+\d+\s+/i, '');
  // RECURRING anything
  s = s.replace(/^RECURRING\s+(DEBIT|CREDIT|PAYMENT)\s*/i, '');
  // Collapse whitespace
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

// Keyword map: first match wins. More specific patterns before broader ones.
const KEYWORD_MAP: Array<[string[], Category]> = [
  // Income
  [['payroll', 'direct dep', 'salary', 'wages', 'paycheck', 'direct deposit'], 'Income'],
  // Housing
  [['mortgage', 'rent ', 'hoa ', 'property tax', 'home equity'], 'Housing'],
  // Utilities
  [['electric', 'gas bill', 'water bill', 'internet', 'comcast', 'verizon fios', 'spectrum', 'xfinity', 'sewer', 'trash', 'waste mgmt', 'at&t', 'att uverse'], 'Utilities'],
  // Groceries
  [['kroger', 'publix', 'walmart', 'costco', 'aldi', 'trader joe', 'whole foods', 'safeway', 'grocery', 'food lion', 'h-e-b', 'wegmans', 'sprouts', 'ingles', 'piggly'], 'Groceries'],
  // Transportation
  [['shell oil', 'exxon', 'chevron', 'gasoline', 'fuel', 'uber trip', 'lyft', 'parking', 'toll', 'ez pass', 'car wash', 'jiffy lube', 'auto parts', 'marathon', 'bp ', 'racetrac', 'murphy'], 'Transportation'],
  // Insurance
  [['insurance', 'geico', 'state farm', 'allstate', 'progressive', 'usaa', 'liberty mutual'], 'Insurance'],
  // Healthcare
  [['pharmacy', 'cvs', 'walgreens', 'doctor', 'medical', 'dental', 'hospital', 'urgent care', 'copay', 'labcorp', 'quest diag'], 'Healthcare'],
  // Entertainment
  [['netflix', 'hulu', 'disney+', 'disney plus', 'hbo', 'youtube', 'spotify', 'apple music', 'amazon prime', 'cinema', 'movie', 'theater', 'concert', 'ticketmaster'], 'Entertainment'],
  // Dining
  [['restaurant', 'mcdonald', 'starbucks', 'chipotle', 'chick-fil', 'wendy', 'burger', 'pizza', 'doordash', 'grubhub', 'uber eat', 'taco bell', 'subway', 'panera', 'cafe', 'coffee', 'diner', 'kitchen', 'grill', 'cook out', 'waffle', 'ihop', 'cracker barrel', 'zaxby', 'popeye', 'sonic drive', 'wing', 'bbq', 'bakery'], 'Dining'],
  // Shopping
  [['amazon.com', 'amzn', 'ebay', 'etsy', 'best buy', 'home depot', 'lowes', 'lowe\'s', 'apple.com', 'apple.com/bill', 'nordstrom', 'tj maxx', 'marshalls', 'target', 'dollar general', 'dollar tree', 'family dollar', 'five below', 'bath & body', 'old navy', 'gap ', 'ross ', 'becks top shelf', 'wine & spirits', 'wine &'], 'Shopping'],
  // Subscriptions
  [['subscription', 'membership', 'monthly fee', 'annual fee', 'adobe', 'microsoft 365', 'icloud', 'dropbox', 'github', 'patreon', 'klarna'], 'Subscriptions'],
  // Transfers
  [['transfer', 'zelle', 'venmo', 'paypal', 'cash app', 'wire', 'pypl'], 'Transfers'],
];

/**
 * Categorize a transaction description using keyword matching.
 * Normalizes the description first to strip bank prefixes.
 * Returns null if no keywords match (uncategorized).
 */
export function categorize(description: string): Category | null {
  const lower = normalizeDescription(description).toLowerCase();
  for (const [keywords, category] of KEYWORD_MAP) {
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        return category;
      }
    }
  }
  return null;
}
