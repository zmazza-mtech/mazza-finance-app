import { formatCurrency, isNegative } from '@/lib/balance';
import { SourceBadge } from '@/components/shared/SourceBadge';
import { CATEGORIES } from '@/lib/categories';
import type { Transaction, Category } from '@/api/types';

interface TransactionsTableProps {
  transactions: Transaction[];
  sortBy: string;
  sortDir: string;
  onSort: (column: string) => void;
  onCategoryChange: (id: string, category: Category | null) => void;
}

type Column = { key: string; label: string; sortable: boolean };

const COLUMNS: Column[] = [
  { key: 'date', label: 'Date', sortable: true },
  { key: 'description', label: 'Description', sortable: true },
  { key: 'category', label: 'Category', sortable: true },
  { key: 'amount', label: 'Amount', sortable: true },
  { key: 'source', label: 'Source', sortable: false },
];

function SortIndicator({ active, dir }: { active: boolean; dir: string }) {
  if (!active) return <span className="text-gray-300 dark:text-gray-600 ml-1">↕</span>;
  return <span className="ml-1">{dir === 'asc' ? '↑' : '↓'}</span>;
}

/**
 * Sortable transactions table with inline category editing.
 */
export function TransactionsTable({
  transactions,
  sortBy,
  sortDir,
  onSort,
  onCategoryChange,
}: TransactionsTableProps) {
  if (transactions.length === 0) {
    return (
      <p className="text-center text-gray-500 dark:text-gray-400 py-8">
        No transactions found for the selected date range.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700">
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                className={`px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-400 ${
                  col.sortable ? 'cursor-pointer select-none hover:text-gray-900 dark:hover:text-gray-200' : ''
                }`}
                onClick={col.sortable ? () => onSort(col.key) : undefined}
              >
                {col.label}
                {col.sortable && <SortIndicator active={sortBy === col.key} dir={sortDir} />}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {transactions.map((tx) => (
            <tr
              key={tx.id}
              className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900/50"
            >
              <td className="px-3 py-2 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                {tx.date}
              </td>
              <td className="px-3 py-2 text-gray-900 dark:text-gray-100 max-w-xs truncate" title={tx.description}>
                {tx.description}
              </td>
              <td className="px-3 py-2">
                <select
                  value={tx.category ?? ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    onCategoryChange(tx.id, val === '' ? null : (val as Category));
                  }}
                  className="text-xs px-1 py-0.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Uncategorized</option>
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </td>
              <td
                className={`px-3 py-2 font-medium whitespace-nowrap ${
                  isNegative(tx.amount)
                    ? 'text-red-700 dark:text-red-400'
                    : 'text-green-700 dark:text-green-400'
                }`}
              >
                {formatCurrency(tx.amount)}
              </td>
              <td className="px-3 py-2">
                <SourceBadge source={tx.source} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
