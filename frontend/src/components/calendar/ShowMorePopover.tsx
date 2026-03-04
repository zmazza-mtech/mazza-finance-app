import { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { TransactionItem } from './TransactionItem';
import type { ForecastTransaction } from '@/api/types';

const POPOVER_WIDTH = 400;
const POPOVER_HEIGHT_EST = 360;
const GAP = 6; // px gap between anchor and popover

interface ShowMorePopoverProps {
  date: string;
  transactions: ForecastTransaction[];
  anchorEl: HTMLElement | null;
  isOpen: boolean;
  onClose: () => void;
}

interface PopoverPos {
  top: number;
  left: number;
}

/**
 * Positioned popover rendered via a React portal so it escapes any overflow
 * clipping on the calendar grid. Anchors to the day cell that triggered it.
 */
export function ShowMorePopover({
  date,
  transactions,
  anchorEl,
  isOpen,
  onClose,
}: ShowMorePopoverProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<PopoverPos | null>(null);

  // Compute position from anchor element whenever it opens
  useEffect(() => {
    if (!isOpen || !anchorEl) {
      setPos(null);
      return;
    }

    const rect = anchorEl.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Prefer opening below the cell; flip up if too close to bottom
    const spaceBelow = vh - rect.bottom;
    const top = spaceBelow >= POPOVER_HEIGHT_EST + GAP
      ? rect.bottom + GAP
      : rect.top - POPOVER_HEIGHT_EST - GAP;

    // Prefer left-aligned to cell; right-align if it would overflow viewport
    const left = rect.left + POPOVER_WIDTH <= vw
      ? rect.left
      : Math.max(0, rect.right - POPOVER_WIDTH);

    setPos({ top, left });

    // Focus close button after position is set
    requestAnimationFrame(() => closeButtonRef.current?.focus());
  }, [isOpen, anchorEl]);

  // Escape key closes the popover
  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !pos) return null;

  const formattedDate = new Date(date + 'T00:00:00').toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return ReactDOM.createPortal(
    <>
      {/* Backdrop — captures outside clicks */}
      <div
        className="fixed inset-0 z-40"
        aria-hidden="true"
        onClick={onClose}
      />

      {/* Popover panel */}
      <div
        role="dialog"
        aria-label={`Transactions for ${formattedDate}`}
        aria-modal="true"
        style={{ top: pos.top, left: pos.left, width: POPOVER_WIDTH }}
        className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
            {formattedDate}
          </p>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-2 flex-shrink-0 p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>

        {/* Transaction list */}
        <ul
          className="overflow-y-auto max-h-64 divide-y divide-gray-100 dark:divide-gray-700"
          role="list"
        >
          {transactions.map((tx) => (
            <li key={tx.id} className="px-3 py-2">
              <TransactionItem transaction={tx} wrap />
            </li>
          ))}
        </ul>
      </div>
    </>,
    document.body,
  );
}
