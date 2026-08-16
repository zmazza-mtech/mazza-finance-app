import type { TransactionSource } from '@/api/types';

interface SourceBadgeProps {
  source: TransactionSource;
}

const SOURCE_LABELS: Record<TransactionSource, string> = {
  actual: 'Actual',
  forecast: 'Forecast',
  manual: 'Manual',
};

const SOURCE_CLASSES: Record<TransactionSource, string> = {
  actual: 'bg-sage-lighter text-sage-deep',
  forecast: 'bg-cream-mid text-bark-light',
  manual: 'bg-cream text-stone',
};

/**
 * Where a transaction came from: settled bank data, a forecast projection, or
 * hand entry. Color is paired with a text label — color is never the sole
 * indicator.
 */
export function SourceBadge({ source }: SourceBadgeProps) {
  return (
    <span
      aria-label={`Transaction source: ${source}`}
      className={`inline-flex items-center rounded-full px-1.5 py-px font-mono text-[10px] uppercase tracking-[0.1em] ${SOURCE_CLASSES[source]}`}
    >
      {SOURCE_LABELS[source]}
    </span>
  );
}
