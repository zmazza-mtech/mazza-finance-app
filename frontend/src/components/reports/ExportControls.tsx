import { reportExportUrl } from '@/api/client';

interface ExportControlsProps {
  accountId: string;
  startDate: string;
  endDate: string;
}

/**
 * Download links for the two CSV exports, over the range currently on screen.
 *
 * Plain links rather than buttons: the endpoints answer with a
 * `Content-Disposition` attachment, so the browser saves the file itself. A
 * click handler would only add a way for the two to disagree about what is
 * being exported.
 */
export function ExportControls({ accountId, startDate, endDate }: ExportControlsProps) {
  if (!accountId) return null;

  const range = { accountId, startDate, endDate };
  const linkClasses =
    'hit-target rounded-full border border-cream-mid bg-surface px-3 py-[7px] text-xs text-stone transition-colors duration-150 hover:border-sage-light hover:text-bark focus:outline-none focus-visible:ring-2 focus-visible:ring-sage';

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="font-mono text-[10px] uppercase tracking-label text-warm-gray">
        Export
      </span>
      <a href={reportExportUrl('transactions', range)} download className={linkClasses}>
        Transactions CSV
      </a>
      <a href={reportExportUrl('category-summary', range)} download className={linkClasses}>
        Category summary CSV
      </a>
    </div>
  );
}
