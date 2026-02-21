import { describe, it, expect } from 'vitest';
import { encrypt, decrypt } from '../../src/lib/crypto.js';

const TEST_KEY = 'a'.repeat(64); // 32-byte hex key for tests

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
    const ciphertext = encrypt('token', TEST_KEY);
    const parts = ciphertext.split(':');
    // Flip one byte in the ciphertext portion
    const tampered = parts[0] + ':' + '00' + parts[1]!.slice(2) + ':' + parts[2];
    expect(() => decrypt(tampered, TEST_KEY)).toThrow();
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
