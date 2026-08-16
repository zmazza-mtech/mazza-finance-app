import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TransactionsTable } from '@/components/transactions/TransactionsTable';
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
    recurringId: null,
    ...overrides,
  };
}

const baseProps = {
  transactions: [tx()],
  sortBy: 'date',
  sortDir: 'desc',
  onSort: vi.fn(),
  onCategoryChange: vi.fn(),
};

describe('TransactionsTable — rows', () => {
  it('renders the date, description and amount', () => {
    render(<TransactionsTable {...baseProps} />);
    expect(screen.getByText('2026-08-15')).toBeInTheDocument();
    expect(screen.getByText('Whole Foods')).toBeInTheDocument();
    expect(screen.getByText('−$84.21')).toBeInTheDocument();
  });

  it('signs a credit as an inflow', () => {
    render(
      <TransactionsTable
        {...baseProps}
        transactions={[tx({ amount: '1200.00', category: 'Income' })]}
      />,
    );
    expect(screen.getByText('+$1,200.00')).toBeInTheDocument();
  });

  it('renders the source badge', () => {
    render(<TransactionsTable {...baseProps} />);
    expect(screen.getByLabelText('Transaction source: actual')).toBeInTheDocument();
  });

  it('renders one row per transaction', () => {
    render(
      <TransactionsTable
        {...baseProps}
        transactions={[tx({ id: 'a' }), tx({ id: 'b', description: 'Blue Bottle' })]}
      />,
    );
    expect(screen.getAllByRole('row')).toHaveLength(3); // header + two body rows
  });
});

describe('TransactionsTable — empty state', () => {
  it('explains an empty date range', () => {
    render(<TransactionsTable {...baseProps} transactions={[]} />);
    expect(
      screen.getByText('No transactions found for the selected date range.'),
    ).toBeInTheDocument();
  });

  it('blames the filters when they are what emptied the table', () => {
    render(<TransactionsTable {...baseProps} transactions={[]} isFiltered />);
    expect(
      screen.getByText('No transactions match the current filters.'),
    ).toBeInTheDocument();
  });
});

describe('TransactionsTable — sorting', () => {
  it('reports the column clicked', async () => {
    const onSort = vi.fn();
    render(<TransactionsTable {...baseProps} onSort={onSort} />);
    await userEvent.click(screen.getByRole('button', { name: /Amount/ }));
    expect(onSort).toHaveBeenCalledWith('amount');
  });

  it('marks the descending sort column for assistive technology', () => {
    render(<TransactionsTable {...baseProps} sortBy="date" sortDir="desc" />);
    expect(screen.getByRole('columnheader', { name: /Date/ })).toHaveAttribute(
      'aria-sort',
      'descending',
    );
  });

  it('marks the ascending sort column for assistive technology', () => {
    render(<TransactionsTable {...baseProps} sortBy="date" sortDir="asc" />);
    expect(screen.getByRole('columnheader', { name: /Date/ })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
  });

  it('leaves unsorted columns without a sort direction', () => {
    render(<TransactionsTable {...baseProps} sortBy="date" sortDir="desc" />);
    expect(screen.getByRole('columnheader', { name: /Amount/ })).toHaveAttribute(
      'aria-sort',
      'none',
    );
  });
});

describe('TransactionsTable — category cell', () => {
  // The pill label and the hidden <select> both carry the category name, so
  // these queries scope to the visible pill.
  it('shows the current category as a pill', () => {
    render(<TransactionsTable {...baseProps} />);
    expect(screen.getByText('Groceries', { selector: 'span' })).toBeInTheDocument();
  });

  it('labels an unassigned category', () => {
    render(<TransactionsTable {...baseProps} transactions={[tx({ category: null })]} />);
    expect(screen.getByText('Uncategorized', { selector: 'span' })).toBeInTheDocument();
  });

  it('keeps the select bound to the current category', () => {
    render(<TransactionsTable {...baseProps} />);
    expect(screen.getByLabelText('Category for Whole Foods')).toHaveValue('Groceries');
  });

  it('reports a category change', async () => {
    const onCategoryChange = vi.fn();
    render(<TransactionsTable {...baseProps} onCategoryChange={onCategoryChange} />);
    await userEvent.selectOptions(
      screen.getByLabelText('Category for Whole Foods'),
      'Dining',
    );
    expect(onCategoryChange).toHaveBeenCalledWith('tx-1', 'Dining');
  });

  it('reports clearing a category as null', async () => {
    const onCategoryChange = vi.fn();
    render(<TransactionsTable {...baseProps} onCategoryChange={onCategoryChange} />);
    await userEvent.selectOptions(
      screen.getByLabelText('Category for Whole Foods'),
      '',
    );
    expect(onCategoryChange).toHaveBeenCalledWith('tx-1', null);
  });

  // The select is painted at opacity 0 underneath the pill. That hides it
  // without taking it out of the tab order the way display:none would, and a
  // correction has to be reachable without a mouse.
  it('reaches the category picker by tabbing', async () => {
    const user = userEvent.setup();
    render(<TransactionsTable {...baseProps} />);
    const select = screen.getByLabelText('Category for Whole Foods');

    // The sortable column headers take the earlier stops.
    for (let i = 0; i < 10 && select !== document.activeElement; i++) {
      await user.tab();
    }

    expect(select).toHaveFocus();
  });

  it('changes a category from the keyboard once focused', async () => {
    const onCategoryChange = vi.fn();
    const user = userEvent.setup();
    render(<TransactionsTable {...baseProps} onCategoryChange={onCategoryChange} />);

    const select = screen.getByLabelText('Category for Whole Foods');
    select.focus();
    await user.selectOptions(select, 'Dining');

    expect(select).toHaveFocus();
    expect(onCategoryChange).toHaveBeenCalledWith('tx-1', 'Dining');
  });
});
