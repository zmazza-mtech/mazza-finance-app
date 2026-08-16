import type { Category } from '@/api/types';
import { getCategoryColor } from '@/lib/categoryColors';

interface CategoryBadgeProps {
  category: Category | null;
}

/**
 * A category as a colored dot beside its name.
 *
 * The name is always present, so color is never the sole signal — several
 * palette hues are deliberately pale, and Subscriptions and Other share one.
 * Null category displays as "Uncategorized".
 */
export function CategoryBadge({ category }: CategoryBadgeProps) {
  const label = category ?? 'Uncategorized';

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-charcoal">
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: getCategoryColor(category) }}
      />
      <span className="truncate">{label}</span>
    </span>
  );
}
