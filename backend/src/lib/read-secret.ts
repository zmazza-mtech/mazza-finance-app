import fs from 'node:fs';

/**
 * Reads a secret value, preferring a Docker-secrets-style file reference.
 *
 * Checks `{envVar}_FILE` first — if set, reads and trims the file contents.
 * Falls back to `{envVar}` env var. Returns undefined if neither is set.
 */
export function readSecret(envVar: string): string | undefined {
  const filePath = process.env[`${envVar}_FILE`];
  if (filePath) {
    return fs.readFileSync(filePath, 'utf8').trim();
  }
  return process.env[envVar];
}
