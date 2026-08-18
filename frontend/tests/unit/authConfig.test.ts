/**
 * Auth0 configuration (#77).
 */
import { describe, it, expect } from 'vitest';
import { readAuthConfig } from '@/auth/config';

const full = {
  VITE_AUTH0_DOMAIN: 'mazza.us.auth0.com',
  VITE_AUTH0_CLIENT_ID: 'abc123',
  VITE_AUTH0_AUDIENCE: 'https://api.mazza.finance',
} as unknown as ImportMetaEnv;

describe('readAuthConfig', () => {
  it('reads all three values', () => {
    expect(readAuthConfig(full)).toEqual({
      domain: 'mazza.us.auth0.com',
      clientId: 'abc123',
      audience: 'https://api.mazza.finance',
    });
  });

  it('returns null when nothing is configured', () => {
    expect(readAuthConfig({} as ImportMetaEnv)).toBeNull();
  });

  it.each([
    ['domain', 'VITE_AUTH0_DOMAIN'],
    ['client id', 'VITE_AUTH0_CLIENT_ID'],
    ['audience', 'VITE_AUTH0_AUDIENCE'],
  ])('returns null when the %s is missing', (_label, key) => {
    // All three or none. A partial configuration renders a sign-in button
    // that cannot work, which is worse than saying auth is not configured.
    const partial = { ...full, [key]: undefined } as unknown as ImportMetaEnv;
    expect(readAuthConfig(partial)).toBeNull();
  });

  it('treats the audience as required, because without it Auth0 issues an opaque token', () => {
    // Not a JWT. The Worker's verifier would reject every request with no
    // useful signal about why.
    const noAudience = { ...full, VITE_AUTH0_AUDIENCE: '' } as unknown as ImportMetaEnv;
    expect(readAuthConfig(noAudience)).toBeNull();
  });
});
