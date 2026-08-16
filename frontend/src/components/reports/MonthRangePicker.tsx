interface MonthRangePickerProps {
  /** YYYY-MM */
  startMonth: string;
  /** YYYY-MM */
  endMonth: string;
  onStartMonthChange: (month: string) => void;
  onEndMonthChange: (month: string) => void;
}

/** The current month as `YYYY-MM`, offset by whole months. */
function monthFromNow(offset: number): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Spans in months, counted inclusively — "Last 6 months" ends on the current
 * month and reaches back five, which is six columns in the table.
 *
 * None exceeds the two years the monthly endpoint will bucket, so no preset can
 * produce a request it rejects.
 */
const PRESETS = [3, 6, 12] as const;

/**
 * The month-granularity twin of `DateRangePicker`, for the views that bucket by
 * calendar month. Native `type="month"` inputs, so the platform supplies the
 * picker and the value is already the `YYYY-MM` the endpoint wants.
 */
export function MonthRangePicker({
  startMonth,
  endMonth,
  onStartMonthChange,
  onEndMonthChange,
}: MonthRangePickerProps) {
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <div className="inline-flex items-center gap-2 rounded-full border border-cream-mid bg-surface px-3.5 py-[7px]">
        <label className="inline-flex items-center gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-label text-warm-gray">
            From
          </span>
          <input
            type="month"
            value={startMonth}
            onChange={(e) => onStartMonthChange(e.target.value)}
            className="hit-target bg-transparent font-mono text-xs text-charcoal focus:outline-none focus-visible:ring-2 focus-visible:ring-sage"
          />
        </label>
        <span aria-hidden="true" className="text-warm-gray">
          ·
        </span>
        <label className="inline-flex items-center gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-label text-warm-gray">
            To
          </span>
          <input
            type="month"
            value={endMonth}
            onChange={(e) => onEndMonthChange(e.target.value)}
            className="hit-target bg-transparent font-mono text-xs text-charcoal focus:outline-none focus-visible:ring-2 focus-visible:ring-sage"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((span) => (
          <button
            key={span}
            type="button"
            onClick={() => {
              onStartMonthChange(monthFromNow(-(span - 1)));
              onEndMonthChange(monthFromNow(0));
            }}
            className="hit-target rounded-full border border-cream-mid bg-surface px-3 py-[7px] text-xs text-stone transition-colors duration-150 hover:border-sage-light hover:text-bark focus:outline-none focus-visible:ring-2 focus-visible:ring-sage"
          >
            Last {span} months
          </button>
        ))}
      </div>
    </div>
  );
}
