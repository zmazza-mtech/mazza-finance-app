import { useState, useRef, useEffect } from 'react';
import { AmountField } from '@/components/shared/AmountField';
import { Sheet } from '@/components/shared/Sheet';
import { SegmentedControl } from '@/components/shared/SegmentedControl';
import { formatFullDate } from '@/lib/dates';
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
 * Form for adding a one-off transaction to a day.
 *
 * `Sheet` owns the presentation and the modal behaviour — backdrop, Escape,
 * focus trap, focus restore, scroll lock — and renders as a bottom sheet on a
 * phone. This component owns only the form.
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

  const formattedDate = formatFullDate(date);

  // Reset the form each time it opens, so a cancelled entry does not reappear
  // on the next day the reader taps. Focus is Sheet's job, via
  // `initialFocusRef`.
  useEffect(() => {
    if (isOpen) {
      setDescription('');
      setAmount('');
      setDirection('debit');
    }
  }, [isOpen]);

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
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      labelledBy="transaction-modal-title"
      initialFocusRef={descriptionRef}
      className="p-6"
    >
      <h2 id="transaction-modal-title" className="mb-4 font-display text-xl text-bark-dark">
        Add transaction — {formattedDate}
      </h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="modal-description"
            className="mb-1 block text-[13px] font-medium text-charcoal"
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
            className="hit-target w-full rounded-md border border-cream-mid bg-cream px-3.5 py-[11px] text-[15px] text-charcoal placeholder:text-warm-gray focus:outline-none focus-visible:ring-2 focus-visible:ring-sage"
          />
        </div>

        <div>
          <label
            htmlFor="modal-amount"
            className="mb-1 block text-[13px] font-medium text-charcoal"
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
            className="hit-target rounded-full border border-cream-mid bg-surface px-4 py-2 text-sm text-stone transition-colors duration-150 hover:bg-cream-mid focus:outline-none focus-visible:ring-2 focus-visible:ring-sage"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!description.trim() || !isAmountValid()}
            className="hit-target rounded-full bg-copper-dark px-4 py-2 text-sm font-semibold text-cream transition-all duration-150 ease-out hover:-translate-y-px hover:bg-copper-deep hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-sage disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
          >
            Add transaction
          </button>
        </div>
      </form>
    </Sheet>
  );
}
