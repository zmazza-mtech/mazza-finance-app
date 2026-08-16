import { describe, it, expect } from 'vitest';

// TEMPORARY — proves the required check goes red and blocks the merge.
// Deleted with this branch once the gate is verified. See #6.
describe('CI gate', () => {
  it('fails on purpose', () => {
    expect(1).toBe(2);
  });
});
