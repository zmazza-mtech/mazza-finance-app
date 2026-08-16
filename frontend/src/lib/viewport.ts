/**
 * The one breakpoint.
 *
 * Below 640px the app renders its phone shell; at 640px and above it renders
 * the desktop layout. Tailwind's default `sm` screen is 640px and its
 * utilities are min-width, so phone styling is the unprefixed base and desktop
 * rules carry the `sm:` prefix.
 *
 * The bound is 639.98 rather than 639 because CSS widths are fractional. A
 * `max-width: 639px` query and Tailwind's `min-width: 640px` leave everything
 * between matching neither, and a viewport at 639.5px — real, on scaled
 * displays — would fall through both and render an unstyled hybrid.
 */
export const PHONE_QUERY = '(max-width: 639.98px)';
