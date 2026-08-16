import { useState, useEffect, useRef } from 'react';
import { AmountField } from '@/components/shared/AmountField';
import { Sheet } from '@/components/shared/Sheet';
import type { Recurring, Frequency, UpdateRecurringBody } from '@/api/types';
import Decimal from 'decimal.js';

interface EditSeriesModalProps {
  recurring: Recurring | null;
  isOpen: boolean;
  isCreating?: boolean;
  accountId?: string;
  onSave: (id: string | null, body: UpdateRecurringBody) => void;
  onClose: () => void;
}

const FREQUENCY_OPTIONS: { value: Frequency; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Biweekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];

/**
 * Modal form for editing or creating a recurring transaction series.
 * When isCreating=true, recurring may be null; onSave receives id=null.
 */
export function EditSeriesModal({
  recurring,
  isOpen,
  isCreating = false,
  onSave,
  onClose,
}: EditSeriesModalProps) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<Frequency>('monthly');
  const [nextDate, setNextDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    if (recurring) {
      setName(recurring.name);
      // Amount stored as signed decimal; show absolute value in field
      const abs = new Decimal(recurring.amount).abs().toFixed(2);
      setAmount(abs);
      setFrequency(recurring.frequency);
      setNextDate(recurring.nextDate);
      setEndDate(recurring.endDate ?? '');
    } else if (isCreating) {
      setName('');
      setAmount('');
      setFrequency('monthly');
      setNextDate(new Date().toISOString().slice(0, 10));
      setEndDate('');
    }
  }, [isOpen, recurring, isCreating]);

  if (!isOpen || (!recurring && !isCreating)) return null;

  function isAmountValid(): boolean {
    try {
      return new Decimal(amount).greaterThan(0);
    } catch {
      return false;
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !isAmountValid()) return;

    let signed: string;
    if (recurring) {
      // Preserve original sign when editing
      const originalIsNegative = new Decimal(recurring.amount).isNegative();
      signed = originalIsNegative
        ? new Decimal(amount).negated().toFixed(2)
        : new Decimal(amount).toFixed(2);
    } else {
      // New series: default to expense (negative)
      signed = new Decimal(amount).negated().toFixed(2);
    }

    const body: UpdateRecurringBody = {
      name: name.trim(),
      amount: signed,
      frequency,
      nextDate,
      endDate: endDate || null,
    };

    onSave(recurring?.id ?? null, body);
    onClose();
  }

  const title = isCreating && !recurring ? 'Add Recurring Series' : 'Edit Recurring Series';
  const submitLabel = isCreating && !recurring ? 'Add' : 'Save Changes';

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      labelledBy="edit-series-title"
      initialFocusRef={nameRef}
      className="max-h-[90vh] p-6"
    >
      <h2 id="edit-series-title" className="mb-4 font-display text-xl text-bark-dark">
        {title}
      </h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="series-name"
            className="mb-1 block text-[13px] font-medium text-charcoal"
          >
            Name
          </label>
          <input
            ref={nameRef}
            id="series-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={255}
            className="hit-target w-full rounded-md border border-cream-mid bg-cream px-3.5 py-[11px] text-[15px] text-charcoal placeholder:text-warm-gray focus:outline-none focus-visible:ring-2 focus-visible:ring-sage"
          />
        </div>

        <div>
          <label
            htmlFor="series-amount"
            className="mb-1 block text-[13px] font-medium text-charcoal"
          >
            Amount
          </label>
          <AmountField
            id="series-amount"
            value={amount}
            onChange={setAmount}
          />
        </div>

        <div>
          <label
            htmlFor="series-frequency"
            className="mb-1 block text-[13px] font-medium text-charcoal"
          >
            Frequency
          </label>
          <select
            id="series-frequency"
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as Frequency)}
            className="hit-target w-full rounded-md border border-cream-mid bg-cream px-3.5 py-[11px] text-[15px] text-charcoal placeholder:text-warm-gray focus:outline-none focus-visible:ring-2 focus-visible:ring-sage"
          >
            {FREQUENCY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="series-next-date"
            className="mb-1 block text-[13px] font-medium text-charcoal"
          >
            Next date
          </label>
          <input
            id="series-next-date"
            type="date"
            value={nextDate}
            onChange={(e) => setNextDate(e.target.value)}
            className="hit-target w-full rounded-md border border-cream-mid bg-cream px-3.5 py-[11px] text-[15px] text-charcoal placeholder:text-warm-gray focus:outline-none focus-visible:ring-2 focus-visible:ring-sage"
          />
        </div>

        <div>
          <label
            htmlFor="series-end-date"
            className="mb-1 block text-[13px] font-medium text-charcoal"
          >
            End date{' '}
            <span className="font-normal text-warm-gray">(optional)</span>
          </label>
          <input
            id="series-end-date"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="hit-target w-full rounded-md border border-cream-mid bg-cream px-3.5 py-[11px] text-[15px] text-charcoal placeholder:text-warm-gray focus:outline-none focus-visible:ring-2 focus-visible:ring-sage"
          />
        </div>

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
            disabled={!name.trim() || !isAmountValid()}
            className="hit-target rounded-full bg-copper px-4 py-2 text-sm font-semibold text-cream transition-all duration-150 ease-out hover:-translate-y-px hover:bg-copper-dark hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-sage disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
          >
            {submitLabel}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
