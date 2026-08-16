import { formatAmount, isNegative } from '@/lib/balance';
import { SourceBadge } from '@/components/shared/SourceBadge';
import { getCategoryColor } from '@/lib/categoryColors';
import { CATEGORIES } from '@/lib/categories';
import type { Transaction, Category } from '@/api/types';

interface TransactionsTableProps {
  transactions: Transaction[];
  sortBy: string;
  sortDir: string;
  onSort: (column: string) => void;
  onCategoryChange: (id: string, category: Category | null) => void;
  /** True when a category pill or a search term is narrowing the rows. */
  isFiltered?: boolean;
}

type Column = {
  key: string;
  label: string;
  sortable: boolean;
  /** Column width; the description column takes the remainder. */
  width: string;
  alignRight?: boolean;
};

const COLUMNS: Column[] = [
  { key: 'date', label: 'Date', sortable: true, width: '104px' },
  { key: 'description', label: 'Description', sortable: true, width: 'auto' },
  { key: 'category', label: 'Category', sortable: true, width: '150px' },
  { key: 'amount', label: 'Amount', sortable: true, width: '130px', alignRight: true },
  { key: 'source', label: 'Source', sortable: false, width: '110px', alignRight: true },
];

function ariaSort(col: Column, sortBy: string, sortDir: string) {
  if (!col.sortable) return undefined;
  if (sortBy !== col.key) return 'none' as const;
  return sortDir === 'asc' ? ('ascending' as const) : ('descending' as const);
}

function SortIndicator({ active, dir }: { active: boolean; dir: string }) {
  return (
    <span aria-hidden="true" className={active ? 'text-sage-dark' : 'text-warm-gray'}>
      {active ? (dir === 'asc' ? '↑' : '↓') : '↕'}
    </span>
  );
}

/**
 * The category cell: a pill that is really a native `<select>`.
 *
 * The select covers the pill at zero opacity, so the keyboard, the screen
 * reader and the mobile picker all get the platform control while the eye gets
 * the design. The change handler is unchanged from the plain select it
 * replaced, which keeps the batch-categorize prompt working.
 */
function CategoryCell({
  transaction,
  onCategoryChange,
}: {
  transaction: Transaction;
  onCategoryChange: (id: string, category: Category | null) => void;
}) {
  return (
    <span className="relative inline-flex max-w-full items-center gap-1.5 rounded-full border border-cream-mid bg-surface px-2.5 py-1 text-xs text-charcoal transition-colors duration-150 hover:border-sage-light focus-within:border-sage focus-within:ring-2 focus-within:ring-sage">
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: getCategoryColor(transaction.category) }}
      />
      <span className="truncate">{transaction.category ?? 'Uncategorized'}</span>
      <span aria-hidden="true" className="shrink-0 text-warm-gray">
        ▾
      </span>
      <select
        aria-label={`Category for ${transaction.description}`}
        value={transaction.category ?? ''}
        onChange={(e) => {
          const val = e.target.value;
          onCategoryChange(transaction.id, val === '' ? null : (val as Category));
        }}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        <option value="">Uncategorized</option>
        {CATEGORIES.map((cat) => (
          <option key={cat} value={cat}>
            {cat}
          </option>
        ))}
      </select>
    </span>
  );
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
  isFiltered = false,
}: TransactionsTableProps) {
  if (transactions.length === 0) {
    return (
      <div className="rounded-lg border border-cream-mid bg-surface px-[18px] py-12">
        <p className="text-center text-sm text-stone">
          {isFiltered
            ? 'No transactions match the current filters.'
            : 'No transactions found for the selected date range.'}
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-cream-mid bg-surface">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] table-fixed">
          <colgroup>
            {COLUMNS.map((col) => (
              <col key={col.key} style={col.width === 'auto' ? undefined : { width: col.width }} />
            ))}
          </colgroup>
          <thead>
            <tr className="border-b border-cream-mid bg-cream">
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={ariaSort(col, sortBy, sortDir)}
                  className={`px-[18px] py-3 font-mono text-[10px] font-normal uppercase tracking-label-wide text-stone ${
                    col.alignRight ? 'text-right' : 'text-left'
                  }`}
                >
                  {col.sortable ? (
                    <button
                      type="button"
                      onClick={() => onSort(col.key)}
                      className={`inline-flex items-center gap-1 uppercase tracking-label-wide transition-colors duration-150 hover:text-bark focus:outline-none focus-visible:ring-2 focus-visible:ring-sage ${
                        col.alignRight ? 'flex-row-reverse' : ''
                      }`}
                    >
                      {col.label}
                      <SortIndicator active={sortBy === col.key} dir={sortDir} />
                    </button>
                  ) : (
                    col.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {transactions.map((tx) => {
              const debit = isNegative(tx.amount);
              return (
                <tr
                  key={tx.id}
                  className="border-b border-cream-mid transition-colors duration-150 last:border-b-0 hover:bg-cream"
                >
                  <td className="whitespace-nowrap px-[18px] py-[11px] font-mono text-xs text-stone">
                    {tx.date}
                  </td>
                  <td
                    className="truncate px-[18px] py-[11px] text-sm text-charcoal"
                    title={tx.description}
                  >
                    {tx.description}
                  </td>
                  <td className="px-[18px] py-[11px]">
                    <CategoryCell transaction={tx} onCategoryChange={onCategoryChange} />
                  </td>
                  <td
                    className={`whitespace-nowrap px-[18px] py-[11px] text-right font-mono text-sm ${
                      debit ? 'text-bark-light' : 'text-sage-deep'
                    }`}
                  >
                    {debit ? '−' : '+'}${formatAmount(tx.amount)}
                  </td>
                  <td className="px-[18px] py-[11px] text-right">
                    <SourceBadge source={tx.source} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
