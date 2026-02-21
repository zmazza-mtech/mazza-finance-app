import https from 'https';
import fs from 'fs';
import { logger } from './logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TellerAccount {
  id: string;
  institution: { name: string };
  name: string;
  type: string;
  subtype: string | null;
  currency: string;
  enrollment_id: string;
  links: {
    balances: string;
    self: string;
    transactions: string;
  };
}

export interface TellerBalance {
  account_id: string;
  ledger: string;
  available: string | null;
}

export interface TellerTransaction {
  id: string;
  account_id: string;
  date: string; // YYYY-MM-DD
  description: string;
  amount: string; // Teller uses positive for debit (we invert on ingest)
  status: 'posted' | 'pending';
  type: string;
  details: {
    category: string | null;
    counterparty: { name: string | null; type: string | null } | null;
    processing_status: string;
  };
  links: { self: string; account: string };
}

// ---------------------------------------------------------------------------
// Teller base URL
// ---------------------------------------------------------------------------

const TELLER_BASE = 'https://api.teller.io';

// ---------------------------------------------------------------------------
// Singleton HTTPS agent with mutual TLS
// ---------------------------------------------------------------------------

let _agent: https.Agent | null = null;

function getAgent(): https.Agent {
  if (_agent) return _agent;

  const certPath = process.env.TELLER_CERT_PATH;
  const keyPath = process.env.TELLER_KEY_PATH;

  if (!certPath || !keyPath) {
    throw new Error('TELLER_CERT_PATH and TELLER_KEY_PATH must be set');
  }

  _agent = new https.Agent({
    cert: fs.readFileSync(certPath),
    key: fs.readFileSync(keyPath),
    rejectUnauthorized: true,
  });

  return _agent;
}

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

function request<T>(
  path: string,
  accessToken: string
): Promise<T> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, TELLER_BASE);
    const options: https.RequestOptions = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'GET',
      agent: getAgent(),
      headers: {
        Authorization: `Basic ${Buffer.from(accessToken + ':').toString('base64')}`,
        Accept: 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString();
        const status = res.statusCode ?? 0;

        if (status >= 200 && status < 300) {
          try {
            resolve(JSON.parse(body) as T);
          } catch {
            reject(new Error(`Invalid JSON from Teller API: ${path}`));
          }
        } else {
          // Log only the path and status — never the response body (may contain PII)
          logger.warn('Teller API error', { path, status });
          reject(new TellerApiError(status, path));
        }
      });
    });

    req.on('error', (err) => {
      logger.error('Teller API network error', { path });
      reject(err);
    });

    req.end();
  });
}

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

export class TellerApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly path: string
  ) {
    super(`Teller API ${status} at ${path}`);
    this.name = 'TellerApiError';
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Fetch all accounts associated with an access token. */
export async function listAccounts(accessToken: string): Promise<TellerAccount[]> {
  return request<TellerAccount[]>('/accounts', accessToken);
}

/** Fetch balance for a specific account. */
export async function getBalance(
  accessToken: string,
  accountId: string
): Promise<TellerBalance> {
  return request<TellerBalance>(`/accounts/${accountId}/balances`, accessToken);
}

/**
 * Fetch transactions for a specific account.
 *
 * Teller returns a max of 250 transactions per call (most recent first).
 * For initial sync or history pulls, pass fromDate to bound the window.
 */
export async function listTransactions(
  accessToken: string,
  accountId: string,
  count: number = 250
): Promise<TellerTransaction[]> {
  const path = `/accounts/${accountId}/transactions?count=${count}`;
  return request<TellerTransaction[]>(path, accessToken);
}
