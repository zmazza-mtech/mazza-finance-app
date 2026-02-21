import { useState, useEffect, useRef } from 'react';
import { AmountField } from '@/components/shared/AmountField';
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
  const panelRef = useRef<HTMLDivElement>(null);

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
    setTimeout(() => nameRef.current?.focus(), 0);
  }, [isOpen, recurring, isCreating]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'button, input, select, [tabindex]:not([tabindex="-1"])',
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
        aria-labelledby="edit-series-title"
        className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6 max-h-[90vh] overflow-y-auto"
      >
        <h2
          id="edit-series-title"
          className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4"
        >
          {title}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="series-name"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
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
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label
              htmlFor="series-amount"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
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
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Frequency
            </label>
            <select
              id="series-frequency"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as Frequency)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Next date
            </label>
            <input
              id="series-next-date"
              type="date"
              value={nextDate}
              onChange={(e) => setNextDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label
              htmlFor="series-end-date"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              End date{' '}
              <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              id="series-end-date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

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
              disabled={!name.trim() || !isAmountValid()}
              className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
