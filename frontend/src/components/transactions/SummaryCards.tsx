import Decimal from 'decimal.js';
import { formatAmount } from '@/lib/balance';
import type { TransactionSummary } from '@/lib/transactionSummary';

interface SummaryCardsProps {
  summary: TransactionSummary;
}

/** "+$1,540.50", "−$984.21", "$0.00" — zero carries no direction. */
function signed(amount: string): string {
  const dec = new Decimal(amount);
  if (dec.isZero()) return `$${formatAmount(amount)}`;
  return `${dec.isNegative() ? '−' : '+'}$${formatAmount(amount)}`;
}

function Card({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass: string;
}) {
  return (
    <div className="flex-1 rounded-lg border border-cream-mid bg-white p-[18px]">
      <p className="font-mono text-[10px] uppercase tracking-label-wide text-warm-gray">
        {label}
      </p>
      <p className={`mt-1.5 font-mono text-2xl ${valueClass}`}>{value}</p>
    </div>
  );
}

/**
 * Money in, money out and the net for whatever the filter row currently
 * admits — the cards read the same rows the table renders, so the two can
 * never disagree.
 */
export function SummaryCards({ summary }: SummaryCardsProps) {
  const { moneyIn, moneyOut, net, count } = summary;

  return (
    <div className="flex flex-wrap gap-3">
      <Card label="Money in" value={`+$${formatAmount(moneyIn)}`} valueClass="text-sage-deep" />
      <Card
        label="Money out"
        value={new Decimal(moneyOut).isZero() ? `$${formatAmount(moneyOut)}` : `−$${formatAmount(moneyOut)}`}
        valueClass="text-bark-light"
      />
      <Card
        label={`Net · ${count} transaction${count === 1 ? '' : 's'}`}
        value={signed(net)}
        valueClass="text-bark-dark"
      />
    </div>
  );
}
