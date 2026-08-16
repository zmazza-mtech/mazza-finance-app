import { useState, useContext, useCallback, useMemo } from 'react';
import { AccountContext } from '@/App';
import { DateRangePicker } from '@/components/shared/DateRangePicker';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { TransactionsTable } from '@/components/transactions/TransactionsTable';
import { SummaryCards } from '@/components/transactions/SummaryCards';
import { CategoryFilterPills } from '@/components/transactions/CategoryFilterPills';
import { normalizeDescription } from '@/lib/normalize';
import { formatDateRange } from '@/lib/dates';
import {
  categoriesPresent,
  filterTransactions,
  summarizeTransactions,
  type CategoryFilter,
} from '@/lib/transactionSummary';
import {
  useTransactions,
  useUpdateTransactionCategory,
  useBatchCategorize,
} from '@/hooks/useTransactions';
import { useAccounts } from '@/hooks/useAccounts';
import type { Category } from '@/api/types';

function defaultStartDate(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}

function defaultEndDate(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
}

interface BatchPrompt {
  txId: string;
  description: string;
  category: Category | null;
  matchCount: number;
}

export function TransactionsPage() {
  const { selectedAccountId } = useContext(AccountContext);
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate);
  const [sortBy, setSortBy] = useState('date');
  const [sortDir, setSortDir] = useState('desc');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [batchPrompt, setBatchPrompt] = useState<BatchPrompt | null>(null);

  // The category filter is deliberately absent: it runs client-side so the
  // pill row can list every category in the range instead of collapsing to the
  // one already selected, and so the summary cards recompute without a refetch.
  const queryParams = {
    accountId: selectedAccountId || undefined,
    startDate,
    endDate,
    sortBy,
    sortDir,
  };

  const { data: transactions = [], isLoading, error } = useTransactions(queryParams);
  const updateCategory = useUpdateTransactionCategory(queryParams);
  const batchCategorize = useBatchCategorize(queryParams);
  const { data: accounts = [] } = useAccounts();

  const accountName =
    accounts.find((a) => a.id === selectedAccountId)?.name ?? 'All accounts';

  const availableCategories = useMemo(
    () => categoriesPresent(transactions),
    [transactions],
  );

  const visibleTransactions = useMemo(
    () => filterTransactions(transactions, categoryFilter, searchQuery),
    [transactions, categoryFilter, searchQuery],
  );

  const summary = useMemo(
    () => summarizeTransactions(visibleTransactions),
    [visibleTransactions],
  );

  const isFiltered = categoryFilter !== 'all' || searchQuery.trim() !== '';

  const handleSort = useCallback(
    (column: string) => {
      if (sortBy === column) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortBy(column);
        setSortDir(column === 'date' ? 'desc' : 'asc');
      }
    },
    [sortBy],
  );

  const handleCategoryChange = useCallback(
    (id: string, category: Category | null) => {
      // Always update the single transaction first
      updateCategory.mutate({ id, category });

      // Check if other transactions share the same description and differ.
      // Matching runs over the whole fetched range, not just the visible rows,
      // so a filtered view does not undercount the matches.
      const tx = transactions.find((t) => t.id === id);
      if (!tx) return;

      // Compare normalized descriptions so "DBT CRD 0407 ... TSTDRIP KITCHEN"
      // matches "DBT CRD 0937 ... TSTDRIP KITCHEN"
      const normalized = normalizeDescription(tx.description).toLowerCase();
      const others = transactions.filter(
        (t) =>
          t.id !== id &&
          normalizeDescription(t.description).toLowerCase() === normalized &&
          t.category !== category,
      );

      if (others.length > 0) {
        setBatchPrompt({
          txId: id,
          description: tx.description,
          category,
          matchCount: others.length,
        });
      }
    },
    [transactions, updateCategory],
  );

  const handleBatchConfirm = useCallback(() => {
    if (!batchPrompt) return;
    batchCategorize.mutate({
      description: batchPrompt.description,
      category: batchPrompt.category,
    });
    setBatchPrompt(null);
  }, [batchPrompt, batchCategorize]);

  const handleBatchCancel = useCallback(() => {
    setBatchPrompt(null);
  }, []);

  const categoryLabel = batchPrompt?.category ?? 'Uncategorized';

  return (
    <div className="mx-auto max-w-shell px-6 py-6">
      <h1 className="font-display text-4xl text-bark-dark">Transactions</h1>
      <p className="mt-1 text-[15px] text-stone">
        {formatDateRange(startDate, endDate)} · {accountName}
      </p>

      <div className="mt-6">
        <SummaryCards summary={summary} />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2.5">
        <DateRangePicker
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
        />
        <CategoryFilterPills
          categories={availableCategories}
          value={categoryFilter}
          onChange={setCategoryFilter}
        />
        <input
          type="search"
          aria-label="Search descriptions"
          placeholder="Search descriptions"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="ml-auto w-[220px] rounded-full border border-cream-mid bg-surface px-3.5 py-[9px] text-sm text-charcoal placeholder:text-warm-gray focus:outline-none focus-visible:border-sage focus-visible:ring-2 focus-visible:ring-sage"
        />
      </div>

      <div className="mt-4">
        {isLoading && (
          <div className="flex h-64 items-center justify-center">
            <div className="spinner-sage" role="status" aria-label="Loading transactions" />
          </div>
        )}
        {error && (
          <p role="alert" className="p-4 text-center text-error">
            Failed to load transactions.
          </p>
        )}
        {!isLoading && !error && (
          <TransactionsTable
            transactions={visibleTransactions}
            sortBy={sortBy}
            sortDir={sortDir}
            onSort={handleSort}
            onCategoryChange={handleCategoryChange}
            isFiltered={isFiltered}
          />
        )}
      </div>

      {/* Batch categorize confirmation */}
      <ConfirmDialog
        isOpen={batchPrompt !== null}
        title="Categorize matching transactions?"
        description={
          batchPrompt
            ? `${batchPrompt.matchCount} other transaction${batchPrompt.matchCount === 1 ? '' : 's'} with the description "${batchPrompt.description}" can also be set to "${categoryLabel}". Apply to all?`
            : ''
        }
        confirmLabel="Apply to all"
        cancelLabel="Just this one"
        onConfirm={handleBatchConfirm}
        onCancel={handleBatchCancel}
      />
    </div>
  );
}
