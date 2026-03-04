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

// Keyword map: first match wins. More specific patterns before broader ones.
const KEYWORD_MAP: Array<[string[], Category]> = [
  // Income
  [['payroll', 'direct dep', 'salary', 'wages', 'paycheck', 'direct deposit'], 'Income'],
  // Housing
  [['mortgage', 'rent ', 'hoa ', 'property tax', 'home equity'], 'Housing'],
  // Utilities
  [['electric', 'gas bill', 'water bill', 'internet', 'comcast', 'verizon fios', 'spectrum', 'xfinity', 'sewer', 'trash', 'waste mgmt'], 'Utilities'],
  // Groceries
  [['kroger', 'publix', 'walmart', 'costco', 'aldi', 'trader joe', 'whole foods', 'safeway', 'grocery', 'food lion', 'h-e-b', 'wegmans', 'sprouts'], 'Groceries'],
  // Transportation
  [['shell oil', 'exxon', 'chevron', 'gasoline', 'fuel', 'uber trip', 'lyft', 'parking', 'toll', 'ez pass', 'car wash', 'jiffy lube', 'auto parts'], 'Transportation'],
  // Insurance
  [['insurance', 'geico', 'state farm', 'allstate', 'progressive', 'usaa', 'liberty mutual'], 'Insurance'],
  // Healthcare
  [['pharmacy', 'cvs', 'walgreens', 'doctor', 'medical', 'dental', 'hospital', 'urgent care', 'copay', 'labcorp', 'quest diag'], 'Healthcare'],
  // Entertainment
  [['netflix', 'hulu', 'disney+', 'disney plus', 'hbo', 'youtube', 'spotify', 'apple music', 'amazon prime', 'cinema', 'movie', 'theater', 'concert', 'ticketmaster'], 'Entertainment'],
  // Dining
  [['restaurant', 'mcdonald', 'starbucks', 'chipotle', 'chick-fil', 'wendy', 'burger', 'pizza', 'doordash', 'grubhub', 'uber eat', 'taco bell', 'subway', 'panera', 'cafe', 'coffee', 'diner'], 'Dining'],
  // Shopping
  [['amazon.com', 'amzn', 'ebay', 'etsy', 'best buy', 'home depot', 'lowes', 'lowe\'s', 'apple.com', 'nordstrom', 'tj maxx', 'marshalls', 'target'], 'Shopping'],
  // Subscriptions
  [['subscription', 'membership', 'monthly fee', 'annual fee', 'adobe', 'microsoft 365', 'icloud', 'dropbox', 'github'], 'Subscriptions'],
  // Transfers
  [['transfer', 'zelle', 'venmo', 'paypal', 'cash app', 'wire', 'ach '], 'Transfers'],
];

/**
 * Categorize a transaction description using keyword matching.
 * Returns null if no keywords match (uncategorized).
 */
export function categorize(description: string): Category | null {
  const lower = description.toLowerCase();
  for (const [keywords, category] of KEYWORD_MAP) {
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        return category;
      }
    }
  }
  return null;
}
