import type { Category } from '@/api/types';

const CATEGORY_CLASSES: Record<Category, string> = {
  Income: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  Housing: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  Utilities: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
  Groceries: 'bg-lime-100 text-lime-800 dark:bg-lime-900 dark:text-lime-200',
  Transportation: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  Insurance: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
  Healthcare: 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200',
  Entertainment: 'bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200',
  Dining: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  Shopping: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200',
  Subscriptions: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  Transfers: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  Other: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
};

interface CategoryBadgeProps {
  category: Category | null;
}

/**
 * Colored pill for a transaction category.
 * Null category displays as "Uncategorized" with muted styling.
 */
export function CategoryBadge({ category }: CategoryBadgeProps) {
  const label = category ?? 'Uncategorized';
  const classes = category
    ? CATEGORY_CLASSES[category]
    : 'bg-gray-50 text-gray-400 dark:bg-gray-800 dark:text-gray-500';

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${classes}`}>
      {label}
    </span>
  );
}
