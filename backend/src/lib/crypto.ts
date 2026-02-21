import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Generates a fresh random 96-bit nonce on every call.
 *
 * @param plaintext - The string to encrypt
 * @param keyHex   - 32-byte key as a 64-char hex string
 * @returns        - Stored format: "nonce_hex:ciphertext_hex:auth_tag_hex"
 */
export function encrypt(plaintext: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex');
  if (key.length !== 32) {
    throw new Error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
  }

  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, nonce);

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  const tag = cipher.getAuthTag();

  return [
    nonce.toString('hex'),
    ciphertext.toString('hex'),
    tag.toString('hex'),
  ].join(':');
}

/**
 * Decrypts a stored value produced by `encrypt`.
 * Throws if the authentication tag does not match — never returns corrupted plaintext.
 *
 * @param stored  - "nonce_hex:ciphertext_hex:auth_tag_hex"
 * @param keyHex  - 32-byte key as a 64-char hex string
 * @returns       - Original plaintext string
 */
export function decrypt(stored: string, keyHex: string): string {
  const parts = stored.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted value format — expected "nonce:ciphertext:tag"');
  }

  const [nonceHex, ciphertextHex, tagHex] = parts as [string, string, string];

  const key = Buffer.from(keyHex, 'hex');
  if (key.length !== 32) {
    throw new Error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
  }

  const nonce = Buffer.from(nonceHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');

  if (tag.length !== TAG_BYTES) {
    throw new Error('Invalid auth tag length');
  }

  const decipher = createDecipheriv(ALGORITHM, key, nonce);
  decipher.setAuthTag(tag);

  // setAuthTag + final() will throw if the tag does not match — this is intentional
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return plaintext.toString('utf8');
}
