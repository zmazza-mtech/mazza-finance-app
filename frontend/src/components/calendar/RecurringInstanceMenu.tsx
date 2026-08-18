import { useEffect, useRef } from 'react';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';

interface RecurringInstanceMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onEditThis: () => void;
  onEditAllFuture: () => void;
  // Confirmation dialog state — "Edit all future" requires confirmation first
  showConfirm: boolean;
  onConfirmAllFuture: () => void;
  onCancelConfirm: () => void;
}

/**
 * The choice between editing one occurrence of a recurring series and editing
 * the series from here on.
 *
 * "Edit this occurrence" opens the occurrence form directly. "Edit this and all
 * future occurrences" is gated by a ConfirmDialog first, because it rewrites
 * the series and every occurrence still ahead of it.
 *
 * Presented as a centred sheet rather than the popover it was built as: the
 * redesign replaced hover popovers with the persistent day panel, and an
 * absolutely-positioned menu has nothing to anchor to there.
 */
export function RecurringInstanceMenu({
  isOpen,
  onClose,
  onEditThis,
  onEditAllFuture,
  showConfirm,
  onConfirmAllFuture,
  onCancelConfirm,
}: RecurringInstanceMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const firstButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) firstButtonRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen && !showConfirm) return null;

  return (
    <>
      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-scrim/50"
            onClick={onClose}
            aria-hidden="true"
          />
          <div
            ref={menuRef}
            role="menu"
            aria-label="Edit recurring transaction"
            className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-lg border border-cream-mid bg-surface py-1 shadow-xl"
          >
            <button
              ref={firstButtonRef}
              role="menuitem"
              onClick={onEditThis}
              className="hit-target w-full px-4 py-2 text-left text-sm text-charcoal transition-colors duration-150 hover:bg-cream focus:bg-cream focus:outline-none"
            >
              Edit this occurrence
            </button>
            <button
              role="menuitem"
              onClick={onEditAllFuture}
              className="hit-target w-full px-4 py-2 text-left text-sm text-charcoal transition-colors duration-150 hover:bg-cream focus:bg-cream focus:outline-none"
            >
              Edit this and all future occurrences
            </button>
          </div>
        </>
      )}

      {/* Confirmation must appear before opening the edit form */}
      <ConfirmDialog
        isOpen={showConfirm}
        title="Edit all future occurrences?"
        description="This will update the recurring series starting from this date. All future scheduled amounts and dates will change."
        confirmLabel="Continue"
        cancelLabel="Cancel"
        onConfirm={onConfirmAllFuture}
        onCancel={onCancelConfirm}
      />
    </>
  );
}
