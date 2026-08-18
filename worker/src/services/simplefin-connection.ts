/**
 * The SimpleFIN access URL at rest (#73).
 *
 * A SimpleFIN access URL carries its own credentials in the userinfo — it is
 * a bearer token wearing a URL's clothes. Whoever holds it can read the
 * household's bank data until it is revoked, so it is encrypted at rest with
 * AES-256-GCM, in the same `nonce:ciphertext:tag` format the Node
 * implementation used, and the master key is only ever read from the Worker
 * binding that Wrangler secrets populate.
 *
 * The key is never written to the database, and the URL is never written to a
 * log or an error message. Both are asserted by test rather than intended:
 * the failure path is where a secret most often escapes, because the value is
 * right there and the message is being written in a hurry.
 *
 * `key_version` is stored so a future rotation has somewhere to go — a
 * re-encrypt pass can find rows still on the old version.
 */
import { eq } from 'drizzle-orm';
import { simplefinConnections } from '../db/schema.js';
import { encrypt, decrypt } from '../lib/crypto.js';
import type { getDb } from '../db/client.js';

type Db = ReturnType<typeof getDb>;

/** Bumped when the master key rotates, so old rows can be found and re-encrypted. */
const CURRENT_KEY_VERSION = 1;

/**
 * Stores the access URL for one household, replacing any existing connection.
 *
 * One connection per household — the column is unique — so this replaces
 * rather than accumulating. A replacement stamps `rotatedAt`, which is the
 * only record that the credential changed; the values themselves are
 * indistinguishable ciphertext.
 */
export async function storeAccessUrl(
  db: Db,
  householdId: string,
  accessUrl: string,
  keyHex: string,
): Promise<void> {
  const encrypted = await encrypt(accessUrl, keyHex);
  const now = new Date().toISOString();

  const existing = await db
    .select({ id: simplefinConnections.id })
    .from(simplefinConnections)
    .where(eq(simplefinConnections.householdId, householdId))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(simplefinConnections)
      .set({
        encryptedAccessUrl: encrypted,
        keyVersion: CURRENT_KEY_VERSION,
        rotatedAt: now,
      })
      .where(eq(simplefinConnections.householdId, householdId));
    return;
  }

  await db.insert(simplefinConnections).values({
    householdId,
    encryptedAccessUrl: encrypted,
    keyVersion: CURRENT_KEY_VERSION,
  });
}

/**
 * The decrypted access URL for one household, or null if it has none.
 *
 * Decrypted per request and never cached: an isolate is reused across
 * requests, and a plaintext credential parked in module scope outlives the
 * request that was entitled to it.
 *
 * A decryption failure propagates. It means the stored value does not match
 * the key — a rotation gone wrong, or tampering — and returning null there
 * would read to the caller as "no connection configured", which invites
 * someone to paste the credential in again rather than investigate.
 */
export async function readAccessUrl(
  db: Db,
  householdId: string,
  keyHex: string,
): Promise<string | null> {
  const rows = await db
    .select({ encryptedAccessUrl: simplefinConnections.encryptedAccessUrl })
    .from(simplefinConnections)
    .where(eq(simplefinConnections.householdId, householdId))
    .limit(1);

  if (rows.length === 0) return null;
  return decrypt(rows[0]!.encryptedAccessUrl, keyHex);
}

/**
 * Whether a household has a connection, without decrypting it.
 *
 * The settings screen needs to say "connected" without the plaintext ever
 * being produced, and a check that decrypts to answer a yes/no question is a
 * plaintext credential created for no reason.
 */
export async function hasConnection(db: Db, householdId: string): Promise<boolean> {
  const rows = await db
    .select({ id: simplefinConnections.id })
    .from(simplefinConnections)
    .where(eq(simplefinConnections.householdId, householdId))
    .limit(1);
  return rows.length > 0;
}
