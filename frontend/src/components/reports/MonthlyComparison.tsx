import Decimal from 'decimal.js';
import { formatCurrency } from '@/lib/balance';
import { CategoryBadge } from '@/components/shared/CategoryBadge';
import type { Category, MonthlyCategory, MonthlySummaryMonth } from '@/api/types';

interface MonthlyComparisonProps {
  months: MonthlySummaryMonth[];
}

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** `2026-08` as `Aug 2026`. Parsed as integers, so no timezone can shift it. */
function formatMonth(month: string): string {
  const [year, index] = month.split('-').map(Number) as [number, number];
  return `${MONTH_NAMES[index - 1]} ${year}`;
}

/** A signed movement, e.g. `+$122.30 (+17.7%)`, or `+$40.00` with no percent. */
function formatChange(change: string, changePercent: string | null): string {
  const value = new Decimal(change);
  const sign = value.isNegative() ? '-' : '+';
  const amount = `${sign}$${value.abs().toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;

  if (changePercent === null) return amount;

  const percent = new Decimal(changePercent);
  return `${amount} (${percent.isNegative() ? '-' : '+'}${percent.abs().toFixed(1)}%)`;
}

/**
 * Every month in the range as a column, every category as a row.
 *
 * A category keeps one row across the whole range, so reading left to right
 * follows one kind of spending through time — which is the comparison the view
 * exists for. A month a category has nothing in is blank rather than zero:
 * "no groceries bought" and "groceries netted out to nothing" are different
 * facts, and only the second is a zero.
 *
 * Movement figures come from the API already computed. Recomputing them here
 * would put a second opinion about the arithmetic in the client, and this one
 * would be the float.
 */
export function MonthlyComparison({ months }: MonthlyComparisonProps) {
  const categories = [...new Set(months.flatMap((m) => m.categories.map((c) => c.category)))];

  /** A category's figures for a month, or null when it has none that month. */
  function cell(month: MonthlySummaryMonth, category: string): MonthlyCategory | null {
    return month.categories.find((c) => c.category === category) ?? null;
  }

  return (
    <section
      aria-labelledby="monthly-comparison-title"
      className="rounded-lg border border-cream-mid bg-surface p-[22px]"
    >
      <h2 id="monthly-comparison-title" className="mb-3 font-display text-xl text-bark-dark">
        Month over month
      </h2>

      {/*
        The heading stays even with nothing to show. A view that removes its own
        title when it is empty reads as a section that failed to load.
      */}
      {categories.length === 0 ? (
        <p className="py-8 text-center text-sm text-stone">
          No transactions in this range.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse">
            <thead>
              <tr>
                <th scope="col" className="py-2 pr-3 text-left text-sm font-semibold text-bark-dark">
                  Category
                </th>
                {months.map((month) => (
                  <th
                    key={month.month}
                    scope="col"
                    className="py-2 pl-3 text-right text-sm font-semibold text-bark-dark"
                  >
                    {formatMonth(month.month)}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {(['income', 'expenses', 'net'] as const).map((row) => (
                <tr key={row} className="border-b border-cream-mid">
                  {/*
                    "Total income", not "Income": the category rows below carry
                    the plain category names, and a summary row sharing a name
                    with one of them is ambiguous to read and to reference.
                  */}
                  <th scope="row" className="py-2 pr-3 text-left text-sm text-charcoal">
                    {row === 'net' ? 'Net' : row === 'income' ? 'Total income' : 'Total expenses'}
                  </th>
                  {months.map((month) => (
                    <td
                      key={month.month}
                      className="py-2 pl-3 text-right font-mono text-sm text-charcoal"
                    >
                      {formatCurrency(month[row])}
                    </td>
                  ))}
                </tr>
              ))}

              {categories.map((category) => (
                <tr key={category} className="border-b border-cream-mid">
                  <th scope="row" className="py-2 pr-3 text-left font-normal">
                    <CategoryBadge category={category as Category} />
                  </th>
                  {months.map((month) => {
                    const figures = cell(month, category);

                    if (!figures) {
                      return (
                        <td
                          key={month.month}
                          aria-label={`${category}, ${formatMonth(month.month)}: nothing`}
                          className="py-2 pl-3 text-right font-mono text-sm text-warm-gray"
                        >
                          —
                        </td>
                      );
                    }

                    return (
                      <td key={month.month} className="py-2 pl-3 text-right">
                        <span className="block font-mono text-sm text-charcoal">
                          {formatCurrency(figures.total)}
                        </span>
                        {figures.change === null ? (
                          <span
                            aria-label="No prior month to compare"
                            className="block font-mono text-xs text-warm-gray"
                          >
                            —
                          </span>
                        ) : (
                          <span className="block font-mono text-xs text-stone">
                            {formatChange(figures.change, figures.changePercent)}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
