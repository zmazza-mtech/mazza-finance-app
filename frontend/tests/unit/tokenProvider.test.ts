/**
 * The bridge between Auth0's React context and the plain-function API client
 * (#77).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  currentToken,
  notifyUnauthorized,
  resetAuthBridge,
  setTokenGetter,
  setUnauthorizedHandler,
} from '@/auth/tokenProvider';

beforeEach(() => {
  resetAuthBridge();
});

describe('currentToken', () => {
  it('returns null before a provider has registered', async () => {
    // The app renders before Auth0 finishes initialising. A null here means
    // the request collects a 401 and the app signs in; an exception would
    // mean a blank screen.
    expect(await currentToken()).toBeNull();
  });

  it('returns whatever the registered getter returns', async () => {
    setTokenGetter(async () => 'a.b.c');
    expect(await currentToken()).toBe('a.b.c');
  });

  it('asks the getter each time, so a refreshed token is used', async () => {
    // Auth0 refreshes silently. Caching the first token here would keep using
    // it after expiry and turn a working session into a wall of 401s.
    let issued = 0;
    setTokenGetter(async () => `token-${++issued}`);

    expect(await currentToken()).toBe('token-1');
    expect(await currentToken()).toBe('token-2');
  });

  it('returns null rather than throwing when the session has gone', async () => {
    // getAccessTokenSilently rejects when there is no session. A rejection
    // here would surface as a network error on every screen at once, which
    // reads as "the app is broken" instead of "you are signed out".
    setTokenGetter(async () => {
      throw new Error('login_required');
    });
    expect(await currentToken()).toBeNull();
  });
});

describe('the unauthorized handler', () => {
  it('does nothing before one is registered', () => {
    expect(() => notifyUnauthorized()).not.toThrow();
  });

  it('calls the registered handler', () => {
    let called = 0;
    setUnauthorizedHandler(() => { called++; });
    notifyUnauthorized();
    expect(called).toBe(1);
  });
});
