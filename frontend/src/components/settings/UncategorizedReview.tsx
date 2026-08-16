import { CATEGORIES } from '@/lib/categories';
import { formatCurrency } from '@/lib/balance';
import type { Category, UncategorizedGroup } from '@/api/types';

interface UncategorizedReviewProps {
  groups: UncategorizedGroup[];
  /** Every uncategorized amount summed, as a decimal string. */
  total: string;
  onAssign: (description: string, category: Category) => void;
  isAssigning?: boolean;
}

/**
 * The uncategorized long tail, one row per merchant, biggest first.
 *
 * Grouping is what makes this a finite task rather than a filtered list:
 * assigning a category here fixes every transaction from that merchant at
 * once, past and future, because the same normalized description is what the
 * bulk assignment matches on.
 *
 * Hidden entirely when nothing is uncategorized — an empty container on the
 * settings page would read as a section that failed to load.
 */
export function UncategorizedReview({
  groups,
  total,
  onAssign,
  isAssigning = false,
}: UncategorizedReviewProps) {
  if (groups.length === 0) return null;

  return (
    <section
      aria-labelledby="uncategorized-title"
      className="rounded-lg border border-cream-mid bg-surface p-[22px]"
    >
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="uncategorized-title" className="font-display text-xl text-bark-dark">
          Uncategorized
        </h2>
        <span className="font-mono text-sm text-stone">{formatCurrency(total)}</span>
      </div>

      <p className="mb-4 text-sm text-stone">
        Filing one of these files every transaction from that merchant, including
        the ones that arrive later.
      </p>

      <ul className="space-y-2.5">
        {groups.map((group) => (
          <li
            key={group.description}
            className="flex flex-col justify-between gap-3 rounded-md border border-cream-mid bg-cream px-4 py-3.5 sm:flex-row sm:items-center"
          >
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold text-charcoal">
                {group.description}
              </p>
              <p className="font-mono text-xs text-stone">
                <span>
                  {group.count === 1 ? '1 transaction' : `${group.count} transactions`}
                </span>
                {' · '}
                <span>{formatCurrency(group.total)}</span>
              </p>
            </div>

            <select
              aria-label={`Category for ${group.description}`}
              value=""
              disabled={isAssigning}
              onChange={(e) => onAssign(group.description, e.target.value as Category)}
              className="hit-target shrink-0 rounded-md border border-cream-mid bg-surface px-2.5 py-1.5 text-sm text-charcoal focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage disabled:opacity-50"
            >
              <option value="" disabled>
                Choose a category
              </option>
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
    </section>
  );
}
