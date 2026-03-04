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
 * Date range picker with two date inputs and preset buttons.
 */
export function DateRangePicker({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
}: DateRangePickerProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400">
        From
        <input
          type="date"
          value={startDate}
          onChange={(e) => onStartDateChange(e.target.value)}
          className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </label>
      <label className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400">
        To
        <input
          type="date"
          value={endDate}
          onChange={(e) => onEndDateChange(e.target.value)}
          className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </label>
      <div className="flex gap-1">
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => {
              const [s, e] = preset.getRange();
              onStartDateChange(s);
              onEndDateChange(e);
            }}
            className="px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
}
