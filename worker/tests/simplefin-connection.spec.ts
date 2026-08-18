/**
 * The SimpleFIN access URL at rest (#73).
 *
 * The Docker-secret convention retires with Compose. The URL moves into D1
 * encrypted with AES-256-GCM, in the same `nonce:ciphertext:tag` format the
 * Node implementation used, with the single master key living in Wrangler
 * secrets and never in the database.
 *
 * A SimpleFIN access URL carries its own credentials in the userinfo — it is
 * a bearer token wearing a URL's clothes — so "no plaintext anywhere" is the
 * whole point, and each of those places is asserted rather than assumed.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { env } from 'cloudflare:test';
import { getDb } from '../src/db/client.js';
import { MAZZA_HOUSEHOLD_ID } from '../src/db/household.js';
import {
  storeAccessUrl,
  readAccessUrl,
  hasConnection,
} from '../src/services/simplefin-connection.js';

const OTHER_HOUSEHOLD = '8e2a1f77-0c44-4f6e-9b3a-1d5c6e7f8a90';
const URL_A = 'https://user123:secretpass@bridge.simplefin.org/simplefin';
const URL_B = 'https://other:token@bridge.simplefin.org/simplefin';

beforeEach(async () => {
  await env.DB.exec('DELETE FROM simplefin_connections');
  await env.DB.prepare('INSERT OR IGNORE INTO households (id, name, created_at) VALUES (?, ?, ?)')
    .bind(OTHER_HOUSEHOLD, 'Other', '2026-08-17T00:00:00.000Z')
    .run();
});

describe('storing the access URL', () => {
  it('round-trips through encryption', async () => {
    const db = getDb(env.DB);
    await storeAccessUrl(db, MAZZA_HOUSEHOLD_ID, URL_A, env.ENCRYPTION_KEY);
    expect(await readAccessUrl(db, MAZZA_HOUSEHOLD_ID, env.ENCRYPTION_KEY)).toBe(URL_A);
  });

  it('writes no plaintext to the column', async () => {
    await storeAccessUrl(getDb(env.DB), MAZZA_HOUSEHOLD_ID, URL_A, env.ENCRYPTION_KEY);

    const row = await env.DB.prepare(
      'SELECT encrypted_access_url FROM simplefin_connections WHERE household_id = ?',
    )
      .bind(MAZZA_HOUSEHOLD_ID)
      .first<{ encrypted_access_url: string }>();

    expect(row!.encrypted_access_url).not.toContain('secretpass');
    expect(row!.encrypted_access_url).not.toContain('bridge.simplefin.org');
    expect(row!.encrypted_access_url).toMatch(/^[0-9a-f]{24}:[0-9a-f]+:[0-9a-f]{32}$/);
  });

  it('writes the master key nowhere in the database', async () => {
    await storeAccessUrl(getDb(env.DB), MAZZA_HOUSEHOLD_ID, URL_A, env.ENCRYPTION_KEY);

    const row = await env.DB.prepare('SELECT * FROM simplefin_connections').first<
      Record<string, unknown>
    >();
    for (const value of Object.values(row!)) {
      expect(String(value)).not.toContain(env.ENCRYPTION_KEY);
    }
  });

  it('records key_version so a rotation has somewhere to go', async () => {
    await storeAccessUrl(getDb(env.DB), MAZZA_HOUSEHOLD_ID, URL_A, env.ENCRYPTION_KEY);

    const row = await env.DB.prepare(
      'SELECT key_version FROM simplefin_connections WHERE household_id = ?',
    )
      .bind(MAZZA_HOUSEHOLD_ID)
      .first<{ key_version: number }>();
    expect(row?.key_version).toBe(1);
  });

  it('uses a fresh nonce each time, so the same URL never stores identically', async () => {
    const db = getDb(env.DB);
    await storeAccessUrl(db, MAZZA_HOUSEHOLD_ID, URL_A, env.ENCRYPTION_KEY);
    const first = await env.DB.prepare(
      'SELECT encrypted_access_url AS v FROM simplefin_connections WHERE household_id = ?',
    ).bind(MAZZA_HOUSEHOLD_ID).first<{ v: string }>();

    await storeAccessUrl(db, MAZZA_HOUSEHOLD_ID, URL_A, env.ENCRYPTION_KEY);
    const second = await env.DB.prepare(
      'SELECT encrypted_access_url AS v FROM simplefin_connections WHERE household_id = ?',
    ).bind(MAZZA_HOUSEHOLD_ID).first<{ v: string }>();

    expect(first!.v).not.toBe(second!.v);
  });

  it('replaces rather than accumulating connections for one household', async () => {
    const db = getDb(env.DB);
    await storeAccessUrl(db, MAZZA_HOUSEHOLD_ID, URL_A, env.ENCRYPTION_KEY);
    await storeAccessUrl(db, MAZZA_HOUSEHOLD_ID, URL_B, env.ENCRYPTION_KEY);

    const count = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM simplefin_connections WHERE household_id = ?',
    ).bind(MAZZA_HOUSEHOLD_ID).first<{ n: number }>();
    expect(count?.n).toBe(1);
    expect(await readAccessUrl(db, MAZZA_HOUSEHOLD_ID, env.ENCRYPTION_KEY)).toBe(URL_B);
  });

  it('stamps rotated_at when an existing connection is replaced', async () => {
    const db = getDb(env.DB);
    await storeAccessUrl(db, MAZZA_HOUSEHOLD_ID, URL_A, env.ENCRYPTION_KEY);
    await storeAccessUrl(db, MAZZA_HOUSEHOLD_ID, URL_B, env.ENCRYPTION_KEY);

    const row = await env.DB.prepare(
      'SELECT rotated_at FROM simplefin_connections WHERE household_id = ?',
    ).bind(MAZZA_HOUSEHOLD_ID).first<{ rotated_at: string | null }>();
    expect(row?.rotated_at).not.toBeNull();
  });
});

describe('reading it back', () => {
  it('returns null when the household has no connection', async () => {
    expect(await readAccessUrl(getDb(env.DB), MAZZA_HOUSEHOLD_ID, env.ENCRYPTION_KEY)).toBeNull();
  });

  it('never returns another household connection', async () => {
    const db = getDb(env.DB);
    await storeAccessUrl(db, OTHER_HOUSEHOLD, URL_B, env.ENCRYPTION_KEY);
    expect(await readAccessUrl(db, MAZZA_HOUSEHOLD_ID, env.ENCRYPTION_KEY)).toBeNull();
  });

  it('reports whether a connection exists without decrypting it', async () => {
    const db = getDb(env.DB);
    expect(await hasConnection(db, MAZZA_HOUSEHOLD_ID)).toBe(false);
    await storeAccessUrl(db, MAZZA_HOUSEHOLD_ID, URL_A, env.ENCRYPTION_KEY);
    expect(await hasConnection(db, MAZZA_HOUSEHOLD_ID)).toBe(true);
  });

  it('refuses a wrong key rather than returning something', async () => {
    const db = getDb(env.DB);
    await storeAccessUrl(db, MAZZA_HOUSEHOLD_ID, URL_A, env.ENCRYPTION_KEY);
    const wrongKey = 'f'.repeat(64);
    await expect(readAccessUrl(db, MAZZA_HOUSEHOLD_ID, wrongKey)).rejects.toThrow();
  });
});

describe('the URL never reaches a log or an error message', () => {
  const logged: string[] = [];

  beforeEach(() => {
    logged.length = 0;
    for (const level of ['log', 'warn', 'error'] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        logged.push(args.map((a) => String(a)).join(' '));
      });
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs nothing containing the URL when storing', async () => {
    await storeAccessUrl(getDb(env.DB), MAZZA_HOUSEHOLD_ID, URL_A, env.ENCRYPTION_KEY);
    expect(logged.join('\n')).not.toContain('secretpass');
  });

  it('keeps the URL out of the error raised by a wrong key', async () => {
    // The failure path is where a secret most often escapes, because the
    // value is right there and the message is being written in a hurry.
    const db = getDb(env.DB);
    await storeAccessUrl(db, MAZZA_HOUSEHOLD_ID, URL_A, env.ENCRYPTION_KEY);

    await expect(readAccessUrl(db, MAZZA_HOUSEHOLD_ID, 'f'.repeat(64))).rejects.toThrow(
      /^(?!.*secretpass).*$/s,
    );
    expect(logged.join('\n')).not.toContain('secretpass');
  });
});
