import Decimal from 'decimal.js';
import { formatCurrency } from '@/lib/balance';
import { CategoryBadge } from '@/components/shared/CategoryBadge';
import type { CategorySummaryItem, Category } from '@/api/types';

interface CategorySummaryTableProps {
  title: string;
  items: CategorySummaryItem[];
}

/**
 * Card showing a category breakdown with amounts and percentages.
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
    <section className="rounded-lg border border-cream-mid bg-surface p-4 sm:p-[22px]">
      <h3 className="mb-3 font-display text-lg text-bark-dark sm:text-xl">{title}</h3>

      <table className="w-full table-fixed">
        {/*
          The figure columns narrow on a phone. At 393px the fixed 110px and
          60px leave the category name about 190px, which truncates most of
          them; the amounts need less room than that reserves.
        */}
        <colgroup>
          <col />
          <col className="w-[86px] sm:w-[110px]" />
          <col className="w-[48px] sm:w-[60px]" />
        </colgroup>
        <tbody>
          {items.map((item) => {
            const absAmount = new Decimal(item.total).abs();
            const pct = total.isZero()
              ? '0.0'
              : absAmount.div(total).times(100).toFixed(1);

            return (
              <tr key={item.category} className="border-b border-cream-mid">
                <td className="py-2 pr-3">
                  <CategoryBadge category={item.category as Category} />
                </td>
                <td className="py-2 text-right font-mono text-sm text-charcoal">
                  {formatCurrency(absAmount.toFixed(2))}
                </td>
                <td className="py-2 text-right font-mono text-xs text-stone">
                  {pct}%
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td className="py-2 pr-3 text-sm font-semibold text-bark-dark">Total</td>
            <td className="py-2 text-right font-mono text-sm font-semibold text-bark-dark">
              {formatCurrency(total.toFixed(2))}
            </td>
            <td className="py-2 text-right font-mono text-xs text-stone">100%</td>
          </tr>
        </tfoot>
      </table>
    </section>
  );
}
