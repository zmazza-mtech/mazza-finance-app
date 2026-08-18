/**
 * JWT verification (#76).
 *
 * Provider-agnostic on purpose. Clerk and WorkOS both issue standard RS256
 * tokens verified against a JWKS, and the choice between them is open — Clerk
 * charges $25/mo for production passkeys while WorkOS includes them free — so
 * issuer, audience and keys are configuration rather than assumptions. Picking
 * a provider becomes three secrets, not a rewrite.
 *
 * Verification is done with Web Crypto rather than a library: the algorithm is
 * one `crypto.subtle.verify` call, and a dependency here would be a
 * dependency in the security-critical path for no gain.
 */

export interface VerifiedClaims {
  /** The provider's opaque subject identifier. Stored as `users.auth_subject`. */
  sub: string;
  /**
   * Empty when the provider does not put it in the token.
   *
   * WorkOS omits it from the default claim set and adds it through a JWT
   * template. Identity is the `sub` claim regardless — the email is a display
   * attribute, never the thing a user is looked up by — so an absent one is
   * recoverable rather than fatal.
   */
  email: string;
  exp: number;
}

export interface VerifyOptions {
  issuer: string;
  /**
   * Enforced when set, and **only safe to leave unset with a client-scoped
   * JWKS.**
   *
   * Not every provider issues `aud`. WorkOS access tokens carry
   * `sub`, `sid`, `iss`, `exp`, `iat` and organization claims, and no
   * audience — instead the key set itself is per client
   * (`/sso/jwks/<clientId>`), so a token minted for another application is
   * signed by a key this one never fetches. The binding is in the key rather
   * than in a claim.
   *
   * Requiring `aud` unconditionally would reject every real WorkOS token;
   * ignoring it unconditionally would drop a real check for providers that do
   * issue one. Hence: enforced when configured.
   */
  audience?: string;
  jwks: { keys: JsonWebKey[] };
  /** Injected so expiry and not-before are testable without waiting. */
  now?: Date;
}

/**
 * Tolerated clock difference between this Worker and the issuer.
 *
 * Two machines' clocks differ. Rejecting on a one-second drift produces
 * sign-in failures nobody can reproduce; 60s is the usual allowance and is
 * far shorter than any token lifetime.
 */
const CLOCK_SKEW_SECONDS = 60;

class JwtError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JwtError';
  }
}

function b64urlDecode(segment: string): Uint8Array {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function decodeJson(segment: string): Record<string, unknown> {
  try {
    return JSON.parse(new TextDecoder().decode(b64urlDecode(segment)));
  } catch {
    throw new JwtError('Malformed token');
  }
}

/**
 * Verifies a token and returns its claims, or throws.
 *
 * Throws rather than returning null: every failure here is a request that
 * must not proceed, and a nullable return invites a caller to treat "could
 * not verify" as "no user" and carry on.
 */
export async function verifyJwt(
  token: string,
  options: VerifyOptions,
): Promise<VerifiedClaims> {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[0] || !parts[1]) {
    throw new JwtError('Malformed token');
  }
  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];

  const header = decodeJson(headerB64);

  /*
   * The algorithm is checked before anything else and against a fixed value.
   *
   * Two classic breaks live here. `alg: none` asks the verifier to accept an
   * unsigned token. `alg: HS256` on an RS256 key asks it to use the public
   * key as a shared secret — and a public key is not secret. Reading the
   * algorithm from the token and trusting it is what makes both work.
   */
  if (header['alg'] !== 'RS256') {
    throw new JwtError(`Unsupported alg: ${String(header['alg'])}`);
  }

  const kid = header['kid'];
  const jwk = options.jwks.keys.find((k) => (k as { kid?: string }).kid === kid);
  if (!jwk) {
    throw new JwtError('No signing key matches the token kid');
  }

  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );

  const signatureValid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    b64urlDecode(signatureB64 ?? ''),
    new TextEncoder().encode(`${headerB64}.${payloadB64}`),
  );

  if (!signatureValid) {
    throw new JwtError('Invalid signature');
  }

  // Claims are only read after the signature holds. Reading them first would
  // mean acting on values nobody has vouched for.
  const payload = decodeJson(payloadB64);

  if (payload['iss'] !== options.issuer) {
    throw new JwtError('Unexpected issuer');
  }

  if (options.audience !== undefined) {
    const aud = payload['aud'];
    const audienceMatches = Array.isArray(aud)
      ? aud.includes(options.audience)
      : aud === options.audience;
    if (!audienceMatches) {
      throw new JwtError('Unexpected audience');
    }
  }

  const nowSec = Math.floor((options.now ?? new Date()).getTime() / 1000);

  const exp = payload['exp'];
  if (typeof exp !== 'number' || nowSec > exp + CLOCK_SKEW_SECONDS) {
    throw new JwtError('Token expired');
  }

  const nbf = payload['nbf'];
  if (typeof nbf === 'number' && nowSec + CLOCK_SKEW_SECONDS < nbf) {
    throw new JwtError('Token not yet valid');
  }

  const sub = payload['sub'];
  if (typeof sub !== 'string' || sub.length === 0) {
    throw new JwtError('Token carries no subject');
  }

  const email = payload['email'];

  return { sub, email: typeof email === 'string' ? email : '', exp };
}
