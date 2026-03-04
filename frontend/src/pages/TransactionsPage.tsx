import { useState, useContext, useCallback } from 'react';
import { AccountContext } from '@/App';
import { DateRangePicker } from '@/components/shared/DateRangePicker';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { TransactionsTable } from '@/components/transactions/TransactionsTable';
import { normalizeDescription } from '@/lib/normalize';
import {
  useTransactions,
  useUpdateTransactionCategory,
  useBatchCategorize,
} from '@/hooks/useTransactions';
import { CATEGORIES } from '@/lib/categories';
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
  const [categoryFilter, setCategoryFilter] = useState('');
  const [batchPrompt, setBatchPrompt] = useState<BatchPrompt | null>(null);

  const queryParams = {
    accountId: selectedAccountId || undefined,
    startDate,
    endDate,
    sortBy,
    sortDir,
    category: categoryFilter || undefined,
  };

  const { data: transactions = [], isLoading, error } = useTransactions(queryParams);
  const updateCategory = useUpdateTransactionCategory(queryParams);
  const batchCategorize = useBatchCategorize(queryParams);

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

      // Check if other transactions share the same description and differ
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
    <div className="max-w-screen-lg mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">
        Transactions
      </h1>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4 mb-4">
        <DateRangePicker
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
        />
        <label className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400">
          Category
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All</option>
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Content */}
      {isLoading && (
        <p className="text-center text-gray-500 dark:text-gray-400 py-8">Loading...</p>
      )}
      {error && (
        <p className="text-center text-red-600 dark:text-red-400 py-8">
          Failed to load transactions.
        </p>
      )}
      {!isLoading && !error && (
        <TransactionsTable
          transactions={transactions}
          sortBy={sortBy}
          sortDir={sortDir}
          onSort={handleSort}
          onCategoryChange={handleCategoryChange}
        />
      )}

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
