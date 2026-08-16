/**
 * Date formatting for display.
 *
 * Dates arrive as YYYY-MM-DD strings and are formatted by splitting them
 * rather than by constructing a `Date`. `new Date('2026-01-01')` parses as UTC
 * midnight and renders as December 31 in any negative-offset timezone, which
 * would misdate the calendar for anyone west of Greenwich.
 */

const SHORT_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const FULL_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** "2026-08-31" → "Aug 31" */
export function formatShortDate(date: string): string {
  const parts = date.split('-');
  const month = SHORT_MONTHS[Number(parts[1]) - 1];
  return `${month} ${Number(parts[2])}`;
}

/** "2026-08-01" → "AUG 1", for the chart axis. */
export function formatAxisDate(date: string): string {
  return formatShortDate(date).toUpperCase();
}

/** "2026-08" → "August" */
export function formatMonthTitle(yearMonth: string): string {
  const parts = yearMonth.split('-');
  return FULL_MONTHS[Number(parts[1]) - 1];
}

const WEEKDAYS = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * "2026-08-15" → "Saturday, August 15", for the day panel heading.
 *
 * The weekday comes from a UTC-constructed date so the calendar day cannot
 * shift under the viewer's timezone.
 */
export function formatFullDate(date: string): string {
  const parts = date.split('-');
  const weekday = new Date(
    Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])),
  ).getUTCDay();
  return `${WEEKDAYS[weekday]}, ${FULL_MONTHS[Number(parts[1]) - 1]} ${Number(parts[2])}`;
}

/**
 * "2026-08-01", "2026-08-31" → "Aug 1 – Aug 31, 2026", for the page subtitle.
 *
 * The year is stated once when both ends share it and twice when the range
 * crosses a year boundary, where the shared-year form would be ambiguous.
 */
export function formatDateRange(startDate: string, endDate: string): string {
  const startYear = startDate.slice(0, 4);
  const endYear = endDate.slice(0, 4);

  if (startDate === endDate) {
    return `${formatShortDate(startDate)}, ${endYear}`;
  }
  if (startYear !== endYear) {
    return `${formatShortDate(startDate)}, ${startYear} – ${formatShortDate(endDate)}, ${endYear}`;
  }
  return `${formatShortDate(startDate)} – ${formatShortDate(endDate)}, ${endYear}`;
}

/**
 * Today in the viewer's own timezone.
 *
 * `new Date().toISOString().slice(0, 10)` is UTC's today, which rolls over
 * mid-evening across the Americas — at 8pm on the 15th in New York it reports
 * the 16th, moving the today divider and the month-to-date span onto a day
 * that has not started yet.
 */
export function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * "2026-08" → "2026-08-31".
 *
 * Built from the day number rather than serializing a `Date`, because
 * `new Date(y, m, 0).toISOString()` converts local midnight to UTC and lands
 * on the previous day anywhere east of Greenwich.
 */
export function lastDayOfMonth(yearMonth: string): string {
  const parts = yearMonth.split('-');
  const lastDay = new Date(Date.UTC(Number(parts[0]), Number(parts[1]), 0)).getUTCDate();
  return `${yearMonth}-${pad(lastDay)}`;
}
