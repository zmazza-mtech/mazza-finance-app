/**
 * The security headers Caddy enforced, carried to the Worker (#72).
 *
 * These lived only in the Caddyfile, which #82 deletes. Carrying them over is
 * not optional work: dropping them is a security regression that nothing in
 * the app would look different for, and so would go unnoticed.
 *
 * Values are verbatim from `Caddyfile`, and a test asserts the CSP string
 * character for character rather than checking that some CSP is present.
 */
const HEADERS: Record<string, string> = {
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; frame-src 'none'; object-src 'none'; frame-ancestors 'none'",
  // Redundant with frame-ancestors for a current browser, and the only
  // clickjacking defence an older one reads. Caddy set both.
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

/**
 * Applied to every response, including errors.
 *
 * An error leaves by a different path than a success, which is exactly where
 * a header is easiest to lose — so this runs as middleware over everything
 * rather than being attached at each return.
 *
 * No CORS headers: one origin serves the SPA and the API, so there is no
 * cross-origin request to permit. Adding an allow-origin here would be
 * inventing one.
 */
export function applySecurityHeaders(res: Response): void {
  for (const [name, value] of Object.entries(HEADERS)) {
    res.headers.set(name, value);
  }
}
