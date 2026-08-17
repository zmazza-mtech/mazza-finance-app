/**
 * AES-256-GCM via Web Crypto — the Workers port of backend/src/lib/crypto.ts.
 *
 * Wire format is unchanged: "nonce_hex:ciphertext_hex:auth_tag_hex" with a
 * 96-bit nonce and 128-bit tag, so values encrypted by the Node
 * implementation decrypt here and vice versa (verified by fixture tests).
 * The only signature change is async: crypto.subtle is Promise-based.
 */

const NONCE_BYTES = 12;
const TAG_BYTES = 16;

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || /[^0-9a-fA-F]/.test(hex)) {
    throw new Error('Invalid hex string');
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return hex;
}

async function importKey(keyHex: string): Promise<CryptoKey> {
  let keyBytes: Uint8Array;
  try {
    keyBytes = hexToBytes(keyHex);
  } catch {
    throw new Error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
  }
  if (keyBytes.length !== 32) {
    throw new Error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
  }
  return crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

/**
 * Encrypts a plaintext string. Generates a fresh random 96-bit nonce on
 * every call. Returns "nonce_hex:ciphertext_hex:auth_tag_hex".
 */
export async function encrypt(plaintext: string, keyHex: string): Promise<string> {
  const key = await importKey(keyHex);
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));

  // subtle.encrypt returns ciphertext with the tag appended.
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce },
      key,
      new TextEncoder().encode(plaintext)
    )
  );

  const ciphertext = sealed.slice(0, sealed.length - TAG_BYTES);
  const tag = sealed.slice(sealed.length - TAG_BYTES);

  return [bytesToHex(nonce), bytesToHex(ciphertext), bytesToHex(tag)].join(':');
}

/**
 * Decrypts a stored value produced by `encrypt` (either implementation).
 * Throws if the authentication tag does not match — never returns corrupted
 * plaintext.
 */
export async function decrypt(stored: string, keyHex: string): Promise<string> {
  const parts = stored.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted value format — expected "nonce:ciphertext:tag"');
  }
  const [nonceHex, ciphertextHex, tagHex] = parts as [string, string, string];

  const key = await importKey(keyHex);
  const nonce = hexToBytes(nonceHex);
  const ciphertext = hexToBytes(ciphertextHex);
  const tag = hexToBytes(tagHex);

  if (tag.length !== TAG_BYTES) {
    throw new Error('Invalid auth tag length');
  }

  const sealed = new Uint8Array(ciphertext.length + tag.length);
  sealed.set(ciphertext);
  sealed.set(tag, ciphertext.length);

  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, sealed);
  } catch {
    // Web Crypto throws an opaque OperationError on tag mismatch.
    throw new Error('Decryption failed — authentication tag mismatch');
  }

  return new TextDecoder().decode(plaintext);
}
