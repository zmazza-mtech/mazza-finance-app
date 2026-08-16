/**
 * The Recurring header sub-line: how many series drive the forecast, and how
 * many are still waiting on a decision.
 *
 * Only active series drive the forecast, so a disabled series is counted by
 * neither number.
 */
export function describeSeriesCounts(activeCount: number, pendingCount: number): string {
  const driving =
    activeCount === 0
      ? 'No series drive your forecast yet.'
      : `${activeCount} series ${activeCount === 1 ? 'drives' : 'drive'} your forecast.`;

  if (pendingCount === 0) return driving;

  // "more" only reads correctly when there is something to be more than.
  const more = activeCount === 0 ? '' : 'more ';
  const verb = pendingCount === 1 ? 'is' : 'are';

  return `${driving} ${pendingCount} ${more}${verb} waiting on you.`;
}

/** A forecast row traced back to the series and occurrence that produced it. */
export interface ForecastInstanceRef {
  recurringId: string;
  originalDate: string;
}

/**
 * Reads a forecast row's id back into the series and date it came from.
 *
 * `computeForecast` builds the id as `recurring_${recurringId}_${date}`, and an
 * override is written against exactly that pair. Anything else — an actual or a
 * manual transaction — has no series behind it and returns null, which is what
 * keeps the override controls off rows that cannot take one.
 */
export function parseForecastInstanceId(id: string): ForecastInstanceRef | null {
  const match = /^recurring_(.+)_(\d{4}-\d{2}-\d{2})$/.exec(id);
  if (!match) return null;

  return { recurringId: match[1]!, originalDate: match[2]! };
}

/**
 * The first occurrence of a series strictly after `today`.
 *
 * Used when reviving a series that was falsely ended (#43). Restoring it with
 * its stored `nextDate` would put a date months in the past back into an
 * active series: it would be judged stale again on the next detection run, and
 * every occurrence between then and now would expand into the calendar as
 * though owed.
 *
 * Dates are advanced by field arithmetic rather than by constructing a `Date`
 * from the string — `new Date('2026-01-01')` is UTC midnight and reads back a
 * day earlier anywhere west of Greenwich, which is the same trap `lib/dates`
 * avoids.
 */
export function nextOccurrenceAfter(
  date: string,
  frequency: 'weekly' | 'biweekly' | 'monthly' | 'yearly',
  today: string,
): string {
  let current = date;
  // A series paid decades ago would otherwise spin; no real frequency needs
  // more steps than this to clear any plausible gap.
  for (let guard = 0; current <= today && guard < 5000; guard++) {
    current = advance(current, frequency);
  }
  return current;
}

function advance(date: string, frequency: string): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];

  if (frequency === 'weekly' || frequency === 'biweekly') {
    const step = frequency === 'weekly' ? 7 : 14;
    const d = new Date(Date.UTC(year, month - 1, day + step));
    return d.toISOString().slice(0, 10);
  }

  const months = frequency === 'yearly' ? 12 : 1;
  const total = month - 1 + months;
  const y = year + Math.floor(total / 12);
  const m = (total % 12) + 1;
  // Clamp rather than overflow: January 31 plus a month is the end of
  // February, not March 3.
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const dd = Math.min(day, lastDay);

  return `${y}-${String(m).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}
