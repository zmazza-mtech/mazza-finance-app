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
      <div className="flex items-center overflow-hidden rounded-md border border-cream-mid focus-within:ring-2 focus-within:ring-sage">
        <span
          className="select-none border-r border-cream-mid bg-cream px-3.5 py-[11px] text-[15px] text-warm-gray"
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
          className="min-w-0 flex-1 bg-cream px-3.5 py-[11px] text-[15px] text-charcoal outline-none placeholder:text-warm-gray disabled:opacity-50"
        />
      </div>
      {hasError && (
        <p id={errorId} role="alert" className="text-sm text-error">
          Enter a positive amount. Use the Debit/Deposit selector to indicate direction.
        </p>
      )}
    </div>
  );
}
