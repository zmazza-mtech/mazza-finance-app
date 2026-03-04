import { SourceBadge } from '@/components/shared/SourceBadge';
import { formatAmount, isNegative } from '@/lib/balance';
import type { ForecastTransaction } from '@/api/types';

interface TransactionItemProps {
  transaction: ForecastTransaction;
  onClick?: () => void;
  /** When true, description wraps instead of truncating. */
  wrap?: boolean;
}

/**
 * Renders a single forecast transaction.
 * - Color paired with direction icon (never color alone)
 * - aria-label: "[name], $[amount], [debit|deposit], [source]"
 */
export function TransactionItem({ transaction, onClick, wrap }: TransactionItemProps) {
  const { description, amount, source } = transaction;
  const debit = isNegative(amount);
  const formattedAmount = formatAmount(amount);
  const direction = debit ? 'debit' : 'deposit';

  const ariaLabel = `${description}, $${formattedAmount}, ${direction}, ${source}`;

  return (
    <li
      aria-label={ariaLabel}
      className={`flex ${wrap ? 'items-start' : 'items-center'} justify-between gap-2 text-xs py-0.5 ${
        onClick ? 'cursor-pointer hover:underline' : ''
      } ${debit ? 'text-red-700 dark:text-red-400' : 'text-green-700 dark:text-green-400'}`}
      onClick={onClick}
    >
      <span className="flex items-center gap-1 min-w-0">
        <span aria-hidden="true" className="shrink-0">
          {debit ? '↓' : '↑'}
        </span>
        <span className={`${wrap ? '' : 'truncate'} text-gray-800 dark:text-gray-200`} title={wrap ? undefined : description}>
          {description}
        </span>
      </span>
      <span className="flex items-center gap-1 shrink-0">
        <span className="font-medium">${formattedAmount}</span>
        <SourceBadge source={source} />
      </span>
    </li>
  );
}
