import { describe, it, expect } from 'vitest';
import {
  matchInstancesToActuals,
  AMOUNT_TOLERANCE_FLOOR,
  AMOUNT_TOLERANCE_RATE,
  type MatchableActual,
  type MatchableInstance,
} from '../../src/services/reconciliation';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function instance(overrides: Partial<MatchableInstance> = {}): MatchableInstance {
  return {
    recurringId: 'rec_001',
    accountId: 'acct_001',
    date: '2026-01-15',
    amount: '-100.00',
    ...overrides,
  };
}

function actual(overrides: Partial<MatchableActual> = {}): MatchableActual {
  return {
    id: 'tx_001',
    accountId: 'acct_001',
    date: '2026-01-15',
    amount: '-100.00',
    ...overrides,
  };
}

/** The pairing as `[recurringId, actualId]`, for terse assertions. */
function pairs(result: ReturnType<typeof matchInstancesToActuals>): [string, string][] {
  return result.matches.map((m) => [m.instance.recurringId, m.actual.id]);
}

// ---------------------------------------------------------------------------
// The rule
// ---------------------------------------------------------------------------

describe('matchInstancesToActuals — the matching rule', () => {
  it('matches an exact same-day, same-amount pair', () => {
    const result = matchInstancesToActuals([instance()], [actual()]);

    expect(pairs(result)).toEqual([['rec_001', 'tx_001']]);
    expect(result.unmatchedInstances).toEqual([]);
    expect(result.unmatchedActuals).toEqual([]);
  });

  it('matches an amount that drifted within tolerance', () => {
    // A $15.99 subscription going to $17.99 is 12.5% but only $2.00 — the
    // floor is what carries this case, not the rate.
    const result = matchInstancesToActuals(
      [instance({ amount: '-15.99' })],
      [actual({ amount: '-17.99' })],
    );

    expect(pairs(result)).toEqual([['rec_001', 'tx_001']]);
  });

  it('matches a large amount that drifted within the rate', () => {
    // A mortgage escrow adjustment: $68.51 is far past the floor but only
    // 3.8% of the payment.
    const result = matchInstancesToActuals(
      [instance({ amount: '-1819.57' })],
      [actual({ amount: '-1888.08' })],
    );

    expect(pairs(result)).toEqual([['rec_001', 'tx_001']]);
  });

  it('does not match an amount beyond tolerance', () => {
    const result = matchInstancesToActuals(
      [instance({ amount: '-100.00' })],
      [actual({ amount: '-130.00' })],
    );

    // Both survive, so #12 has a discrepancy to surface rather than a silent
    // suppression.
    expect(result.matches).toEqual([]);
    expect(result.unmatchedInstances).toHaveLength(1);
    expect(result.unmatchedActuals).toHaveLength(1);
  });

  it('takes the greater of the floor and the rate', () => {
    expect(AMOUNT_TOLERANCE_FLOOR).toBe('5.00');
    expect(AMOUNT_TOLERANCE_RATE).toBe('0.10');

    // 10% of 20.00 is 2.00, below the 5.00 floor, so 4.50 is inside.
    expect(
      matchInstancesToActuals([instance({ amount: '-20.00' })], [actual({ amount: '-24.50' })])
        .matches,
    ).toHaveLength(1);

    // 10% of 500.00 is 50.00, above the floor, so 40.00 is inside.
    expect(
      matchInstancesToActuals([instance({ amount: '-500.00' })], [actual({ amount: '-540.00' })])
        .matches,
    ).toHaveLength(1);
  });

  it('treats the tolerance as inclusive at the boundary', () => {
    // Exactly 5.00 off a 20.00 instance.
    expect(
      matchInstancesToActuals([instance({ amount: '-20.00' })], [actual({ amount: '-25.00' })])
        .matches,
    ).toHaveLength(1);

    expect(
      matchInstancesToActuals([instance({ amount: '-20.00' })], [actual({ amount: '-25.01' })])
        .matches,
    ).toHaveLength(0);
  });

  it('does not match an inflow against an outflow of the same magnitude', () => {
    // A +100 deposit is 200 away from a -100 bill, not 0.
    const result = matchInstancesToActuals(
      [instance({ amount: '-100.00' })],
      [actual({ amount: '100.00' })],
    );

    expect(result.matches).toEqual([]);
  });
});

describe('matchInstancesToActuals — the date window', () => {
  it('matches one day early and one day late', () => {
    for (const date of ['2026-01-14', '2026-01-16']) {
      const result = matchInstancesToActuals([instance()], [actual({ date })]);
      expect(pairs(result), `actual dated ${date}`).toEqual([['rec_001', 'tx_001']]);
    }
  });

  it('does not match two days out on either side', () => {
    for (const date of ['2026-01-13', '2026-01-17']) {
      const result = matchInstancesToActuals([instance()], [actual({ date })]);
      expect(result.matches, `actual dated ${date}`).toEqual([]);
    }
  });

  it('spans a month boundary', () => {
    const result = matchInstancesToActuals(
      [instance({ date: '2026-02-01' })],
      [actual({ date: '2026-01-31' })],
    );

    expect(pairs(result)).toEqual([['rec_001', 'tx_001']]);
  });

  it('spans a leap day', () => {
    const result = matchInstancesToActuals(
      [instance({ date: '2028-03-01' })],
      [actual({ date: '2028-02-29' })],
    );

    expect(pairs(result)).toEqual([['rec_001', 'tx_001']]);
  });
});

describe('matchInstancesToActuals — account scoping', () => {
  it('never matches across accounts', () => {
    const result = matchInstancesToActuals(
      [instance({ accountId: 'acct_001' })],
      [actual({ accountId: 'acct_002' })],
    );

    expect(result.matches).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// One-to-one consumption
// ---------------------------------------------------------------------------

describe('matchInstancesToActuals — one-to-one', () => {
  it('consumes each actual at most once', () => {
    const result = matchInstancesToActuals(
      [instance({ recurringId: 'rec_a' }), instance({ recurringId: 'rec_b' })],
      [actual({ id: 'tx_1' })],
    );

    expect(result.matches).toHaveLength(1);
    expect(result.unmatchedInstances).toHaveLength(1);
  });

  it('consumes each instance at most once', () => {
    const result = matchInstancesToActuals(
      [instance()],
      [actual({ id: 'tx_1' }), actual({ id: 'tx_2' })],
    );

    expect(result.matches).toHaveLength(1);
    expect(result.unmatchedActuals).toHaveLength(1);
  });

  it('gives the closest amount to the instance when two candidates compete', () => {
    const result = matchInstancesToActuals(
      [instance({ amount: '-100.00' })],
      [
        actual({ id: 'tx_far', amount: '-104.00' }),
        actual({ id: 'tx_near', amount: '-100.50' }),
      ],
    );

    expect(pairs(result)).toEqual([['rec_001', 'tx_near']]);
    expect(result.unmatchedActuals.map((a) => a.id)).toEqual(['tx_far']);
  });

  it('breaks an amount tie on date proximity', () => {
    const result = matchInstancesToActuals(
      [instance({ date: '2026-01-15', amount: '-100.00' })],
      [
        actual({ id: 'tx_next_day', date: '2026-01-16', amount: '-101.00' }),
        actual({ id: 'tx_same_day', date: '2026-01-15', amount: '-101.00' }),
      ],
    );

    expect(pairs(result)).toEqual([['rec_001', 'tx_same_day']]);
  });

  it('pairs two series on one day without stealing each other’s actual', () => {
    const result = matchInstancesToActuals(
      [
        instance({ recurringId: 'rent', amount: '-1200.00' }),
        instance({ recurringId: 'gym', amount: '-60.00' }),
      ],
      [
        actual({ id: 'tx_gym', amount: '-60.00' }),
        actual({ id: 'tx_rent', amount: '-1200.00' }),
      ],
    );

    expect(pairs(result).sort()).toEqual([
      ['gym', 'tx_gym'],
      ['rent', 'tx_rent'],
    ]);
  });
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

describe('matchInstancesToActuals — determinism', () => {
  const instances = [
    instance({ recurringId: 'rec_a', amount: '-100.00', date: '2026-01-15' }),
    instance({ recurringId: 'rec_b', amount: '-102.00', date: '2026-01-15' }),
    instance({ recurringId: 'rec_c', amount: '-500.00', date: '2026-01-20' }),
  ];
  const actuals = [
    actual({ id: 'tx_1', amount: '-101.00', date: '2026-01-15' }),
    actual({ id: 'tx_2', amount: '-103.00', date: '2026-01-16' }),
    actual({ id: 'tx_3', amount: '-505.00', date: '2026-01-20' }),
  ];

  it('produces the same pairings whatever the input order', () => {
    const forward = pairs(matchInstancesToActuals(instances, actuals)).sort();
    const reversed = pairs(
      matchInstancesToActuals([...instances].reverse(), [...actuals].reverse()),
    ).sort();
    const shuffled = pairs(
      matchInstancesToActuals(
        [instances[1]!, instances[2]!, instances[0]!],
        [actuals[2]!, actuals[0]!, actuals[1]!],
      ),
    ).sort();

    expect(reversed).toEqual(forward);
    expect(shuffled).toEqual(forward);
  });

  it('mutates neither input array', () => {
    const i = [...instances];
    const a = [...actuals];
    matchInstancesToActuals(i, a);

    expect(i).toEqual(instances);
    expect(a).toEqual(actuals);
  });
});

// ---------------------------------------------------------------------------
// Degenerate input
// ---------------------------------------------------------------------------

describe('matchInstancesToActuals — degenerate input', () => {
  it('handles empty sides', () => {
    expect(matchInstancesToActuals([], []).matches).toEqual([]);
    expect(matchInstancesToActuals([instance()], []).unmatchedInstances).toHaveLength(1);
    expect(matchInstancesToActuals([], [actual()]).unmatchedActuals).toHaveLength(1);
  });

  it('matches a zero-amount instance only within the floor', () => {
    expect(
      matchInstancesToActuals([instance({ amount: '0.00' })], [actual({ amount: '-4.00' })])
        .matches,
    ).toHaveLength(1);
    expect(
      matchInstancesToActuals([instance({ amount: '0.00' })], [actual({ amount: '-6.00' })])
        .matches,
    ).toHaveLength(0);
  });
});
