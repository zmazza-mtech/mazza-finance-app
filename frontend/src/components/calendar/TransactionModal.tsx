import { useState, useRef, useEffect } from 'react';
import { AmountField } from '@/components/shared/AmountField';
import { SegmentedControl } from '@/components/shared/SegmentedControl';
import Decimal from 'decimal.js';

type Direction = 'debit' | 'deposit';

interface TransactionModalProps {
  date: string;
  accountId: string;
  isOpen: boolean;
  onSubmit: (data: { description: string; amount: string }) => void;
  onClose: () => void;
}

const DIRECTION_OPTIONS: { value: Direction; label: string }[] = [
  { value: 'debit', label: 'Debit (money out)' },
  { value: 'deposit', label: 'Deposit (money in)' },
];

/**
 * Full modal form for adding a transaction.
 * Traps focus within the modal.
 * Closes on Escape.
 */
export function TransactionModal({
  date,
  accountId: _accountId,
  isOpen,
  onSubmit,
  onClose,
}: TransactionModalProps) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [direction, setDirection] = useState<Direction>('debit');
  const descriptionRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const formattedDate = new Date(date + 'T00:00:00').toLocaleDateString(
    undefined,
    { weekday: 'long', month: 'long', day: 'numeric' },
  );

  useEffect(() => {
    if (isOpen) {
      setDescription('');
      setAmount('');
      setDirection('debit');
      // Defer focus to allow render
      setTimeout(() => descriptionRef.current?.focus(), 0);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      // Focus trap: Tab cycles within panel
      if (e.key === 'Tab' && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'button, input, [tabindex]:not([tabindex="-1"])',
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  function isAmountValid(): boolean {
    if (!amount) return false;
    try {
      const dec = new Decimal(amount);
      return dec.greaterThan(0);
    } catch {
      return false;
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim() || !isAmountValid()) return;

    const signed =
      direction === 'debit'
        ? new Decimal(amount).negated().toFixed(2)
        : new Decimal(amount).toFixed(2);

    onSubmit({ description: description.trim(), amount: signed });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="transaction-modal-title"
        className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6"
      >
        <h2
          id="transaction-modal-title"
          className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4"
        >
          Add Transaction — {formattedDate}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="modal-description"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Description
            </label>
            <input
              ref={descriptionRef}
              id="modal-description"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={255}
              placeholder="e.g. Grocery run"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label
              htmlFor="modal-amount"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Amount
            </label>
            <AmountField
              id="modal-amount"
              value={amount}
              onChange={setAmount}
            />
          </div>

          <SegmentedControl
            options={DIRECTION_OPTIONS}
            value={direction}
            onChange={setDirection}
            legend="Transaction direction"
            name="modal-direction"
          />

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!description.trim() || !isAmountValid()}
              className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Add Transaction
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
