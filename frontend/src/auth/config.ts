/**
 * Auth0 configuration, read once from the build environment.
 *
 * Decision 4 in the replatform spec. The audience is the API identifier
 * registered in Auth0 — without it Auth0 issues an opaque token rather than a
 * JWT, and the Worker's verifier would reject every request with no useful
 * signal about why.
 */
export interface AuthConfig {
  domain: string;
  clientId: string;
  audience: string;
}

export function readAuthConfig(env: ImportMetaEnv = import.meta.env): AuthConfig | null {
  const domain = env.VITE_AUTH0_DOMAIN;
  const clientId = env.VITE_AUTH0_CLIENT_ID;
  const audience = env.VITE_AUTH0_AUDIENCE;

  // All three or none. A partial configuration would render a sign-in button
  // that cannot work, which is worse than saying plainly that auth is not
  // configured.
  if (!domain || !clientId || !audience) return null;

  return { domain, clientId, audience };
}
