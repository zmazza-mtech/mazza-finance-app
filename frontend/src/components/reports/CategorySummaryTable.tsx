import Decimal from 'decimal.js';
import { formatCurrency } from '@/lib/balance';
import { CategoryBadge } from '@/components/shared/CategoryBadge';
import type { CategorySummaryItem, Category } from '@/api/types';

interface CategorySummaryTableProps {
  title: string;
  items: CategorySummaryItem[];
}

/**
 * Table showing category breakdown with amounts and percentages.
 * Percentages computed with decimal.js for accuracy.
 */
export function CategorySummaryTable({ title, items }: CategorySummaryTableProps) {
  if (items.length === 0) {
    return null;
  }

  const total = items.reduce(
    (sum, item) => sum.plus(new Decimal(item.total).abs()),
    new Decimal(0),
  );

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
        {title}
      </h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700">
            <th className="px-3 py-1.5 text-left font-medium text-gray-600 dark:text-gray-400">
              Category
            </th>
            <th className="px-3 py-1.5 text-right font-medium text-gray-600 dark:text-gray-400">
              Amount
            </th>
            <th className="px-3 py-1.5 text-right font-medium text-gray-600 dark:text-gray-400">
              %
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const absAmount = new Decimal(item.total).abs();
            const pct = total.isZero()
              ? '0.0'
              : absAmount.div(total).times(100).toFixed(1);

            return (
              <tr
                key={item.category}
                className="border-b border-gray-100 dark:border-gray-800"
              >
                <td className="px-3 py-1.5">
                  <CategoryBadge category={item.category as Category} />
                </td>
                <td className="px-3 py-1.5 text-right font-medium text-gray-900 dark:text-gray-100">
                  {formatCurrency(absAmount.toFixed(2))}
                </td>
                <td className="px-3 py-1.5 text-right text-gray-500 dark:text-gray-400">
                  {pct}%
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-gray-300 dark:border-gray-600">
            <td className="px-3 py-1.5 font-semibold text-gray-800 dark:text-gray-200">
              Total
            </td>
            <td className="px-3 py-1.5 text-right font-semibold text-gray-800 dark:text-gray-200">
              {formatCurrency(total.toFixed(2))}
            </td>
            <td className="px-3 py-1.5 text-right text-gray-500 dark:text-gray-400">
              100%
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
