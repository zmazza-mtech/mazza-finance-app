import { useEffect, useRef } from 'react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  destructive?: boolean;
}

/**
 * Reusable confirmation dialog with focus trap.
 * Closes on Escape key press.
 */
export function ConfirmDialog({
  isOpen,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  destructive = false,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Move focus to cancel button when dialog opens
  useEffect(() => {
    if (isOpen) {
      cancelRef.current?.focus();
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-desc"
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-espresso/40"
        onClick={onCancel}
        aria-hidden="true"
      />
      {/* Panel */}
      <div className="relative mx-4 w-full max-w-md rounded-lg border border-cream-mid bg-white p-6 shadow-xl">
        <h2 id="confirm-dialog-title" className="font-display text-xl text-bark-dark">
          {title}
        </h2>
        <p id="confirm-dialog-desc" className="mb-6 mt-2 text-sm text-stone">
          {description}
        </p>
        <div className="flex justify-end gap-2.5">
          <button
            ref={cancelRef}
            onClick={onCancel}
            className="hit-target rounded-full border border-cream-mid bg-white px-[18px] py-[9px] text-sm text-stone transition-colors duration-150 hover:border-sage-light hover:text-bark focus:outline-none focus-visible:ring-2 focus-visible:ring-sage"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`hit-target rounded-full px-[18px] py-[9px] text-sm font-semibold text-white transition-all duration-150 ease-out hover:-translate-y-px hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-sage ${
              destructive ? 'bg-error hover:bg-[#A8483D]' : 'bg-sage-dark hover:bg-sage-deep'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
