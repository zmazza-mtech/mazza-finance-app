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
 * Context menu for a recurring transaction instance.
 * "Edit this occurrence" — opens edit form directly.
 * "Edit this and all future occurrences" — shows ConfirmDialog first, THEN opens form.
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
            className="fixed inset-0 z-40"
            onClick={onClose}
            aria-hidden="true"
          />
          <div
            ref={menuRef}
            role="menu"
            aria-label="Edit recurring transaction"
            className="absolute z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg py-1 min-w-[240px]"
          >
            <button
              ref={firstButtonRef}
              role="menuitem"
              onClick={onEditThis}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:bg-gray-100 dark:focus:bg-gray-700"
            >
              Edit this occurrence
            </button>
            <button
              role="menuitem"
              onClick={onEditAllFuture}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:bg-gray-100 dark:focus:bg-gray-700"
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
