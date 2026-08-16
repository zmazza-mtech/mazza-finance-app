import { describe, it, expect } from 'vitest';
import {
  createRovingState,
  moveFocus,
  keyToDirection,
  RovingDirection,
  RovingState,
} from '@/lib/keyboard';

describe('createRovingState', () => {
  it('creates state with first item focused by default', () => {
    const state = createRovingState(['a', 'b', 'c']);
    expect(state.focusedId).toBe('a');
    expect(state.ids).toEqual(['a', 'b', 'c']);
  });

  it('creates state with specified initial focus', () => {
    const state = createRovingState(['a', 'b', 'c'], 'b');
    expect(state.focusedId).toBe('b');
  });

  it('falls back to first id if initial focus is not in ids', () => {
    const state = createRovingState(['a', 'b', 'c'], 'z');
    expect(state.focusedId).toBe('a');
  });

  it('handles empty ids array', () => {
    const state = createRovingState([]);
    expect(state.focusedId).toBeNull();
  });
});

describe('moveFocus', () => {
  const state: RovingState = {
    ids: ['2025-01-01', '2025-01-02', '2025-01-03', '2025-01-04', '2025-01-05'],
    focusedId: '2025-01-03',
  };

  it('moves focus to the next id on ArrowRight', () => {
    const next = moveFocus(state, RovingDirection.Next);
    expect(next.focusedId).toBe('2025-01-04');
  });

  it('moves focus to the previous id on ArrowLeft', () => {
    const next = moveFocus(state, RovingDirection.Prev);
    expect(next.focusedId).toBe('2025-01-02');
  });

  it('wraps from last to first on ArrowRight', () => {
    const lastState: RovingState = {
      ids: ['a', 'b', 'c'],
      focusedId: 'c',
    };
    const next = moveFocus(lastState, RovingDirection.Next);
    expect(next.focusedId).toBe('a');
  });

  it('wraps from first to last on ArrowLeft', () => {
    const firstState: RovingState = {
      ids: ['a', 'b', 'c'],
      focusedId: 'a',
    };
    const next = moveFocus(firstState, RovingDirection.Prev);
    expect(next.focusedId).toBe('c');
  });

  it('jumps forward by 7 on ArrowDown (one week)', () => {
    const next = moveFocus(state, RovingDirection.Down);
    // 2025-01-03 is index 2; +7 would be index 9 which is beyond bounds — clamps to last
    expect(next.focusedId).toBe('2025-01-05');
  });

  it('jumps backward by 7 on ArrowUp (one week)', () => {
    const next = moveFocus(state, RovingDirection.Up);
    // 2025-01-03 is index 2; -7 would be index -5 — clamps to first
    expect(next.focusedId).toBe('2025-01-01');
  });

  it('returns same state when focusedId is null', () => {
    const emptyState: RovingState = { ids: [], focusedId: null };
    const next = moveFocus(emptyState, RovingDirection.Next);
    expect(next.focusedId).toBeNull();
  });

  it('does not mutate original state', () => {
    const original = { ...state };
    moveFocus(state, RovingDirection.Next);
    expect(state.focusedId).toBe(original.focusedId);
  });
});

// ---------------------------------------------------------------------------
// Home / End — first and last day of the visible month
// ---------------------------------------------------------------------------

describe('keyToDirection for Home and End', () => {
  it('maps Home to the first cell', () => {
    expect(keyToDirection('Home')).toBe(RovingDirection.First);
  });

  it('maps End to the last cell', () => {
    expect(keyToDirection('End')).toBe(RovingDirection.Last);
  });

  it('does not map the month jumps, which are not moves within the grid', () => {
    // PageUp/PageDown change which month is rendered, so they are the grid
    // handler's business rather than a roving move over the current ids.
    expect(keyToDirection('PageUp')).toBeNull();
    expect(keyToDirection('PageDown')).toBeNull();
  });
});

describe('moveFocus to first and last', () => {
  const state: RovingState = createRovingState(
    ['2025-01-01', '2025-01-02', '2025-01-03', '2025-01-04'],
    '2025-01-03',
  );

  it('jumps to the first cell', () => {
    expect(moveFocus(state, RovingDirection.First).focusedId).toBe('2025-01-01');
  });

  it('jumps to the last cell', () => {
    expect(moveFocus(state, RovingDirection.Last).focusedId).toBe('2025-01-04');
  });

  it('stays put on the first cell rather than wrapping to the last', () => {
    const atFirst = createRovingState(state.ids, '2025-01-01');
    expect(moveFocus(atFirst, RovingDirection.First).focusedId).toBe('2025-01-01');
  });

  it('stays put on the last cell rather than wrapping to the first', () => {
    const atLast = createRovingState(state.ids, '2025-01-04');
    expect(moveFocus(atLast, RovingDirection.Last).focusedId).toBe('2025-01-04');
  });

  it('returns the same state when there is nothing focused', () => {
    const empty: RovingState = { ids: [], focusedId: null };
    expect(moveFocus(empty, RovingDirection.Last).focusedId).toBeNull();
  });
});
