import { describe, it, expect } from 'vitest';

// TEMPORARY — proves the `worker tests` job actually runs this suite and
// reports failure. Removed in the next commit on this branch.
describe('CI gate proof', () => {
  it('fails on purpose', () => {
    expect('worker suite is wired to CI').toBe('it is not');
  });
});
