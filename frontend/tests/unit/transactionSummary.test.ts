import { describe, it, expect } from 'vitest';
import {
  summarizeTransactions,
  categoriesPresent,
  filterTransactions,
} from '@/lib/transactionSummary';
import type { Transaction } from '@/api/types';

function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    accountId: 'acct-1',
    date: '2026-08-15',
    description: 'Whole Foods',
    amount: '-84.21',
    source: 'actual',
    category: 'Groceries',
    categorySource: 'auto',
    ...overrides,
  };
}

describe('summarizeTransactions', () => {
  it('returns zeroes and no count for an empty list', () => {
    expect(summarizeTransactions([])).toEqual({
      moneyIn: '0.00',
      moneyOut: '0.00',
      net: '0.00',
      count: 0,
    });
  });

  it('sums credits into money in', () => {
    const summary = summarizeTransactions([
      tx({ id: 'a', amount: '1200.00', category: 'Income' }),
      tx({ id: 'b', amount: '340.50', category: 'Income' }),
    ]);
    expect(summary.moneyIn).toBe('1540.50');
    expect(summary.moneyOut).toBe('0.00');
  });

  it('sums debits into money out as a positive magnitude', () => {
    const summary = summarizeTransactions([
      tx({ id: 'a', amount: '-84.21' }),
      tx({ id: 'b', amount: '-15.79' }),
    ]);
    expect(summary.moneyOut).toBe('100.00');
    expect(summary.moneyIn).toBe('0.00');
  });

  it('nets credits against debits', () => {
    const summary = summarizeTransactions([
      tx({ id: 'a', amount: '1200.00', category: 'Income' }),
      tx({ id: 'b', amount: '-450.25' }),
    ]);
    expect(summary.net).toBe('749.75');
  });

  it('reports a negative net when spending outruns income', () => {
    const summary = summarizeTransactions([
      tx({ id: 'a', amount: '100.00', category: 'Income' }),
      tx({ id: 'b', amount: '-250.00' }),
    ]);
    expect(summary.net).toBe('-150.00');
  });

  it('counts every transaction, including zero-amount rows', () => {
    const summary = summarizeTransactions([
      tx({ id: 'a', amount: '-10.00' }),
      tx({ id: 'b', amount: '0.00' }),
      tx({ id: 'c', amount: '10.00' }),
    ]);
    expect(summary.count).toBe(3);
  });

  it('adds cents exactly rather than through floating point', () => {
    const summary = summarizeTransactions([
      tx({ id: 'a', amount: '-0.10' }),
      tx({ id: 'b', amount: '-0.20' }),
    ]);
    expect(summary.moneyOut).toBe('0.30');
  });
});

describe('categoriesPresent', () => {
  it('returns nothing for an empty list', () => {
    expect(categoriesPresent([])).toEqual([]);
  });

  it('lists each category once', () => {
    const present = categoriesPresent([
      tx({ id: 'a', category: 'Groceries' }),
      tx({ id: 'b', category: 'Groceries' }),
      tx({ id: 'c', category: 'Dining' }),
    ]);
    expect(present).toEqual(['Groceries', 'Dining']);
  });

  it('orders categories by the canonical category order, not by appearance', () => {
    const present = categoriesPresent([
      tx({ id: 'a', category: 'Dining' }),
      tx({ id: 'b', category: 'Income' }),
      tx({ id: 'c', category: 'Groceries' }),
    ]);
    expect(present).toEqual(['Income', 'Groceries', 'Dining']);
  });

  it('appends uncategorized last when some rows have no category', () => {
    const present = categoriesPresent([
      tx({ id: 'a', category: null }),
      tx({ id: 'b', category: 'Income' }),
    ]);
    expect(present).toEqual(['Income', 'uncategorized']);
  });

  it('omits uncategorized when every row is categorized', () => {
    expect(categoriesPresent([tx({ category: 'Income' })])).toEqual(['Income']);
  });
});

describe('filterTransactions', () => {
  const all = [
    tx({ id: 'a', description: 'Whole Foods Market', category: 'Groceries' }),
    tx({ id: 'b', description: 'Blue Bottle Coffee', category: 'Dining' }),
    tx({ id: 'c', description: 'Payroll deposit', category: null }),
  ];

  it('returns everything when the filter is all and the query is empty', () => {
    expect(filterTransactions(all, 'all', '')).toHaveLength(3);
  });

  it('keeps only the selected category', () => {
    const result = filterTransactions(all, 'Dining', '');
    expect(result.map((t) => t.id)).toEqual(['b']);
  });

  it('keeps only uncategorized rows when uncategorized is selected', () => {
    const result = filterTransactions(all, 'uncategorized', '');
    expect(result.map((t) => t.id)).toEqual(['c']);
  });

  it('matches the description case-insensitively', () => {
    const result = filterTransactions(all, 'all', 'whole foods');
    expect(result.map((t) => t.id)).toEqual(['a']);
  });

  it('matches on a substring anywhere in the description', () => {
    const result = filterTransactions(all, 'all', 'bottle');
    expect(result.map((t) => t.id)).toEqual(['b']);
  });

  it('ignores surrounding whitespace in the query', () => {
    const result = filterTransactions(all, 'all', '  coffee  ');
    expect(result.map((t) => t.id)).toEqual(['b']);
  });

  it('applies the category filter and the query together', () => {
    const result = filterTransactions(all, 'Groceries', 'coffee');
    expect(result).toEqual([]);
  });

  it('preserves the incoming order so the server sort survives filtering', () => {
    const result = filterTransactions(all, 'all', 'o');
    expect(result.map((t) => t.id)).toEqual(['a', 'b', 'c']);
  });
});
