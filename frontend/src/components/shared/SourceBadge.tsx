type Source = 'actual' | 'forecast' | 'manual';

interface SourceBadgeProps {
  source: Source;
}

const SOURCE_LABELS: Record<Source, string> = {
  actual: 'Actual',
  forecast: 'Forecasted',
  manual: 'Manual',
};

const SOURCE_CLASSES: Record<Source, string> = {
  actual: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  forecast: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  manual: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
};

/**
 * Badge that indicates the source of a transaction.
 * Color is paired with a text label — color is never the sole indicator.
 */
export function SourceBadge({ source }: SourceBadgeProps) {
  return (
    <span
      aria-label={`Transaction source: ${source}`}
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${SOURCE_CLASSES[source]}`}
    >
      {SOURCE_LABELS[source]}
    </span>
  );
}
