/** Worker bindings, declared once so routers do not each restate them. */
export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  ENCRYPTION_KEY: string;

  /*
   * Identity provider settings (#76).
   *
   * Optional in the type because they are absent until a provider is chosen
   * and its secrets are set — and the middleware fails closed when they are,
   * so absence refuses requests rather than admitting them.
   *
   * Provider-agnostic on purpose: Clerk and WorkOS both issue RS256 tokens
   * against a JWKS, so choosing between them is these three values.
   */
  AUTH_ISSUER?: string;
  AUTH_AUDIENCE?: string;
  /** Defaults to `${AUTH_ISSUER}/.well-known/jwks.json` when unset. */
  AUTH_JWKS_URL?: string;
  /**
   * A pinned JWKS as JSON, used instead of fetching one.
   *
   * For a deployment that would rather not make an outbound call on a cold
   * isolate. Rotation then costs a redeploy, which is the trade.
   */
  AUTH_JWKS?: string;
}
