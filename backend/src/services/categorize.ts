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
  'Loan Payments',
  'Taxes',
  'Fitness',
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
  // DDA B/P XXXX XXXXXXXX (bill pay via DDA)
  s = s.replace(/^DDA\s+B\/P\s+\d{3,4}\s+\d+\s+/i, '');
  // Bare numeric prefix: 4-digit time/code + 8+ digit reference (e.g. "1933 20370891 FOOD CITY")
  s = s.replace(/^\d{4}\s+\d{8,}\s+/i, '');
  // Strip trailing CARD# XXXX references
  s = s.replace(/\s+C(?:ARD)?#\s*\d+\s*$/i, '');
  // Collapse whitespace
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

// Keyword map: first match wins. More specific patterns before broader ones.
const KEYWORD_MAP: Array<[string[], Category]> = [
  // Loan Payments — credit card payments, personal loans, BNPL (must be before Transfers)
  [['applecard gsbank', 'ccpymt', 'crcardpmt', 'cc pymt', 'mobile pmt capital one',
    'capital one mobile pmt', 'syf paymnt', 'payment synchrony', 'synchrony bank',
    'comenity pay', 'auto pay comenity', 'payment belk', 'wells fargo card',
    'affirm.com', 'afterpay', 'avant.com', 'avant llc',
    'loan pymt', 'loan-telephone', 'one finance',
    'bill paid-ut federal credit', 'web pay aven home financ',
    'rras- golden eag', 'roadrunner accou', 'payment hsn',
    'bill payment check'], 'Loan Payments'],
  // Taxes
  [['usataxpymt', 'irs ', 'tax pymt', 'state tax', 'tax payment'], 'Taxes'],
  // Fitness
  [['ymca', 'family ym', 'athens mcminn family', 'gym', 'planet fitness',
    'anytime fitness', 'crossfit', 'orangetheory'], 'Fitness'],
  // Income
  [['payroll', 'direct dep', 'salary', 'wages', 'paycheck', 'direct deposit',
    'soc sec', 'ssa treas', 'interest deposit'], 'Income'],
  // Housing
  [['mortgage', 'rent ', 'hoa ', 'property tax', 'home equity',
    'mtge paymt', 'servicemac'], 'Housing'],
  // Utilities
  [['electric', 'gas bill', 'water bill', 'internet', 'comcast', 'verizon fios',
    'spectrum', 'xfinity', 'sewer', 'trash', 'waste mgmt', 'at&t', 'att uverse'], 'Utilities'],
  // Groceries
  [['kroger', 'publix', 'walmart', 'costco', 'aldi', 'trader joe', 'whole foods',
    'safeway', 'grocery', 'food lion', 'h-e-b', 'wegmans', 'sprouts', 'ingles',
    'piggly', 'food city', 'carniceria', 'sunrise market',
    'wal-mart', 'wm supercenter', 'creekside market'], 'Groceries'],
  // Transportation
  [['shell oil', 'shell service', 'exxon', 'chevron', 'gasoline', 'fuel', 'uber trip',
    'lyft', 'parking', 'toll', 'ez pass', 'car wash', 'jiffy lube', 'auto parts',
    'marathon', 'bp ', 'bp#', 'racetrac', 'murphy', 'pilot ', 'weigel', 'circle k',
    'kwik serve', 'amoco', 'buc-ee', 'valvoline', 'vioc', 'oil change'], 'Transportation'],
  // Insurance
  [['insurance', 'geico', 'state farm', 'allstate', 'progressive', 'usaa',
    'liberty mutual', 'per insur', 'travelers'], 'Insurance'],
  // Healthcare
  [['pharmacy', 'cvs', 'walgreens', 'doctor', 'medical', 'dental', 'hospital',
    'urgent care', 'copay', 'labcorp', 'quest diag', 'lifepoint', 'teamhealth'], 'Healthcare'],
  // Entertainment — gaming and streaming (must be before Subscriptions to catch gaming)
  [['netflix', 'hulu', 'disney+', 'disney plus', 'hbo', 'youtube', 'spotify',
    'apple music', 'amazon prime', 'prime video', 'cinema', 'movie', 'theater',
    'concert', 'ticketmaster', 'steam', 'wl steam', 'blizzard', 'nintendo',
    'fortnite', 'epcfortnite', 'game pass', 'xbox', 'playstation',
    'battle.net', 'topgolf'], 'Entertainment'],
  // Dining
  [['restaurant', 'mcdonald', 'starbucks', 'chipotle', 'chick-fil', 'wendy',
    'burger', 'pizza', 'doordash', 'grubhub', 'uber eat', 'taco bell', 'subway',
    'panera', 'cafe', 'coffee', 'diner', 'kitchen', 'grill', 'cook out', 'waffle',
    'ihop', 'cracker barrel', 'zaxby', 'popeye', 'sonic drive', 'wing', 'bbq',
    'bakery', 'applebee', 'chili s', 'chilis', 'arby', 'panda express',
    'firehouse sub', 'dutch bros', 'kumo asian', 'el dorado mexican', 'pals ',
    'pals #', 'buddy', 'bar-b-q', 'bojangle', 'hardee', 'pepo', 'burrito',
    'asian chao', 'bistro', 'crowbar', 'tavern', 'michael s casual',
    'casual d', 'olive garden', 'lotus thai', 'dave', 'hot chicken',
    'gondolier', 'komma tea', 'social on depot'], 'Dining'],
  // Shopping
  [['amazon.com', 'amazon digit', 'amzn', 'ebay', 'etsy', 'best buy', 'home depot',
    'lowes', 'lowe\'s', 'lowe s', 'apple.com', 'apple.com/bill', 'nordstrom',
    'tj maxx', 'marshalls', 'target', 'dollar general', 'dollar tree',
    'family dollar', 'five below', 'bath & body', 'old navy', 'gap ', 'ross ',
    'becks top shelf', 'wine & spirits', 'wine &', 'belk', 'gabriel',
    'hobby lobby', 'hobbylobby', 'hobbytown', 'box lunch', 'micro electronic',
    'rickey', 'odds and en', 'cricut', 'rocky top market'], 'Shopping'],
  // Subscriptions
  [['subscription', 'monthly fee', 'annual fee', 'adobe', 'microsoft 365',
    'icloud', 'dropbox', 'github', 'patreon', 'klarna', 'google one',
    'apple com bill', 'kindle unltd', 'ring.com', 'ring standard',
    'simplefin', 'obsidian', 'hackthebox', 'valhost', 'rocket money',
    'infragard', 'vpn', 'openai', 'chatgpt'], 'Subscriptions'],
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
