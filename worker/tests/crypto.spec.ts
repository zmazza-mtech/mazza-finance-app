import { describe, it, expect } from 'vitest';
import { encrypt, decrypt } from '../src/lib/crypto';
import fixtures from './fixtures/crypto-fixtures.json';

const KEY = fixtures.keyHex;
const OTHER_KEY = 'f'.repeat(64);

describe('Web Crypto AES-256-GCM port', () => {
  it('decrypts every value encrypted by the Node implementation', async () => {
    for (const { plaintext, stored } of fixtures.cases) {
      expect(await decrypt(stored, KEY)).toBe(plaintext);
    }
  });

  it('round-trips through its own encrypt/decrypt', async () => {
    const plaintext = 'https://ACC:token@bridge.simplefin.org/simplefin';
    const stored = await encrypt(plaintext, KEY);
    expect(stored).toMatch(/^[0-9a-f]{24}:[0-9a-f]*:[0-9a-f]{32}$/);
    expect(await decrypt(stored, KEY)).toBe(plaintext);
  });

  it('generates a fresh nonce per call', async () => {
    const a = await encrypt('same plaintext', KEY);
    const b = await encrypt('same plaintext', KEY);
    expect(a).not.toBe(b);
  });

  it('throws on a tampered ciphertext instead of returning corrupted plaintext', async () => {
    const stored = await encrypt('sensitive', KEY);
    const parts = stored.split(':') as [string, string, string];
    const flipped = (parseInt(parts[1].slice(0, 2), 16) ^ 0xff).toString(16).padStart(2, '0');
    const tampered = [parts[0], flipped + parts[1].slice(2), parts[2]].join(':');
    await expect(decrypt(tampered, KEY)).rejects.toThrow(/authentication tag mismatch/);
  });

  it('throws on the wrong key', async () => {
    const stored = await encrypt('sensitive', KEY);
    await expect(decrypt(stored, OTHER_KEY)).rejects.toThrow(/authentication tag mismatch/);
  });

  it('rejects malformed keys and stored values', async () => {
    await expect(encrypt('x', 'deadbeef')).rejects.toThrow(/64-character hex/);
    await expect(decrypt('not-three-parts', KEY)).rejects.toThrow(/expected "nonce:ciphertext:tag"/);
  });
});
