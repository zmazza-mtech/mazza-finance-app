/**
 * The security headers Caddy enforced, now set at the Worker (#72).
 *
 * Caddy is being retired (#82), and these headers were only ever in the
 * Caddyfile. Without this the replatform quietly drops the CSP, the
 * clickjacking defence and the referrer policy — a security regression that
 * nothing in the app would look different for.
 */
import { describe, it, expect } from 'vitest';
import { SELF } from 'cloudflare:test';

const CADDY_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; frame-src 'none'; object-src 'none'; frame-ancestors 'none'";

describe('security headers', () => {
  it('carries the CSP Caddy enforced, verbatim', async () => {
    const res = await SELF.fetch('https://example.com/api/v1/health');
    expect(res.headers.get('Content-Security-Policy')).toBe(CADDY_CSP);
  });

  it('denies framing two ways, as Caddy did', async () => {
    const res = await SELF.fetch('https://example.com/api/v1/health');
    // frame-ancestors 'none' is the modern control; X-Frame-Options is what
    // an older browser reads. Caddy set both, so both are carried.
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
  });

  it('refuses MIME sniffing', async () => {
    const res = await SELF.fetch('https://example.com/api/v1/health');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('sets the referrer and permissions policies', async () => {
    const res = await SELF.fetch('https://example.com/api/v1/health');
    expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(res.headers.get('Permissions-Policy')).toBe(
      'camera=(), microphone=(), geolocation=()',
    );
  });

  it('sets them on an error response too', async () => {
    // A 404 or a 500 is exactly when a header is easiest to lose, because it
    // leaves by a different path than the happy one.
    const res = await SELF.fetch('https://example.com/api/v1/nope');
    expect(res.status).toBe(404);
    expect(res.headers.get('Content-Security-Policy')).toBe(CADDY_CSP);
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
  });

  it('sets no CORS headers at all', async () => {
    // One origin serves the SPA and the API, so there is no cross-origin
    // request to permit. An allow-origin header here would be inventing one.
    const res = await SELF.fetch('https://example.com/api/v1/health');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});

describe('SPA fallback and the API boundary', () => {
  it('answers an unknown /api/v1 route with the envelope, never the shell', async () => {
    const res = await SELF.fetch('https://example.com/api/v1/nope');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ data: null, error: 'Not found' });
  });

  it('answers an unknown /api route with the envelope, whatever the version', async () => {
    const res = await SELF.fetch('https://example.com/api/v2/anything');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ data: null, error: 'Not found' });
  });
});
