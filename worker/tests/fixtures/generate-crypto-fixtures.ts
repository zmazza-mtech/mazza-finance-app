/**
 * Generates cross-implementation crypto fixtures with Node's crypto module.
 *
 * The encrypt below mirrors backend/src/lib/crypto.ts exactly (AES-256-GCM,
 * 96-bit nonce, "nonce_hex:ciphertext_hex:tag_hex"). The Worker test suite
 * decrypts these with the Web Crypto port, proving values written by the
 * Node backend remain readable after the replatform.
 *
 * Run: npm run fixtures:crypto  (regenerates crypto-fixtures.json)
 */
import { createCipheriv, randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const KEY_HEX = '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f';

function encryptNode(plaintext: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex');
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [nonce.toString('hex'), ciphertext.toString('hex'), tag.toString('hex')].join(':');
}

const plaintexts = [
  'https://ACC1234567890:secret-token@bridge.simplefin.org/simplefin',
  'short',
  '',
  'unicode: café ☕ 家計簿 — em-dash',
  'x'.repeat(1024),
];

const fixtures = {
  keyHex: KEY_HEX,
  cases: plaintexts.map((plaintext) => ({
    plaintext,
    stored: encryptNode(plaintext, KEY_HEX),
  })),
};

const out = join(dirname(fileURLToPath(import.meta.url)), 'crypto-fixtures.json');
writeFileSync(out, JSON.stringify(fixtures, null, 2) + '\n');
console.log(`wrote ${fixtures.cases.length} fixtures to ${out}`);
