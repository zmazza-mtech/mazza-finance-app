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
