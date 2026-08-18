import { useState } from 'react';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { formatAmount, isNegative } from '@/lib/balance';
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
    <section
      aria-label="Pending review"
      className="mb-6 rounded-lg border border-border-mid bg-surface p-5"
    >
      <div className="mb-2 flex items-center gap-2.5">
        <h2 className="font-display text-xl text-bark-dark">Needs your review</h2>
        <span
          aria-label={`${items.length} items pending review`}
          className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-copper-dark px-1.5 font-mono text-xs text-cream"
        >
          {items.length}
        </span>
      </div>

      <p className="mb-4 text-sm text-stone">
        We spotted these patterns in your bank history. Confirm the ones we got
        right, dismiss the rest.
      </p>

      <ul className="space-y-2.5">
        {items.map((item) => {
          const debit = isNegative(item.amount);
          return (
            <li
              key={item.id}
              className="flex flex-col justify-between gap-3 rounded-md border border-cream-mid bg-cream px-4 py-3.5 sm:flex-row sm:items-center"
            >
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold text-charcoal">
                  {item.name}
                </p>
                <p className="font-mono text-xs text-stone">
                  {debit ? '−' : '+'}${formatAmount(item.amount)} &middot;{' '}
                  {capitalize(item.frequency)}
                </p>
              </div>
              <div className="flex shrink-0 gap-2 [&>button]:flex-1 sm:[&>button]:flex-none">
                <button
                  type="button"
                  aria-label={`Edit ${item.name}`}
                  onClick={() => onEdit(item)}
                  className="hit-target rounded-full border border-cream-mid bg-surface px-3.5 py-1.5 text-[13px] text-bark transition-colors duration-150 hover:border-sage-light focus:outline-none focus-visible:ring-2 focus-visible:ring-sage"
                >
                  Edit
                </button>
                <button
                  type="button"
                  aria-label={`Dismiss ${item.name}`}
                  onClick={() => setDismissTarget(item.id)}
                  className="hit-target rounded-full border border-cream-mid bg-surface px-3.5 py-1.5 text-[13px] text-stone transition-colors duration-150 hover:border-sage-light hover:text-bark focus:outline-none focus-visible:ring-2 focus-visible:ring-sage"
                >
                  Dismiss
                </button>
                <button
                  type="button"
                  aria-label={`Confirm ${item.name}`}
                  onClick={() => onConfirm(item.id)}
                  className="hit-target rounded-full bg-sage-dark px-3.5 py-1.5 text-[13px] font-semibold text-cream transition-colors duration-150 hover:bg-sage-deep focus:outline-none focus-visible:ring-2 focus-visible:ring-sage"
                >
                  Confirm
                </button>
              </div>
            </li>
          );
        })}
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
