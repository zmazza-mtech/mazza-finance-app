/**
 * The household every query is scoped to, until authentication can name one.
 *
 * Seeded by `migrations/0001_seed_household.sql` with this exact id. It is
 * fixed rather than generated so a request can scope a query without first
 * discovering which household it belongs to — the discovery step is what #89
 * introduces, when the id starts coming from a verified JWT's membership
 * lookup instead of from here.
 *
 * Every ported route takes a household id as its first argument even now, so
 * that swap is a change of source rather than a retrofit pass over every
 * query (#68).
 */
export const MAZZA_HOUSEHOLD_ID = '40ffc4b3-cbf0-432b-add9-cd0f6d8ec720';

/**
 * The household for the current request.
 *
 * A function rather than a bare constant on purpose: the call sites it grows
 * are the ones #89 has to change, and a constant read directly would leave
 * them invisible.
 */
export function currentHouseholdId(): string {
  return MAZZA_HOUSEHOLD_ID;
}
