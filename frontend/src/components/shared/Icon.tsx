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
  | 'moon';

/** Path geometry for each icon, drawn on a 24×24 grid. */
const PATHS: Record<IconName, string> = {
  'chevron-left': 'M15 18l-6-6 6-6',
  'chevron-right': 'M9 18l6-6-6-6',
  'chevron-down': 'M6 9l6 6 6-6',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35',
  close: 'M18 6L6 18M6 6l12 12',
  'sort-asc': 'M12 19V5M5 12l7-7 7 7',
  'sort-desc': 'M12 5v14M19 12l-7 7-7-7',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42',
  moon: 'M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z',
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
      <path d={PATHS[name]} />
    </svg>
  );
}
