import { useState, useEffect } from 'react';
import Decimal from 'decimal.js';

interface ThresholdSettingsProps {
  greenThreshold: string;
  yellowThreshold: string;
  onSave: (green: string, yellow: string) => void;
  isSaving?: boolean;
}

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
    <form onSubmit={handleSubmit} aria-label="Balance threshold settings">
      <fieldset>
        <legend className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
          Balance health thresholds
        </legend>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          When your running balance falls at or below these amounts, the balance
          indicator changes color. Green (Good) must be higher than Yellow (Low).
        </p>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="threshold-green"
              className="block text-sm font-medium text-green-700 dark:text-green-400 mb-1"
            >
              Good threshold ($)
            </label>
            <input
              id="threshold-green"
              type="number"
              min="0.01"
              step="0.01"
              value={green}
              onChange={(e) => setGreen(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label
              htmlFor="threshold-yellow"
              className="block text-sm font-medium text-amber-700 dark:text-amber-300 mb-1"
            >
              Low threshold ($)
            </label>
            <input
              id="threshold-yellow"
              type="number"
              min="0.01"
              step="0.01"
              value={yellow}
              onChange={(e) => setYellow(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-400">
            {error}
          </p>
        )}

        <div className="mt-4">
          <button
            type="submit"
            disabled={isSaving}
            className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {isSaving ? 'Saving...' : 'Save thresholds'}
          </button>
        </div>
      </fieldset>
    </form>
  );
}
