/**
 * Inline SVG icons, hand-rolled at 2px stroke with round caps and joins per
 * the design system. No icon font, no emoji, no dependency.
 *
 * Icons are decorative by default: they carry aria-hidden and the accessible
 * name comes from the control that wraps them. Pass a `title` only when the
 * icon is the sole content of a control and no aria-label is available.
 */

export type IconName =
  | 'chevron-left'
  | 'chevron-right'
  | 'chevron-down'
  | 'search'
  | 'close'
  | 'sort-asc'
  | 'sort-desc'
  | 'sun'
  | 'moon'
  | 'more'
  | 'tab-calendar'
  | 'tab-activity'
  | 'tab-recurring'
  | 'tab-reports'
  | 'tab-settings';

/**
 * Path geometry for each icon, drawn on a 24×24 grid.
 *
 * An array draws several paths in one icon. The tab glyphs need it — a
 * calendar is a body plus its rings, and the settings sliders are two tracks
 * broken around two knobs. They stay paths rather than `rect` and `circle` so
 * one renderer covers every icon.
 */
const PATHS: Record<IconName, string | readonly string[]> = {
  'chevron-left': 'M15 18l-6-6 6-6',
  'chevron-right': 'M9 18l6-6-6-6',
  'chevron-down': 'M6 9l6 6 6-6',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35',
  close: 'M18 6L6 18M6 6l12 12',
  'sort-asc': 'M12 19V5M5 12l7-7 7 7',
  'sort-desc': 'M12 5v14M19 12l-7 7-7-7',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42',
  moon: 'M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z',
  // Three dots, drawn as zero-length segments so the round linecap makes them.
  more: 'M5 12h.01M12 12h.01M19 12h.01',

  'tab-calendar': [
    'M6 5h12a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z',
    'M3 10h18M8 3v3M16 3v3',
  ],
  'tab-activity': 'M4 7h16M4 12h11M4 17h7',
  'tab-recurring': ['M20 12a8 8 0 1 1-2.3-5.6', 'M20 4v4h-4'],
  'tab-reports': 'M6 20V11M12 20V5M18 20v-6',
  // The tracks stop either side of each knob, so the knob reads as sitting on
  // the track rather than having a line drawn through it.
  'tab-settings': [
    'M4 8h3.5M12.5 8H20',
    'M4 16h8.5M17.5 16H20',
    'M12.5 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z',
    'M17.5 16a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z',
  ],
};

interface IconProps {
  name: IconName;
  /** Rendered size in pixels. Defaults to 16. */
  size?: number;
  className?: string;
  /** Accessible name. Omit when the wrapping control already has one. */
  title?: string;
}

export function Icon({ name, size = 16, className, title }: IconProps) {
  const geometry = PATHS[name];
  const paths = typeof geometry === 'string' ? [geometry] : geometry;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title && <title>{title}</title>}
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
