interface Option<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  legend: string;
  name: string;
}

/**
 * Segmented control implemented with radiogroup semantics.
 * Each option uses role="radio" so screen readers announce the selection.
 * Visual state uses fill + font weight, not color alone.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  legend,
  name,
}: SegmentedControlProps<T>) {
  return (
    <fieldset>
      <legend className="sr-only">{legend}</legend>
      <div
        role="radiogroup"
        aria-label={legend}
        className="flex rounded-md border border-gray-300 dark:border-gray-600 overflow-hidden"
      >
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={option.label}
              name={name}
              onClick={() => onChange(option.value)}
              className={`flex-1 px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 ${
                selected
                  ? 'bg-blue-600 text-white font-semibold'
                  : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
