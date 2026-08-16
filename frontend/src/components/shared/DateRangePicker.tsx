interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
}

type Preset = { label: string; getRange: () => [string, string] };

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const PRESETS: Preset[] = [
  {
    label: 'This Month',
    getRange: () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return [toIso(start), toIso(end)];
    },
  },
  {
    label: 'Last 30d',
    getRange: () => {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 30);
      return [toIso(start), toIso(end)];
    },
  },
  {
    label: 'Last 90d',
    getRange: () => {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 90);
      return [toIso(start), toIso(end)];
    },
  },
  {
    label: 'YTD',
    getRange: () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), 0, 1);
      return [toIso(start), toIso(now)];
    },
  },
];

/**
 * Date range picker: a single pill holding both bounds, with preset shortcuts.
 *
 * The two inputs read as one control because they describe one range — the
 * FROM and TO labels sit inside the pill rather than floating beside it.
 */
export function DateRangePicker({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
}: DateRangePickerProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex w-full flex-wrap items-center gap-2 rounded-full border border-cream-mid bg-surface px-3.5 py-[7px] sm:inline-flex sm:w-auto sm:flex-nowrap">
        <label className="inline-flex items-center gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-label text-warm-gray">
            From
          </span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => onStartDateChange(e.target.value)}
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
            type="date"
            value={endDate}
            onChange={(e) => onEndDateChange(e.target.value)}
            className="hit-target bg-transparent font-mono text-xs text-charcoal focus:outline-none focus-visible:ring-2 focus-visible:ring-sage"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => {
              const [s, e] = preset.getRange();
              onStartDateChange(s);
              onEndDateChange(e);
            }}
            className="hit-target rounded-full border border-cream-mid bg-surface px-3 py-[7px] text-xs text-stone transition-colors duration-150 hover:border-sage-light hover:text-bark focus:outline-none focus-visible:ring-2 focus-visible:ring-sage"
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
}
