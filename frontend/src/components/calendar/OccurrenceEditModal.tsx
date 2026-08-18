import { useState, useRef, useEffect } from 'react';
import Decimal from 'decimal.js';
import { AmountField } from '@/components/shared/AmountField';
import { formatFullDate } from '@/lib/dates';
import type { CreateOverrideBody } from '@/api/types';

export interface EditableInstance {
  recurringId: string;
  originalDate: string;
  name: string;
  /** Signed, as the forecast carries it. */
  amount: string;
}

interface OccurrenceEditModalProps {
  instance: EditableInstance;
  isOpen: boolean;
  onSave: (body: CreateOverrideBody) => void;
  onCancel: () => void;
}

/**
 * Edits one occurrence of a recurring series — move it, re-amount it, or skip
 * it — leaving every other occurrence alone.
 *
 * The three actions the user sees map onto the two the API stores: skipping is
 * a `deleted` override, and moving or re-amounting is a `modified` one carrying
 * whichever field changed. Sending a `modified` override with no fields would
 * be accepted and then do nothing, so Save stays disabled until something
 * actually differs.
 *
 * The sign belongs to the series, not to this form. A bill is a debit and a
 * paycheck is a deposit; the field takes a magnitude and the original sign is
 * put back on save, so an override cannot silently flip a charge into income.
 */
export function OccurrenceEditModal({
  instance,
  isOpen,
  onSave,
  onCancel,
}: OccurrenceEditModalProps) {
  const originalMagnitude = new Decimal(instance.amount).abs().toFixed(2);
  const isDebit = new Decimal(instance.amount).isNegative();

  const [amount, setAmount] = useState(originalMagnitude);
  const [date, setDate] = useState(instance.originalDate);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setAmount(originalMagnitude);
    setDate(instance.originalDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, instance.recurringId, instance.originalDate]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  function amountIsUsable(): boolean {
    try {
      return new Decimal(amount).greaterThan(0);
    } catch {
      return false;
    }
  }

  /** The signed amount this form would write, or null when it is unusable. */
  function signedAmount(): string | null {
    if (!amountIsUsable()) return null;
    const magnitude = new Decimal(amount);
    return (isDebit ? magnitude.negated() : magnitude).toFixed(2);
  }

  const signed = signedAmount();
  const amountChanged = signed !== null && signed !== new Decimal(instance.amount).toFixed(2);
  const dateChanged = date !== '' && date !== instance.originalDate;
  const canSave = amountIsUsable() && (amountChanged || dateChanged);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;

    onSave({
      overrideType: 'modified',
      ...(amountChanged ? { overrideAmount: signed! } : {}),
      ...(dateChanged ? { overrideDate: date } : {}),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-scrim/50" onClick={onCancel} aria-hidden="true" />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="occurrence-modal-title"
        className="relative mx-4 w-full max-w-md rounded-lg border border-cream-mid bg-surface p-6 shadow-xl"
      >
        <h2 id="occurrence-modal-title" className="font-display text-xl text-bark-dark">
          Edit {instance.name}
        </h2>
        <p className="mb-4 mt-1 text-[13px] text-stone">
          This occurrence only — {formatFullDate(instance.originalDate)}. Every other
          occurrence in the series is left alone.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="occurrence-amount"
              className="mb-1 block text-[13px] font-medium text-charcoal"
            >
              Amount
            </label>
            <AmountField id="occurrence-amount" value={amount} onChange={setAmount} />
            <p className="mt-1 text-[12px] text-stone">
              {isDebit ? 'Charged against the balance.' : 'Added to the balance.'}
            </p>
          </div>

          <div>
            <label
              htmlFor="occurrence-date"
              className="mb-1 block text-[13px] font-medium text-charcoal"
            >
              Date
            </label>
            <input
              id="occurrence-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="block w-full rounded-md border border-cream-mid bg-cream px-3.5 py-[11px] text-sm text-charcoal focus:outline-none focus-visible:ring-2 focus-visible:ring-sage"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={!canSave}
              className="hit-target rounded-full bg-copper-dark px-4 py-2 text-sm font-semibold text-cream transition-all duration-150 ease-out hover:-translate-y-px hover:bg-copper-deep hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-sage disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
            >
              Save
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="hit-target rounded-full border border-cream-mid bg-surface px-4 py-2 text-sm text-stone transition-colors duration-150 hover:border-sage-light hover:text-bark focus:outline-none focus-visible:ring-2 focus-visible:ring-sage"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={() => onSave({ overrideType: 'deleted' })}
              className="hit-target ml-auto rounded-full px-4 py-2 text-sm text-error-dark underline underline-offset-2 transition-colors duration-150 hover:no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-sage"
            >
              Skip this occurrence
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
