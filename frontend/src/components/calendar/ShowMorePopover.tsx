import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { TransactionItem } from './TransactionItem';
import { transactionMatchesQuery } from '@/lib/search';
import type { ForecastTransaction } from '@/api/types';

const POPOVER_WIDTH = 400;
const GAP = 6; // px gap between anchor and popover
const VIEWPORT_MARGIN = 8; // min distance from viewport edges

interface ShowMorePopoverProps {
  date: string;
  transactions: ForecastTransaction[];
  anchorEl: HTMLElement | null;
  isOpen: boolean;
  searchQuery: string;
  onClose: () => void;
}

interface PopoverPos {
  top: number;
  left: number;
}

function computePosition(anchorEl: HTMLElement, panelHeight: number): PopoverPos {
  const rect = anchorEl.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Prefer opening below the cell; flip up if it won't fit
  const spaceBelow = vh - rect.bottom;
  let top = spaceBelow >= panelHeight + GAP
    ? rect.bottom + GAP
    : rect.top - panelHeight - GAP;

  // Clamp to viewport so it never goes off-screen
  top = Math.max(VIEWPORT_MARGIN, Math.min(top, vh - panelHeight - VIEWPORT_MARGIN));

  // Prefer left-aligned to cell; right-align if it would overflow viewport
  const left = rect.left + POPOVER_WIDTH <= vw
    ? rect.left
    : Math.max(VIEWPORT_MARGIN, rect.right - POPOVER_WIDTH);

  return { top, left };
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
  searchQuery,
  onClose,
}: ShowMorePopoverProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<PopoverPos | null>(null);

  // Compute initial position when popover opens (estimate-based)
  useEffect(() => {
    if (!isOpen || !anchorEl) {
      setPos(null);
      return;
    }

    // Estimate height: header ~44px + ~40px per transaction, capped at viewport
    const estimatedHeight = Math.min(
      44 + transactions.length * 40,
      window.innerHeight - VIEWPORT_MARGIN * 2,
    );
    setPos(computePosition(anchorEl, estimatedHeight));

    requestAnimationFrame(() => closeButtonRef.current?.focus());
  }, [isOpen, anchorEl, transactions.length]);

  // After panel mounts, adjust position using actual measured height
  useLayoutEffect(() => {
    if (!isOpen || !pos || !panelRef.current || !anchorEl) return;
    const actualHeight = panelRef.current.getBoundingClientRect().height;
    const adjusted = computePosition(anchorEl, actualHeight);
    // Only update if position actually changed to avoid loops
    if (Math.abs(adjusted.top - pos.top) > 1 || Math.abs(adjusted.left - pos.left) > 1) {
      setPos(adjusted);
    }
  }); // runs after every render so it adjusts if content changes

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
        ref={panelRef}
        role="dialog"
        aria-label={`Transactions for ${formattedDate}`}
        aria-modal="true"
        style={{
          top: pos.top,
          left: pos.left,
          width: POPOVER_WIDTH,
          maxHeight: `calc(100vh - ${VIEWPORT_MARGIN * 2}px)`,
        }}
        className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl overflow-hidden flex flex-col"
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
          className="overflow-y-auto flex-1 min-h-0 divide-y divide-gray-100 dark:divide-gray-700"
          role="list"
        >
          {transactions.map((tx) => (
            <li key={tx.id} className="px-3 py-2">
              <TransactionItem
                transaction={tx}
                wrap
                isMatch={searchQuery.length > 0 && transactionMatchesQuery(tx, searchQuery)}
              />
            </li>
          ))}
        </ul>
      </div>
    </>,
    document.body,
  );
}
