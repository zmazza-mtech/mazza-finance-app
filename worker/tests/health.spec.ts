import { describe, it, expect } from 'vitest';
import { SELF, env } from 'cloudflare:test';
import { authed } from './helpers/auth.js';

declare module 'cloudflare:test' {
  interface ProvidedEnv {
    DB: D1Database;
    ENCRYPTION_KEY: string;
  }
}

describe('worker scaffold', () => {
  it('serves /api/v1/health with the { data, error } envelope', async () => {
    const res = await SELF.fetch('https://example.com/api/v1/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { status: 'ok' }, error: null });
  });

  it('returns the 404 envelope for unknown API routes', async () => {
    const res = await SELF.fetch('https://example.com/api/v1/nope', authed());
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ data: null, error: 'Not found' });
  });

  it('has a working D1 binding', async () => {
    await env.DB.exec('CREATE TABLE IF NOT EXISTS smoke (id TEXT PRIMARY KEY, amount TEXT NOT NULL)');
    await env.DB.prepare('INSERT INTO smoke (id, amount) VALUES (?, ?)')
      .bind('t1', '-15.99')
      .run();
    const row = await env.DB.prepare('SELECT amount FROM smoke WHERE id = ?')
      .bind('t1')
      .first<{ amount: string }>();
    // Money survives as a TEXT decimal string, never coerced to a float.
    expect(row?.amount).toBe('-15.99');
  });
});
