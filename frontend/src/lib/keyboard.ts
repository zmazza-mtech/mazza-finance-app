/**
 * Roving tabindex utilities for keyboard navigation within calendar grid.
 *
 * Implements the ARIA roving tabindex pattern:
 * https://www.w3.org/WAI/ARIA/apg/patterns/grid/
 */

export interface RovingState {
  ids: string[];
  focusedId: string | null;
}

export enum RovingDirection {
  Next = 'next',       // ArrowRight
  Prev = 'prev',       // ArrowLeft
  Up = 'up',           // ArrowUp   (7 positions back)
  Down = 'down',       // ArrowDown (7 positions forward)
  First = 'first',     // Home      (first day of the visible month)
  Last = 'last',       // End       (last day of the visible month)
}

/**
 * Creates a new roving tabindex state from a list of IDs.
 * Optionally sets the initially focused ID.
 */
export function createRovingState(
  ids: string[],
  initialFocusId?: string,
): RovingState {
  if (ids.length === 0) {
    return { ids, focusedId: null };
  }

  const focusedId =
    initialFocusId && ids.includes(initialFocusId)
      ? initialFocusId
      : ids[0];

  return { ids, focusedId };
}

/**
 * Computes the next roving state after a directional move.
 * Does not mutate the input state.
 */
export function moveFocus(
  state: RovingState,
  direction: RovingDirection,
): RovingState {
  const { ids, focusedId } = state;

  if (focusedId === null || ids.length === 0) {
    return state;
  }

  const currentIndex = ids.indexOf(focusedId);
  if (currentIndex === -1) {
    return state;
  }

  let nextIndex: number;

  switch (direction) {
    case RovingDirection.Next:
      nextIndex = (currentIndex + 1) % ids.length;
      break;
    case RovingDirection.Prev:
      nextIndex = (currentIndex - 1 + ids.length) % ids.length;
      break;
    case RovingDirection.Down:
      // Jump 7 positions forward (one week), clamp to last
      nextIndex = Math.min(currentIndex + 7, ids.length - 1);
      break;
    case RovingDirection.Up:
      // Jump 7 positions backward (one week), clamp to first
      nextIndex = Math.max(currentIndex - 7, 0);
      break;
    case RovingDirection.First:
      // Home: first day of the visible month. Clamps rather than wrapping —
      // the ids are one month, and Home must not walk into the next one.
      nextIndex = 0;
      break;
    case RovingDirection.Last:
      // End: last day of the visible month, same clamping rule.
      nextIndex = ids.length - 1;
      break;
  }

  return { ids, focusedId: ids[nextIndex] };
}

/**
 * Maps a keyboard event key to a RovingDirection, or null if not handled.
 */
export function keyToDirection(key: string): RovingDirection | null {
  switch (key) {
    case 'ArrowRight':
      return RovingDirection.Next;
    case 'ArrowLeft':
      return RovingDirection.Prev;
    case 'ArrowDown':
      return RovingDirection.Down;
    case 'ArrowUp':
      return RovingDirection.Up;
    case 'Home':
      return RovingDirection.First;
    case 'End':
      return RovingDirection.Last;
    default:
      // PageUp and PageDown are absent on purpose: they change which month is
      // rendered, so they are the grid handler's business rather than a move
      // over the ids it currently holds.
      return null;
  }
}
