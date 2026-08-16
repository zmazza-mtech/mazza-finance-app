import { useRef } from 'react';
import { Sheet } from '@/components/shared/Sheet';

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
 * Confirmation dialog.
 *
 * Focus opens on Cancel rather than the first tabbable element, so that a
 * reflexive Enter on a destructive prompt dismisses it instead of confirming
 * it. `Sheet` supplies the backdrop, Escape, focus trap, focus restore and
 * scroll lock.
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

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onCancel}
      labelledBy="confirm-dialog-title"
      describedBy="confirm-dialog-desc"
      initialFocusRef={cancelRef}
      className="p-6"
    >
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
          className="hit-target rounded-full border border-cream-mid bg-surface px-[18px] py-[9px] text-sm text-stone transition-colors duration-150 hover:border-sage-light hover:text-bark focus:outline-none focus-visible:ring-2 focus-visible:ring-sage"
        >
          {cancelLabel}
        </button>
        <button
          onClick={onConfirm}
          className={`hit-target rounded-full px-[18px] py-[9px] text-sm font-semibold text-cream transition-all duration-150 ease-out hover:-translate-y-px hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-sage ${
            destructive ? 'bg-error hover:bg-error-dark' : 'bg-sage-dark hover:bg-sage-deep'
          }`}
        >
          {confirmLabel}
        </button>
      </div>
    </Sheet>
  );
}
