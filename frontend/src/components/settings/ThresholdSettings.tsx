import { useState, useEffect } from 'react';
import Decimal from 'decimal.js';

interface ThresholdSettingsProps {
  greenThreshold: string;
  yellowThreshold: string;
  onSave: (green: string, yellow: string) => void;
  isSaving?: boolean;
}

const FIELD_CLASSES =
  'hit-target w-full rounded-md border border-cream-mid bg-cream px-3.5 py-[11px] font-mono text-[15px] text-charcoal focus:outline-none focus-visible:ring-2 focus-visible:ring-sage';

/**
 * Form for configuring balance health thresholds.
 * Validation: green > yellow > 0.
 */
export function ThresholdSettings({
  greenThreshold,
  yellowThreshold,
  onSave,
  isSaving,
}: ThresholdSettingsProps) {
  const [green, setGreen] = useState(greenThreshold);
  const [yellow, setYellow] = useState(yellowThreshold);
  const [error, setError] = useState<string | null>(null);

  // Sync from parent if props change (e.g. after refetch)
  useEffect(() => {
    setGreen(greenThreshold);
    setYellow(yellowThreshold);
  }, [greenThreshold, yellowThreshold]);

  function validate(): string | null {
    try {
      const g = new Decimal(green);
      const y = new Decimal(yellow);
      if (!g.greaterThan(0) || !y.greaterThan(0)) {
        return 'Both thresholds must be greater than 0.';
      }
      if (!g.greaterThan(y)) {
        return 'The "Good" threshold must be greater than the "Low" threshold.';
      }
      return null;
    } catch {
      return 'Enter valid numbers for both thresholds.';
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    onSave(
      new Decimal(green).toFixed(2),
      new Decimal(yellow).toFixed(2),
    );
  }

  return (
    // noValidate: the decimal.js check below is the only validator, so its
    // wording is always what the user sees. Native `min` enforcement would
    // silently swallow the submit and show a browser tooltip instead.
    <form onSubmit={handleSubmit} aria-label="Balance threshold settings" noValidate>
      <p className="mb-4 text-sm text-stone">
        The calendar colors your running balance against these two lines. Good
        must sit above Low.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="threshold-green"
            className="mb-1 block text-[13px] font-medium text-sage-deep"
          >
            Good — at or above
          </label>
          <input
            id="threshold-green"
            type="number"
            min="0.01"
            step="0.01"
            value={green}
            onChange={(e) => setGreen(e.target.value)}
            className={FIELD_CLASSES}
          />
        </div>
        <div>
          <label
            htmlFor="threshold-yellow"
            className="mb-1 block text-[13px] font-medium text-copper-dark"
          >
            Low — at or below
          </label>
          <input
            id="threshold-yellow"
            type="number"
            min="0.01"
            step="0.01"
            value={yellow}
            onChange={(e) => setYellow(e.target.value)}
            className={FIELD_CLASSES}
          />
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-2 text-sm text-error">
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={isSaving}
          className="hit-target rounded-full bg-copper px-[18px] py-[11px] text-sm font-semibold text-cream transition-all duration-150 ease-out hover:-translate-y-px hover:bg-copper-dark hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-sage disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
        >
          {isSaving ? 'Saving…' : 'Save thresholds'}
        </button>
        <p className="text-[13px] text-stone">
          Alerts fire when a forecast day crosses either line.
        </p>
      </div>
    </form>
  );
}
