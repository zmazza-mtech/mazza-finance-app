import { readSecret } from './read-secret';
import { logger } from './logger';

// ---------------------------------------------------------------------------
// Types — match SimpleFIN protocol spec
// ---------------------------------------------------------------------------

export interface SimpleFINOrg {
  domain?: string;
  'sfin-url': string;
  name?: string;
  url?: string;
  id?: string;
}

export interface SimpleFINTransaction {
  id: string;
  posted: number; // Unix epoch seconds; 0 = pending
  amount: string; // numeric string, negative = withdrawal
  description: string;
  transacted_at?: number;
  pending?: boolean;
  extra?: Record<string, unknown>;
}

export interface SimpleFINAccount {
  org: SimpleFINOrg;
  id: string;
  name: string;
  currency: string;
  balance: string; // numeric string
  'available-balance'?: string;
  'balance-date': number; // Unix epoch seconds
  transactions?: SimpleFINTransaction[];
  extra?: Record<string, unknown>;
}

export interface SimpleFINAccountSet {
  errors: string[];
  accounts: SimpleFINAccount[];
}

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

export class SimpleFINApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly detail: string
  ) {
    super(`SimpleFIN API ${status}: ${detail}`);
    this.name = 'SimpleFINApiError';
  }
}

// ---------------------------------------------------------------------------
// Parse Access URL
// ---------------------------------------------------------------------------

interface AccessURLParts {
  baseUrl: string;
  username: string;
  password: string;
}

export function parseAccessUrl(accessUrl: string): AccessURLParts {
  // Format: https://username:password@host/path
  const url = new URL(accessUrl);
  const username = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);
  // Rebuild base URL without credentials
  url.username = '';
  url.password = '';
  const baseUrl = url.toString().replace(/\/$/, '');
  return { baseUrl, username, password };
}

// ---------------------------------------------------------------------------
// Fetch options
// ---------------------------------------------------------------------------

export interface FetchAccountsOptions {
  startDate?: Date;
  endDate?: Date;
  pending?: boolean;
  balancesOnly?: boolean;
}

// ---------------------------------------------------------------------------
// fetchAccounts
// ---------------------------------------------------------------------------

/**
 * Calls the SimpleFIN `/accounts` endpoint with optional filters.
 *
 * Rate limit: 24 calls/day. Exceeding permanently disables the token.
 * Max date range: 90 days per request.
 */
export async function fetchAccounts(
  opts: FetchAccountsOptions = {}
): Promise<SimpleFINAccountSet> {
  const accessUrl = readSecret('SIMPLEFIN_ACCESS_URL');
  if (!accessUrl) {
    throw new Error('SIMPLEFIN_ACCESS_URL is not configured');
  }

  const { baseUrl, username, password } = parseAccessUrl(accessUrl);

  const params = new URLSearchParams();
  if (opts.startDate) {
    params.set('start-date', Math.floor(opts.startDate.getTime() / 1000).toString());
  }
  if (opts.endDate) {
    params.set('end-date', Math.floor(opts.endDate.getTime() / 1000).toString());
  }
  if (opts.pending) {
    params.set('pending', '1');
  }
  if (opts.balancesOnly) {
    params.set('balances-only', '1');
  }

  const query = params.toString();
  const url = `${baseUrl}/accounts${query ? `?${query}` : ''}`;

  const auth = Buffer.from(`${username}:${password}`).toString('base64');

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: 'application/json',
    },
  });

  if (response.status === 402) {
    throw new SimpleFINApiError(402, 'SimpleFIN subscription expired — payment required');
  }

  if (response.status === 403) {
    throw new SimpleFINApiError(403, 'SimpleFIN access revoked or token disabled — re-authorize at bridge.simplefin.org');
  }

  if (!response.ok) {
    // Log only status — never the response body (may contain PII)
    logger.warn('SimpleFIN API error', { status: response.status });
    throw new SimpleFINApiError(response.status, `Unexpected HTTP ${response.status}`);
  }

  const data = (await response.json()) as SimpleFINAccountSet;

  // Surface warnings from the errors array (rate limit warnings, connection issues)
  if (data.errors.length > 0) {
    for (const err of data.errors) {
      logger.warn('SimpleFIN warning', { message: err });
    }
  }

  return data;
}
