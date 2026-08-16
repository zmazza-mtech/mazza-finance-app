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
        className="inline-flex gap-1 rounded-full border border-cream-mid bg-cream p-1"
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
              className={`hit-target flex-1 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-sage ${
                selected
                  ? 'bg-bark font-semibold text-cream'
                  : 'text-stone hover:text-bark'
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
