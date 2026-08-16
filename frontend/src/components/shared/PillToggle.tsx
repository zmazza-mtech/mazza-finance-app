interface PillToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Accessible name for the switch. */
  label: string;
  disabled?: boolean;
}

/**
 * The 42×24 pill switch used for account inclusion and appearance.
 *
 * A `button` with `role="switch"` rather than a styled checkbox: it carries
 * its own state to assistive tech and is keyboard operable with no extra
 * wiring. The track is an inner element so the button itself can clear the
 * 44px touch minimum without stretching the pill.
 */
export function PillToggle({ checked, onChange, label, disabled }: PillToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="hit-target inline-flex shrink-0 items-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span
        aria-hidden="true"
        className={`relative block h-6 w-[42px] rounded-full transition-colors duration-150 ${
          checked ? 'bg-sage' : 'bg-cream-mid'
        }`}
      >
        <span
          data-knob
          className={`absolute left-[3px] top-[3px] block h-[18px] w-[18px] rounded-full bg-surface shadow-[0_1px_2px_rgba(93,64,55,.2)] transition-transform duration-150 ${
            checked ? 'translate-x-[18px]' : 'translate-x-0'
          }`}
        />
      </span>
    </button>
  );
}
