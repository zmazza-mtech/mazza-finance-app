/**
 * JWT verification (#76).
 *
 * Exercised against real RS256 keys and real signatures — `tests/helpers/jwt.ts`
 * generates an actual keypair with Web Crypto and signs actual tokens. A
 * verifier tested against a stub agrees with the stub; this one has to agree
 * with the mathematics.
 *
 * Deliberately provider-agnostic. Clerk and WorkOS both issue standard RS256
 * with a JWKS, and the choice between them is open (#76), so issuer, audience
 * and keys are configuration rather than assumptions.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { verifyJwt } from '../src/auth/jwt.js';
import { signJwt, foreignSigningKey, TEST_JWKS, TEST_KID } from './helpers/jwt.js';

const NOW = new Date('2026-08-18T12:00:00.000Z');
const CONFIG = { issuer: 'https://issuer.example.com', audience: 'mazza-finance' };

let foreignKey: CryptoKey;

beforeAll(async () => {
  foreignKey = await foreignSigningKey();
});

async function verify(token: string, at: Date = NOW) {
  return verifyJwt(token, { ...CONFIG, jwks: TEST_JWKS, now: at });
}

describe('a valid token', () => {
  it('returns the subject and email', async () => {
    const claims = await verify(await signJwt());
    expect(claims).toMatchObject({ sub: 'user_abc123', email: 'mrs@example.com' });
  });
});

describe('signature', () => {
  it('rejects a token signed by a different key', async () => {
    // The whole point. Anyone can write the claims; only the issuer can sign.
    //
    // Signed with the wrong private key but claiming the *right* kid, so the
    // check under test is the signature rather than the key lookup — an
    // attacker with a stolen kid is the case that matters.
    const token = await signJwt({}, { kid: TEST_KID }, foreignKey);
    await expect(verify(token)).rejects.toThrow(/signature/i);
  });

  it('rejects a token whose payload was edited after signing', async () => {
    const token = await signJwt();
    const [header, , signature] = token.split('.');
    const tampered = `${header}.${btoa(JSON.stringify({ sub: 'someone_else' }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')}.${signature}`;

    await expect(verify(tampered)).rejects.toThrow();
  });

  it('rejects alg:none, rather than trusting an unsigned token', async () => {
    // The classic JWT break: claim there is no algorithm and hope the
    // verifier agrees. It must not.
    const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const payload = btoa(JSON.stringify({ sub: 'attacker', iss: CONFIG.issuer }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    await expect(verify(`${header}.${payload}.`)).rejects.toThrow(/alg/i);
  });

  it('rejects an HS256 token, so a public key cannot be used as a shared secret', async () => {
    // The other classic: downgrade RS256 to HS256 and sign with the public
    // key, which is not secret.
    const token = await signJwt({}, { alg: 'HS256' });
    await expect(verify(token)).rejects.toThrow(/alg/i);
  });

  it('rejects a token whose kid matches no key', async () => {
    const token = await signJwt({}, { kid: 'unknown-key' });
    await expect(verify(token)).rejects.toThrow(/key/i);
  });
});

describe('time', () => {
  it('rejects an expired token', async () => {
    // Past expiry *and* past the 60s skew allowance — a second past exp is
    // deliberately still accepted, which the skew test below pins.
    const token = await signJwt();
    const later = new Date(NOW.getTime() + (3600 + 61) * 1000);
    await expect(verify(token, later)).rejects.toThrow(/expired/i);
  });

  it('accepts a token one second before it expires', async () => {
    const token = await signJwt();
    const justBefore = new Date(NOW.getTime() + 3599 * 1000);
    await expect(verify(token, justBefore)).resolves.toBeTruthy();
  });

  it('rejects a token that is not valid yet', async () => {
    const nowSec = Math.floor(NOW.getTime() / 1000);
    const token = await signJwt({ nbf: nowSec + 600 });
    await expect(verify(token)).rejects.toThrow(/not yet valid/i);
  });

  it('allows a little clock skew rather than failing on a second', async () => {
    // Two machines' clocks differ. Rejecting on a one-second drift produces
    // sign-in failures nobody can reproduce.
    const token = await signJwt();
    const barelyPast = new Date(NOW.getTime() + (3600 + 20) * 1000);
    await expect(verify(token, barelyPast)).resolves.toBeTruthy();
  });
});

describe('Auth0 token shape', () => {
  // Verified against Auth0's access-token documentation, 2026-08-18: iss ends
  // in a slash, aud is an array, and the token carries "no information about
  // the user except for the user ID".
  const AUTH0_ISS = 'https://mazza.us.auth0.com/';
  const AUTH0_AUD = 'https://api.mazza.finance';
  const config = { issuer: AUTH0_ISS, audience: AUTH0_AUD, jwks: TEST_JWKS, now: NOW };

  it('accepts an aud array containing the API identifier', async () => {
    // Auth0 issues aud as an array when the token also grants /userinfo.
    const token = await signJwt({
      iss: AUTH0_ISS,
      aud: [AUTH0_AUD, `${AUTH0_ISS}userinfo`] as unknown as string,
    });
    await expect(verifyJwt(token, config)).resolves.toMatchObject({ sub: 'user_abc123' });
  });

  it('rejects an aud array that does not contain it', async () => {
    const token = await signJwt({
      iss: AUTH0_ISS,
      aud: ['https://someone-elses-api', `${AUTH0_ISS}userinfo`] as unknown as string,
    });
    await expect(verifyJwt(token, config)).rejects.toThrow(/audience/i);
  });

  it('reads the email from a namespaced custom claim', async () => {
    // Auth0 requires custom claims to be namespaced, so a plain `email`
    // lookup finds nothing and every user provisions blank.
    const token = await signJwt({
      iss: AUTH0_ISS,
      aud: AUTH0_AUD,
      email: undefined as unknown as string,
      ['https://mazza.finance/email' as 'email']: 'mrs@example.com',
    });

    const claims = await verifyJwt(token, {
      ...config,
      emailClaim: 'https://mazza.finance/email',
    });
    expect(claims.email).toBe('mrs@example.com');
  });
});

describe('a provider that issues no audience claim', () => {
  // WorkOS access tokens carry sub, sid, iss, exp, iat and organization
  // claims — and no aud. Requiring one unconditionally would reject every
  // real token; the client binding lives in the per-client key set instead.
  const noAudience = { issuer: CONFIG.issuer, jwks: TEST_JWKS, now: NOW };

  it('accepts a token with no aud when no audience is configured', async () => {
    const token = await signJwt({ aud: undefined as unknown as string });
    await expect(verifyJwt(token, noAudience)).resolves.toMatchObject({ sub: 'user_abc123' });
  });

  it('still enforces the issuer, which is the check that remains', async () => {
    const token = await signJwt({ iss: 'https://evil.example.com' });
    await expect(verifyJwt(token, noAudience)).rejects.toThrow(/issuer/i);
  });

  it('does not silently ignore a configured audience', async () => {
    // The dangerous version of this change would be to drop the check
    // wherever the claim is missing. Configured means enforced.
    const token = await signJwt({ aud: undefined as unknown as string });
    await expect(verify(token)).rejects.toThrow(/audience/i);
  });

  it('carries an empty email rather than failing when the provider omits it', async () => {
    // WorkOS adds email through a JWT template. Identity is the sub claim, so
    // an absent email is a display gap, not an authentication failure.
    const token = await signJwt({ email: undefined as unknown as string });
    const claims = await verifyJwt(token, noAudience);
    expect(claims.sub).toBe('user_abc123');
    expect(claims.email).toBe('');
  });
});

describe('issuer and audience', () => {
  it('rejects a token from a different issuer', async () => {
    const token = await signJwt({ iss: 'https://evil.example.com' });
    await expect(verify(token)).rejects.toThrow(/issuer/i);
  });

  it('rejects a token minted for a different audience', async () => {
    // A valid token for someone else's app is not a token for this one.
    const token = await signJwt({ aud: 'some-other-app' });
    await expect(verify(token)).rejects.toThrow(/audience/i);
  });
});

describe('malformed input', () => {
  it.each([
    ['empty', ''],
    ['one segment', 'abc'],
    ['two segments', 'abc.def'],
    ['not base64', '!!!.???.###'],
  ])('rejects %s rather than throwing something unreadable', async (_label, token) => {
    await expect(verify(token)).rejects.toThrow();
  });

  it('rejects a token with no subject', async () => {
    // Without a sub there is nobody to provision or scope to.
    const token = await signJwt({ sub: '' });
    await expect(verify(token)).rejects.toThrow(/subject/i);
  });
});
