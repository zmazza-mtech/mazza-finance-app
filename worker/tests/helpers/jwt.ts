/**
 * A fixed RS256 keypair for the auth tests.
 *
 * Fixed rather than generated per run so the public half can live in
 * `vitest.config.ts` as an ordinary `AUTH_JWKS` binding. That is what lets the
 * middleware be configured the way production configures it, instead of
 * carrying a test-only setter in the security-critical path.
 *
 * **This key is public and worthless.** It signs nothing but test tokens, it
 * is committed on purpose, and it is not the shape of anything real.
 */

/** The private half. Test-only; see above. */
const PRIVATE_JWK: JsonWebKey = {
  "alg": "RS256",
  "kty": "RSA",
  "n": "7sKovH73ctKr3_2veNc5Ks8VylR3OHj8f2vu83Nx7iyDPqGShYFrgPDDce1MIw0vXN9nYsXGvo1-Ds0Y0MiSXDfsOleRaWmGb-OOb7EhWgQPAWWhRvebmmVOVDXISGLUYTxCt_KG71dSpOz54lWJ9e2q24zRBWdSAno3YPzCy86JgWzoJz_ebZbnufCoC8-ZIcjr2N7aVbQXAn-ADBSuqcpVjRzmXq-B1U0hXhoHY9dvrjSma4nIs568EhCu6PjzOsGJ3rHc7QaYOxpvXotveEjRg828wmUjfhEChWw56EO0MT-0qGvf_qcryak8UDcUKQexaK9017CFIHNSrrX_lw",
  "e": "AQAB",
  "d": "FM3cYxRTHmux80IJHKfwQMUrmmYyvzZ3lejDOO5Zwo2ZYAc3G6_zvJf-B7rMFA_NjTOgMBCYqTjt_38qhuK7MhLjYBAKSRubTbuPyTavd8b7wbznySXBJrpmEVtgWMJXzCMykxGsZUWAG4PUoD6g109-wEOsYOKoWDPrCGXt2VE6PDXa6SEqxfJVHb9gWj2iTMAuV5f8a3OabyoSbdOCSHxWtrPxgf9fXetjsP8-ySTNcAxWx12iEQ6W8F0Pf3DA1d0VIvUGfeMfaWxIYglLRqfPgmBwJqEYiargG51Y72puMwHKOKTc7evZzMpnjJA31ISJg3sliC4k-MLpQBF60Q",
  "p": "_SuY8Z1rPETCOh9jEKg2D-g3kX-K_aquIrkReMLifyfDt9qqHHAYJ4hsCoxqtWWKQUgjYkt9St9lkCNZA7-_efYMG1qmwJ_9FlxNdmppN8jp5DJP8axWfcorxNevzl3mGj_RZOR7iFQEX_foAPYXwEwKweVare38Ene0RqKgI7E",
  "q": "8W3Uile1H10esGyl1vmIhXbfjd5M2HT1JfI2nWFcreIRaTjXPiIbHQFI7qJkcSes45WqB_Rdv5Xs6p4i1xgWmzMBMaKh5cT_DG_WpFh_2k6aHgR0MtGuTP7PTo63Qy6VNRn616tpyGaG7LISzoHI4NeR0EnOtpSK_vr4HV_zkcc",
  "dp": "hMCgsUlHWtH_OrUMoEZkGtE8minT-xHNv91lYPpoBB8YzMZ3XvQUZl5tsNZSeg3lgjfOfhNxfppHyl4Oph2czNoNHSbau7To5BnAcLB5vcu3gXY0X1hr_gfODai_wimQqAEAzrPUZvcPWDdJS3-_kpENLwESHJPnEtP8DvHloPE",
  "dq": "SDI90rjzstNX8A4tcaHhT3gC1hvaAwjGnnhWGK4a1uy5pCuZQj1UulG-C46IVsY0j0IcPJC40Cf3Vxm-9W-AoxyXiM5Hd7x3QLLZDwBgC1piAAP485F8fA3e1HEdIHv3po-EUaYy1fjC9Fk0AokRFxufwRexNywofKN0OuSMo9U",
  "qi": "ftIzRt29WpsoUL-Ky10MUxo2zGOUKEhZUqKx0lW_1KdxDvMBUN2aro_TDSfrbjIsCscGqq8hLgw_CyTRYVQJiwSRkOHd3VgtcEaRcc_J6-66mioPONGcE0jvJqn7uyQdFImxL3t2d1JN-2wBEwa4zfW_LM_pJI7vWf1VngjzTl0"
};

/** The public half, as it appears in `AUTH_JWKS`. */
export const TEST_JWKS = { keys: [{
  "alg": "RS256",
  "kty": "RSA",
  "n": "7sKovH73ctKr3_2veNc5Ks8VylR3OHj8f2vu83Nx7iyDPqGShYFrgPDDce1MIw0vXN9nYsXGvo1-Ds0Y0MiSXDfsOleRaWmGb-OOb7EhWgQPAWWhRvebmmVOVDXISGLUYTxCt_KG71dSpOz54lWJ9e2q24zRBWdSAno3YPzCy86JgWzoJz_ebZbnufCoC8-ZIcjr2N7aVbQXAn-ADBSuqcpVjRzmXq-B1U0hXhoHY9dvrjSma4nIs568EhCu6PjzOsGJ3rHc7QaYOxpvXotveEjRg828wmUjfhEChWw56EO0MT-0qGvf_qcryak8UDcUKQexaK9017CFIHNSrrX_lw",
  "e": "AQAB",
  "kid": "test-key-1",
  "use": "sig"
}] };

export const TEST_KID = 'test-key-1';

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlJson(value: unknown): string {
  return b64url(new TextEncoder().encode(JSON.stringify(value)));
}

let cachedKey: CryptoKey | null = null;

async function privateKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  cachedKey = await crypto.subtle.importKey(
    'jwk',
    PRIVATE_JWK,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return cachedKey;
}

export interface ClaimOverrides {
  sub?: string;
  email?: string;
  iss?: string;
  /** An array where the provider issues one — Auth0 does. */
  aud?: string | string[];
  exp?: number;
  nbf?: number;
  iat?: number;
  /**
   * Any further claim, by name.
   *
   * Namespaced custom claims are the normal way providers carry anything
   * beyond the standard set — Auth0 requires the namespace — so they belong
   * in the type rather than being cast around at each call site.
   */
  [claim: string]: unknown;
}

/** Signs a real JWT with the fixed key — real RS256, real signature. */
export async function signJwt(
  claims: ClaimOverrides = {},
  headerOverrides: Record<string, unknown> = {},
  key?: CryptoKey,
): Promise<string> {
  const nowSec = Math.floor(Date.parse('2026-08-18T12:00:00.000Z') / 1000);

  const header = { alg: 'RS256', typ: 'JWT', kid: TEST_KID, ...headerOverrides };
  const payload = {
    sub: 'user_abc123',
    email: 'mrs@example.com',
    iss: 'https://issuer.example.com',
    aud: 'mazza-finance',
    iat: nowSec,
    nbf: nowSec,
    exp: nowSec + 3600,
    ...claims,
  };

  const signingInput = `${b64urlJson(header)}.${b64urlJson(payload)}`;
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key ?? (await privateKey()),
    new TextEncoder().encode(signingInput),
  );

  return `${signingInput}.${b64url(new Uint8Array(signature))}`;
}

/**
 * A second keypair, generated per run, for the "signed by the wrong key" case.
 * Only its private half is ever used — it is deliberately not in the JWKS.
 */
export async function foreignSigningKey(): Promise<CryptoKey> {
  const pair = (await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
  return pair.privateKey;
}
