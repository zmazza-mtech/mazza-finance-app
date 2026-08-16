import { getCategoryColor } from '@/lib/categoryColors';
import type { CategoryFilter } from '@/lib/transactionSummary';

interface CategoryFilterPillsProps {
  /** The categories present in the fetched range, in canonical order. */
  categories: Exclude<CategoryFilter, 'all'>[];
  value: CategoryFilter;
  onChange: (value: CategoryFilter) => void;
}

const ACTIVE = 'border-sage-light bg-sage-lighter text-sage-deep';
const INACTIVE = 'border-cream-mid bg-surface text-stone hover:border-sage-light';

function pillLabel(value: Exclude<CategoryFilter, 'all'>): string {
  return value === 'uncategorized' ? 'Uncategorized' : value;
}

/**
 * The category filter row.
 *
 * Only categories the range actually contains get a pill, so the row is a map
 * of the range rather than the full sixteen-category list. Each pill carries
 * its category dot, but the name is always spelled out — color never carries
 * the meaning alone.
 */
export function CategoryFilterPills({
  categories,
  value,
  onChange,
}: CategoryFilterPillsProps) {
  return (
    <div className="-mx-4 flex snap-x items-center gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:gap-2.5 sm:overflow-visible sm:px-0 sm:pb-0">
      <button
        type="button"
        aria-pressed={value === 'all'}
        onClick={() => onChange('all')}
        className={`hit-target shrink-0 snap-start rounded-full border px-3.5 py-[7px] text-[13px] transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-sage ${
          value === 'all' ? ACTIVE : INACTIVE
        }`}
      >
        All categories
      </button>

      {categories.map((cat) => (
        <button
          key={cat}
          type="button"
          aria-pressed={value === cat}
          onClick={() => onChange(cat)}
          className={`hit-target inline-flex shrink-0 snap-start items-center gap-1.5 rounded-full border px-3.5 py-[7px] text-[13px] transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-sage ${
            value === cat ? ACTIVE : INACTIVE
          }`}
        >
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{
              backgroundColor: getCategoryColor(cat === 'uncategorized' ? null : cat),
            }}
          />
          {pillLabel(cat)}
        </button>
      ))}
    </div>
  );
}
