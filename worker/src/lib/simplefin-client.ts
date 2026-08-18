/**
 * SimpleFIN client — ported from `backend/src/lib/simplefin-client.ts` (#68).
 *
 * Two changes from the original, both consequences of where it now runs:
 *
 * The access URL is a parameter rather than read from a Docker secret. It
 * comes from the encrypted D1 column (#73), decrypted per request, so this
 * module never knows where it was stored or how.
 *
 * `Buffer` is gone; `btoa` is the Workers equivalent.
 *
 * Everything decided before the network call and everything decided from its
 * status is a pure function with its own tests. The call itself spends one of
 * 24 daily polls and exceeding 24 permanently disables the token, so a suite
 * that made real calls would be the fastest way to lose the account.
 */

export interface SimpleFINOrg {
  domain?: string;
  name?: string;
  'sfin-url'?: string;
  url?: string;
  id?: string;
}

export interface SimpleFINTransaction {
  id: string;
  posted: number;
  amount: string;
  description: string;
  payee?: string;
  memo?: string;
  transacted_at?: number;
  pending?: boolean;
}

export interface SimpleFINAccount {
  org: SimpleFINOrg;
  id: string;
  name: string;
  currency: string;
  balance: string;
  'available-balance'?: string;
  'balance-date': number;
  transactions?: SimpleFINTransaction[];
}

export interface SimpleFINAccountSet {
  errors: string[];
  accounts: SimpleFINAccount[];
}

export class SimpleFINApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly detail: string,
  ) {
    super(`SimpleFIN API ${status}: ${detail}`);
    this.name = 'SimpleFINApiError';
  }
}

interface AccessURLParts {
  baseUrl: string;
  username: string;
  password: string;
}

/**
 * Splits `https://user:pass@host/path` into its parts.
 *
 * Credentials are percent-decoded: a generated SimpleFIN password routinely
 * contains characters that have to be encoded in the userinfo, and sending
 * the encoded form fails authentication.
 */
export function parseAccessUrl(accessUrl: string): AccessURLParts {
  const url = new URL(accessUrl);
  const username = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);

  url.username = '';
  url.password = '';
  const baseUrl = url.toString().replace(/\/$/, '');

  return { baseUrl, username, password };
}

export interface FetchAccountsOptions {
  startDate?: Date;
  endDate?: Date;
  pending?: boolean;
  balancesOnly?: boolean;
}

/**
 * The request `fetchAccounts` will make, built without making it.
 *
 * Separated so the URL and the auth header can be asserted without spending a
 * poll. The credentials go in the header and never in the URL — a credential
 * in a URL reaches logs, proxies and error messages that a header does not.
 */
export function buildAccountsRequest(
  accessUrl: string,
  opts: FetchAccountsOptions,
): { url: string; headers: Record<string, string> } {
  const { baseUrl, username, password } = parseAccessUrl(accessUrl);

  const params = new URLSearchParams();
  if (opts.startDate) {
    params.set('start-date', Math.floor(opts.startDate.getTime() / 1000).toString());
  }
  if (opts.endDate) {
    params.set('end-date', Math.floor(opts.endDate.getTime() / 1000).toString());
  }
  if (opts.pending) params.set('pending', '1');
  if (opts.balancesOnly) params.set('balances-only', '1');

  const query = params.toString();

  return {
    url: `${baseUrl}/accounts${query ? `?${query}` : ''}`,
    headers: {
      Authorization: `Basic ${btoa(`${username}:${password}`)}`,
      Accept: 'application/json',
    },
  };
}

/**
 * The error a response status implies, or null when it implies none.
 *
 * A SimpleFIN error body can carry account detail, so nothing but the status
 * is ever read into a message. 403 is the disabled-token case and says where
 * to re-authorize, because the fix is outside this application.
 */
export function errorForStatus(status: number): SimpleFINApiError | null {
  if (status === 402) {
    return new SimpleFINApiError(402, 'SimpleFIN subscription expired — payment required');
  }
  if (status === 403) {
    return new SimpleFINApiError(
      403,
      'SimpleFIN access revoked or token disabled — re-authorize at bridge.simplefin.org',
    );
  }
  if (status < 200 || status >= 300) {
    return new SimpleFINApiError(status, `Unexpected HTTP ${status}`);
  }
  return null;
}

/**
 * Calls SimpleFIN `/accounts`.
 *
 * **Spends one of 24 daily polls.** Exceeding 24 permanently disables the
 * token, so every caller must hold the guard from `services/sync-guard.ts`
 * first. Max date range is 90 days per request.
 *
 * The `errors` array is returned rather than swallowed: it carries rate-limit
 * warnings and per-institution connection failures that the user needs to
 * see, and the caller surfaces them (#70).
 */
export async function fetchAccounts(
  accessUrl: string,
  opts: FetchAccountsOptions = {},
): Promise<SimpleFINAccountSet> {
  const { url, headers } = buildAccountsRequest(accessUrl, opts);

  const response = await fetch(url, { method: 'GET', headers });

  const error = errorForStatus(response.status);
  if (error) {
    // Status only — never the body, which may carry account detail.
    console.warn('SimpleFIN API error', { status: response.status });
    throw error;
  }

  return (await response.json()) as SimpleFINAccountSet;
}
