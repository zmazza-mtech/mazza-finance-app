import { describe, it, expect } from 'vitest';
import { parseAccessUrl, SimpleFINApiError } from '../../src/lib/simplefin-client';

// ---------------------------------------------------------------------------
// parseAccessUrl
// ---------------------------------------------------------------------------

describe('parseAccessUrl', () => {
  it('extracts username, password, and base URL from a standard Access URL', () => {
    const result = parseAccessUrl(
      'https://myuser:mypass@beta-bridge.simplefin.org/simplefin'
    );
    expect(result.username).toBe('myuser');
    expect(result.password).toBe('mypass');
    expect(result.baseUrl).toBe('https://beta-bridge.simplefin.org/simplefin');
  });

  it('handles URL-encoded credentials', () => {
    const result = parseAccessUrl(
      'https://user%40example.com:p%40ss%3Aword@beta-bridge.simplefin.org/simplefin'
    );
    expect(result.username).toBe('user@example.com');
    expect(result.password).toBe('p@ss:word');
  });

  it('handles credentials with special characters', () => {
    const result = parseAccessUrl(
      'https://abc123:hunter%232@beta-bridge.simplefin.org/simplefin'
    );
    expect(result.username).toBe('abc123');
    expect(result.password).toBe('hunter#2');
  });

  it('strips trailing slash from base URL', () => {
    const result = parseAccessUrl(
      'https://u:p@beta-bridge.simplefin.org/simplefin/'
    );
    expect(result.baseUrl).not.toMatch(/\/$/);
  });

  it('throws on malformed URL', () => {
    expect(() => parseAccessUrl('not-a-url')).toThrow();
  });
});

// ---------------------------------------------------------------------------
// SimpleFINApiError
// ---------------------------------------------------------------------------

describe('SimpleFINApiError', () => {
  it('stores status and detail', () => {
    const err = new SimpleFINApiError(402, 'Payment required');
    expect(err.status).toBe(402);
    expect(err.detail).toBe('Payment required');
    expect(err.name).toBe('SimpleFINApiError');
  });

  it('includes status in message', () => {
    const err = new SimpleFINApiError(403, 'Token revoked');
    expect(err.message).toContain('403');
    expect(err.message).toContain('Token revoked');
  });

  it('is an instance of Error', () => {
    const err = new SimpleFINApiError(500, 'Server error');
    expect(err).toBeInstanceOf(Error);
  });
});
