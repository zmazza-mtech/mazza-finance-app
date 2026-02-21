import { useEffect, useRef } from 'react';
import { TransactionItem } from './TransactionItem';
import type { ForecastTransaction } from '@/api/types';

interface ShowMoreDrawerProps {
  date: string;
  transactions: ForecastTransaction[];
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Shows all transactions for a day.
 * - Desktop: inline expansion panel
 * - Mobile (bottom sheet): slides up from bottom
 * Closes on Escape or backdrop click.
 */
export function ShowMoreDrawer({
  date,
  transactions,
  isOpen,
  onClose,
}: ShowMoreDrawerProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) closeRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const formattedDate = new Date(date + 'T00:00:00').toLocaleDateString(
    undefined,
    { weekday: 'long', month: 'long', day: 'numeric' },
  );

  return (
    <>
      {/* Backdrop (mobile) */}
      <div
        className="fixed inset-0 z-40 bg-black/40 md:hidden"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel — bottom sheet on mobile, inline panel on desktop */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`All transactions for ${formattedDate}`}
        className="
          fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-gray-900
          rounded-t-2xl shadow-xl p-4 max-h-[70vh] overflow-y-auto
          md:static md:rounded-none md:shadow-none md:max-h-none md:border
          md:border-gray-200 md:dark:border-gray-700 md:rounded-md md:mt-1
        "
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {formattedDate}
          </h2>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
          >
            ✕
          </button>
        </div>
        <ul className="space-y-1">
          {transactions.map((tx) => (
            <TransactionItem key={tx.id} transaction={tx} />
          ))}
        </ul>
      </div>
    </>
  );
}
