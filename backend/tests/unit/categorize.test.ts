import { describe, it, expect } from 'vitest';
import { categorize, normalizeDescription, CATEGORIES } from '../../src/services/categorize';

describe('categorize', () => {
  it('returns null for unknown descriptions', () => {
    expect(categorize('RANDOM UNKNOWN VENDOR')).toBeNull();
    expect(categorize('')).toBeNull();
  });

  it('is case-insensitive', () => {
    expect(categorize('NETFLIX.COM MONTHLY')).toBe('Entertainment');
    expect(categorize('netflix.com monthly')).toBe('Entertainment');
    expect(categorize('Netflix.Com Monthly')).toBe('Entertainment');
  });

  // Income
  it('categorizes payroll as Income', () => {
    expect(categorize('PAYROLL DIRECT DEP')).toBe('Income');
    expect(categorize('COMPANY SALARY DEPOSIT')).toBe('Income');
  });

  // Housing
  it('categorizes housing payments', () => {
    expect(categorize('WELLS FARGO MORTGAGE PMT')).toBe('Housing');
    expect(categorize('RENT PAYMENT APT 4B')).toBe('Housing');
    expect(categorize('HOA QUARTERLY ASSESSMENT')).toBe('Housing');
  });

  // Utilities
  it('categorizes utilities', () => {
    expect(categorize('DUKE ENERGY ELECTRIC')).toBe('Utilities');
    expect(categorize('COMCAST CABLE INTERNET')).toBe('Utilities');
    expect(categorize('SPECTRUM MONTHLY')).toBe('Utilities');
  });

  // Groceries
  it('categorizes grocery stores', () => {
    expect(categorize('KROGER #1234')).toBe('Groceries');
    expect(categorize('WALMART SUPERCENTER')).toBe('Groceries');
    expect(categorize('TRADER JOE\'S #567')).toBe('Groceries');
    expect(categorize('COSTCO WHSE #890')).toBe('Groceries');
  });

  // Transportation
  it('categorizes transportation', () => {
    expect(categorize('SHELL OIL 123456')).toBe('Transportation');
    expect(categorize('UBER TRIP HELP.UBER.COM')).toBe('Transportation');
    expect(categorize('EZ PASS REPLENISH')).toBe('Transportation');
  });

  // Insurance
  it('categorizes insurance', () => {
    expect(categorize('GEICO AUTO INSURANCE')).toBe('Insurance');
    expect(categorize('STATE FARM INSURANCE')).toBe('Insurance');
    expect(categorize('PROGRESSIVE INSURANCE PMT')).toBe('Insurance');
  });

  // Healthcare
  it('categorizes healthcare', () => {
    expect(categorize('CVS/PHARMACY #1234')).toBe('Healthcare');
    expect(categorize('WALGREENS #5678')).toBe('Healthcare');
    expect(categorize('URGENT CARE COPAY')).toBe('Healthcare');
  });

  // Entertainment
  it('categorizes entertainment', () => {
    expect(categorize('NETFLIX.COM')).toBe('Entertainment');
    expect(categorize('HULU MONTHLY')).toBe('Entertainment');
    expect(categorize('SPOTIFY PREMIUM')).toBe('Entertainment');
    expect(categorize('DISNEY+ ANNUAL')).toBe('Entertainment');
  });

  // Dining
  it('categorizes dining', () => {
    expect(categorize('STARBUCKS STORE #123')).toBe('Dining');
    expect(categorize('CHIPOTLE ONLINE')).toBe('Dining');
    expect(categorize('DOORDASH*MCDONALDS')).toBe('Dining');
    expect(categorize('PANERA BREAD #456')).toBe('Dining');
  });

  // Shopping
  it('categorizes shopping', () => {
    expect(categorize('AMZN MKTP US*AB1CD2EF3')).toBe('Shopping');
    expect(categorize('AMAZON.COM*AB1CD2EF3')).toBe('Shopping');
    expect(categorize('BEST BUY #1234')).toBe('Shopping');
    expect(categorize('HOME DEPOT #5678')).toBe('Shopping');
    expect(categorize('TARGET #1234')).toBe('Shopping');
  });

  // Subscriptions
  it('categorizes subscriptions', () => {
    expect(categorize('ADOBE CREATIVE CLOUD')).toBe('Subscriptions');
    expect(categorize('MICROSOFT 365 PERSONAL')).toBe('Subscriptions');
    expect(categorize('ICLOUD STORAGE')).toBe('Subscriptions');
  });

  // Transfers
  it('categorizes transfers', () => {
    expect(categorize('ZELLE PAYMENT TO JOHN')).toBe('Transfers');
    expect(categorize('VENMO CASHOUT')).toBe('Transfers');
    expect(categorize('ACH TRANSFER 1234')).toBe('Transfers');
  });

  // Bank-prefixed descriptions
  it('categorizes through DBT CRD prefix', () => {
    expect(categorize('DBT CRD 0407 27105864 TSTDRIP KITCHEN AND CO ATHENS TN')).toBe('Dining');
    expect(categorize('DBT CRD 1135 25663846 COOK OUT ATHENS TN')).toBe('Dining');
    expect(categorize('DBT CRD 2150 20104716 APPLE.COM/BILL 866-712-7753')).toBe('Shopping');
    expect(categorize('DBT CRD 1325 29000729 PATREON MEMBERSHIP 833-9728')).toBe('Subscriptions');
    expect(categorize('DBT CRD 0347 29002884 GOOGLE YOUTUBEPREMIUM 650')).toBe('Entertainment');
    expect(categorize('DBT CRD 1424 29067970 PAYPAL PYPL PAYIN4 888-221-116')).toBe('Transfers');
  });

  it('exports CATEGORIES array with all expected values', () => {
    expect(CATEGORIES).toHaveLength(13);
    expect(CATEGORIES).toContain('Income');
    expect(CATEGORIES).toContain('Other');
  });
});

describe('normalizeDescription', () => {
  it('strips DBT CRD prefix', () => {
    expect(normalizeDescription('DBT CRD 0407 27105864 TSTDRIP KITCHEN AND CO'))
      .toBe('TSTDRIP KITCHEN AND CO');
  });

  it('strips POS DEBIT prefix', () => {
    expect(normalizeDescription('POS DEBIT 1234 STARBUCKS COFFEE'))
      .toBe('STARBUCKS COFFEE');
  });

  it('strips ACH DEBIT prefix', () => {
    expect(normalizeDescription('ACH DEBIT NETFLIX.COM'))
      .toBe('NETFLIX.COM');
  });

  it('strips CHECKCARD prefix', () => {
    expect(normalizeDescription('CHECKCARD 1234 TARGET #5678'))
      .toBe('TARGET #5678');
  });

  it('leaves clean descriptions unchanged', () => {
    expect(normalizeDescription('NETFLIX.COM MONTHLY')).toBe('NETFLIX.COM MONTHLY');
  });

  it('collapses whitespace', () => {
    expect(normalizeDescription('DBT CRD 0407 27105864  SOME   VENDOR'))
      .toBe('SOME VENDOR');
  });
});
