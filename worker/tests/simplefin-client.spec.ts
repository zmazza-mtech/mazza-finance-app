/**
 * The SimpleFIN client, ported to the Worker (#68, #73).
 *
 * What is tested here is everything decided *before* the network call and
 * everything decided *from* its status code — because the call itself spends
 * one of 24 daily polls, and exceeding 24 permanently disables the token. A
 * test suite that made real calls would be the fastest way to lose the
 * account.
 *
 * So the request construction and the status mapping are pure functions with
 * their own tests, and `fetchAccounts` is the thin shell around them.
 */
import { describe, it, expect } from 'vitest';
import {
  parseAccessUrl,
  buildAccountsRequest,
  errorForStatus,
  SimpleFINApiError,
} from '../src/lib/simplefin-client.js';

const ACCESS_URL = 'https://user123:secretpass@bridge.simplefin.org/simplefin';

describe('parseAccessUrl', () => {
  it('splits credentials from the base URL', () => {
    expect(parseAccessUrl(ACCESS_URL)).toEqual({
      baseUrl: 'https://bridge.simplefin.org/simplefin',
      username: 'user123',
      password: 'secretpass',
    });
  });

  it('decodes percent-encoded credentials', () => {
    // A generated SimpleFIN password routinely contains characters that have
    // to be encoded in the userinfo, and sending the encoded form fails auth.
    const url = 'https://us%40er:p%3Ass%2Fword@bridge.simplefin.org/simplefin';
    expect(parseAccessUrl(url)).toMatchObject({
      username: 'us@er',
      password: 'p:ss/word',
    });
  });

  it('strips a trailing slash so the path is not doubled', () => {
    expect(parseAccessUrl('https://u:p@example.com/simplefin/').baseUrl).toBe(
      'https://example.com/simplefin',
    );
  });

  it('rejects a value that is not a URL rather than building a broken request', () => {
    expect(() => parseAccessUrl('not-a-url')).toThrow();
  });
});

describe('buildAccountsRequest', () => {
  it('targets /accounts with no query when nothing is filtered', () => {
    const { url } = buildAccountsRequest(ACCESS_URL, {});
    expect(url).toBe('https://bridge.simplefin.org/simplefin/accounts');
  });

  it('sends dates as unix seconds, which is what SimpleFIN reads', () => {
    const { url } = buildAccountsRequest(ACCESS_URL, {
      startDate: new Date('2026-01-01T00:00:00Z'),
      endDate: new Date('2026-01-31T00:00:00Z'),
    });
    const params = new URL(url).searchParams;
    expect(params.get('start-date')).toBe('1767225600');
    expect(params.get('end-date')).toBe('1769817600');
  });

  it('asks for pending transactions when requested', () => {
    const { url } = buildAccountsRequest(ACCESS_URL, { pending: true });
    expect(new URL(url).searchParams.get('pending')).toBe('1');
  });

  it('asks for balances only when requested', () => {
    const { url } = buildAccountsRequest(ACCESS_URL, { balancesOnly: true });
    expect(new URL(url).searchParams.get('balances-only')).toBe('1');
  });

  it('authenticates with Basic, base64 of user:pass', () => {
    const { headers } = buildAccountsRequest(ACCESS_URL, {});
    expect(headers['Authorization']).toBe(`Basic ${btoa('user123:secretpass')}`);
    expect(headers['Accept']).toBe('application/json');
  });

  it('keeps the credentials out of the URL it builds', () => {
    // They belong in the header. A credential in a URL reaches logs, proxies
    // and error messages that a header does not.
    const { url } = buildAccountsRequest(ACCESS_URL, {});
    expect(url).not.toContain('secretpass');
    expect(url).not.toContain('user123');
  });
});

describe('errorForStatus', () => {
  it('names an expired subscription for 402', () => {
    const err = errorForStatus(402);
    expect(err).toBeInstanceOf(SimpleFINApiError);
    expect(err!.status).toBe(402);
    expect(err!.detail).toMatch(/subscription/i);
  });

  it('tells the user where to re-authorize on 403', () => {
    // 403 is the disabled-token case, which is the expensive one. The message
    // has to say what to do, because the fix is outside the app.
    const err = errorForStatus(403);
    expect(err!.detail).toMatch(/bridge\.simplefin\.org/);
  });

  it('reports any other failure by status alone, never a body', () => {
    // A SimpleFIN error body can carry account detail. The status is enough
    // to act on and cannot leak.
    const err = errorForStatus(500);
    expect(err!.detail).toBe('Unexpected HTTP 500');
  });

  it('returns null for a success, so the caller has one branch to read', () => {
    expect(errorForStatus(200)).toBeNull();
  });
});
