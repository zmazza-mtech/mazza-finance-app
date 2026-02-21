import Decimal from 'decimal.js';

interface AmountFieldProps {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  disabled?: boolean;
}

function isNegativeInput(value: string): boolean {
  if (value === '' || value === '-') return false;
  try {
    return new Decimal(value).isNegative() && !new Decimal(value).isZero();
  } catch {
    return false;
  }
}

/**
 * Amount input field that enforces positive values.
 * Displays a "$" prefix and an error message for negative inputs.
 * Negative direction is handled by the Debit/Deposit segmented control.
 */
export function AmountField({ value, onChange, id, disabled }: AmountFieldProps) {
  const errorId = id ? `${id}-error` : 'amount-field-error';
  const hasError = isNegativeInput(value);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center border border-gray-300 dark:border-gray-600 rounded-md overflow-hidden focus-within:ring-2 focus-within:ring-blue-500">
        <span
          className="px-3 py-2 bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border-r border-gray-300 dark:border-gray-600 select-none"
          aria-hidden="true"
        >
          $
        </span>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          role="textbox"
          aria-label="Amount in dollars"
          aria-invalid={hasError}
          aria-describedby={hasError ? errorId : undefined}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder="0.00"
          className="flex-1 px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none min-w-0 disabled:opacity-50"
        />
      </div>
      {hasError && (
        <p id={errorId} role="alert" className="text-sm text-red-700 dark:text-red-400">
          Enter a positive amount. Use the Debit/Deposit selector to indicate direction.
        </p>
      )}
    </div>
  );
}
