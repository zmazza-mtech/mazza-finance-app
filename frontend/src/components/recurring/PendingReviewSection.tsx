import { useState } from 'react';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { formatCurrency } from '@/lib/balance';
import type { Recurring } from '@/api/types';

interface PendingReviewSectionProps {
  items: Recurring[];
  onConfirm: (id: string) => void;
  onDismiss: (id: string) => void;
  onEdit: (recurring: Recurring) => void;
}

/**
 * Shows recurring transactions that were auto-detected and need review.
 * Hidden entirely when there are no pending items.
 * Confirm = mark active; Dismiss = mark disabled.
 */
export function PendingReviewSection({
  items,
  onConfirm,
  onDismiss,
  onEdit,
}: PendingReviewSectionProps) {
  const [dismissTarget, setDismissTarget] = useState<string | null>(null);

  if (items.length === 0) return null;

  return (
    <section aria-label="Pending review" className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
          Needs your review
        </h2>
        <span
          aria-label={`${items.length} items pending review`}
          className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-amber-500 text-white text-xs font-bold"
        >
          {items.length}
        </span>
      </div>

      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        We detected these recurring transactions from your bank history. Confirm
        ones we got right, or dismiss ones that aren't recurring.
      </p>

      <ul className="space-y-3">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 rounded-lg"
          >
            <div className="min-w-0">
              <p className="font-medium text-gray-900 dark:text-gray-100 truncate">
                {item.name}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {formatCurrency(item.amount)} &middot; {capitalize(item.frequency)}
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                aria-label={`Edit ${item.name}`}
                onClick={() => onEdit(item)}
                className="px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                Edit
              </button>
              <button
                type="button"
                aria-label={`Dismiss ${item.name}`}
                onClick={() => setDismissTarget(item.id)}
                className="px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                Dismiss
              </button>
              <button
                type="button"
                aria-label={`Confirm ${item.name}`}
                onClick={() => onConfirm(item.id)}
                className="px-3 py-1.5 text-sm font-medium bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                Confirm
              </button>
            </div>
          </li>
        ))}
      </ul>

      <ConfirmDialog
        isOpen={dismissTarget !== null}
        title="Dismiss recurring transaction?"
        description="This will mark it as disabled and remove it from your forecast. You can re-enable it from the recurring list later."
        confirmLabel="Dismiss"
        cancelLabel="Keep"
        destructive
        onConfirm={() => {
          if (dismissTarget) onDismiss(dismissTarget);
          setDismissTarget(null);
        }}
        onCancel={() => setDismissTarget(null)}
      />
    </section>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
