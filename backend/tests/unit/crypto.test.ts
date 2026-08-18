import { describe, it, expect } from 'vitest';
import { encrypt, decrypt } from '../../src/lib/crypto.js';

const TEST_KEY = 'a'.repeat(64); // 32-byte hex key for tests

/**
 * Rebuilds a stored value with every bit of its first ciphertext byte flipped.
 *
 * Derived from the byte that is actually there rather than assigned a literal:
 * a fixed replacement is a no-op whenever the ciphertext already carries that
 * value, and the nonce is random per call, so it would leave the tamper test
 * passing vacuously at a predictable rate.
 */
function tamperFirstByte(nonce: string, body: string, tag: string): string {
  const flipped = (parseInt(body.slice(0, 2), 16) ^ 0xff).toString(16).padStart(2, '0');
  return [nonce, flipped + body.slice(2), tag].join(':');
}

describe('AES-256-GCM crypto utility', () => {
  it('encrypts and decrypts a string successfully', () => {
    const plaintext = 'test-access-token-abc123';
    const ciphertext = encrypt(plaintext, TEST_KEY);
    const decrypted = decrypt(ciphertext, TEST_KEY);
    expect(decrypted).toBe(plaintext);
  });

  it('produces unique ciphertext on every call (random nonce)', () => {
    const plaintext = 'same-token';
    const first = encrypt(plaintext, TEST_KEY);
    const second = encrypt(plaintext, TEST_KEY);
    expect(first).not.toBe(second);
  });

  it('stores nonce, ciphertext, and auth tag separated by colons', () => {
    const result = encrypt('token', TEST_KEY);
    const parts = result.split(':');
    expect(parts).toHaveLength(3);
    // nonce = 12 bytes = 24 hex chars
    expect(parts[0]).toHaveLength(24);
  });

  it('throws on auth tag mismatch (tampered ciphertext)', () => {
    const [nonce, body, tag] = encrypt('token', TEST_KEY).split(':') as [
      string,
      string,
      string,
    ];
    expect(() => decrypt(tamperFirstByte(nonce, body, tag), TEST_KEY)).toThrow();
  });

  it('tampers unconditionally, whatever byte the ciphertext happens to start with', () => {
    // The tamper used to assign '00' rather than derive a different value, so on
    // the 1-in-256 encryptions already starting with a zero byte it changed
    // nothing, GCM authenticated the value, and the test above failed for a
    // reason unrelated to the code under test. Measured at 1 in 253 over 20,000
    // cycles before the fix.
    for (let i = 0; i < 10_000; i++) {
      const [nonce, body, tag] = encrypt('token', TEST_KEY).split(':') as [
        string,
        string,
        string,
      ];
      expect(() => decrypt(tamperFirstByte(nonce, body, tag), TEST_KEY)).toThrow();
    }
  });

  it('throws on wrong key', () => {
    const ciphertext = encrypt('token', TEST_KEY);
    const wrongKey = 'b'.repeat(64);
    expect(() => decrypt(ciphertext, wrongKey)).toThrow();
  });

  it('throws on malformed stored value', () => {
    expect(() => decrypt('not:valid', TEST_KEY)).toThrow();
    expect(() => decrypt('only-one-part', TEST_KEY)).toThrow();
  });
});
