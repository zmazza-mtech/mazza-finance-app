import { formatAmount, isNegative } from '@/lib/balance';
import type { ForecastTransaction } from '@/api/types';

interface TransactionItemProps {
  transaction: ForecastTransaction;
  /** When true, highlights this transaction as a search match. */
  isMatch?: boolean;
}

/**
 * One transaction line inside a day cell.
 *
 * Description truncates on the left, amount sits right in mono. The source
 * badge and direction arrow both moved to the day panel — at eleven pixels in
 * a 126px cell there is only room for the name and the number, and the sign
 * already carries the direction.
 */
export function TransactionItem({ transaction, isMatch }: TransactionItemProps) {
  const { description, amount, source } = transaction;
  const debit = isNegative(amount);
  const formattedAmount = formatAmount(amount);
  const direction = debit ? 'debit' : 'deposit';

  return (
    <li
      aria-label={`${description}, $${formattedAmount}, ${direction}, ${source}`}
      className={`flex min-w-0 items-baseline justify-between gap-1.5 text-[11px] leading-[1.35] ${
        isMatch ? 'rounded-sm bg-sage-lighter px-0.5' : ''
      }`}
    >
      <span className="min-w-0 truncate text-charcoal" title={description}>
        {description}
      </span>
      <span
        className={`min-w-0 shrink-0 truncate font-mono ${
          debit ? 'text-bark-light' : 'text-sage-deep'
        }`}
      >
        {/* U+2212 minus, not a hyphen. */}
        {debit ? '−' : '+'}${formattedAmount}
      </span>
    </li>
  );
}
