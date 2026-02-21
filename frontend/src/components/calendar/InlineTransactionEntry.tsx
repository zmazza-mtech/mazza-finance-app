import { useState, useRef, useEffect } from 'react';
import { AmountField } from '@/components/shared/AmountField';
import { SegmentedControl } from '@/components/shared/SegmentedControl';
import Decimal from 'decimal.js';

type Direction = 'debit' | 'deposit';

interface InlineTransactionEntryProps {
  date: string;
  accountId: string;
  onSubmit: (data: { description: string; amount: string }) => void;
  onCancel: () => void;
}

const DIRECTION_OPTIONS: { value: Direction; label: string }[] = [
  { value: 'debit', label: 'Debit (money out)' },
  { value: 'deposit', label: 'Deposit (money in)' },
];

/**
 * Inline transaction entry form.
 * - Opens below the day cell on desktop
 * - Mobile always uses TransactionModal instead (triggered by "+" button)
 * - Amount is positive input; direction selector controls sign sent to API
 */
export function InlineTransactionEntry({
  date,
  accountId: _accountId,
  onSubmit,
  onCancel,
}: InlineTransactionEntryProps) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [direction, setDirection] = useState<Direction>('debit');
  const descriptionRef = useRef<HTMLInputElement>(null);

  // Focus description field on mount
  useEffect(() => {
    descriptionRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onCancel]);

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

    // Debit = negative amount; deposit = positive
    const signed =
      direction === 'debit'
        ? new Decimal(amount).negated().toFixed(2)
        : new Decimal(amount).toFixed(2);

    onSubmit({ description: description.trim(), amount: signed });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-1 p-3 border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 rounded-md"
      aria-label={`Add transaction for ${date}`}
    >
      <div className="space-y-2">
        <div>
          <label
            htmlFor="inline-description"
            className="sr-only"
          >
            Description
          </label>
          <input
            ref={descriptionRef}
            id="inline-description"
            type="text"
            placeholder="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={255}
            className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <AmountField
          id="inline-amount"
          value={amount}
          onChange={setAmount}
        />

        <SegmentedControl
          options={DIRECTION_OPTIONS}
          value={direction}
          onChange={setDirection}
          legend="Transaction direction"
          name="inline-direction"
        />

        <div className="flex gap-2 justify-end">
          {/* Cancel always visible — required on mobile where Escape is unavailable */}
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!description.trim() || !isAmountValid()}
            className="px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Add
          </button>
        </div>
      </div>
    </form>
  );
}
