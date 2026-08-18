/**
 * Settings — ported from Express (#68), across the table split from #71.
 *
 * The old `app_settings` was one flat key/value table. It is now two, routed
 * by who the value belongs to, and the wire shape has to be unchanged: the
 * frontend reads a flat list and builds a map from it, so the split is
 * invisible above the API or the port has broken the client.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { SELF, env } from 'cloudflare:test';
import { MAZZA_HOUSEHOLD_ID } from '../src/db/household.js';

async function api(path: string, init?: RequestInit) {
  const res = await SELF.fetch(`https://example.com/api/v1${path}`, init);
  return { res, body: (await res.json()) as { data: any; error: any } };
}

function put(path: string, body: unknown) {
  return api(path, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(async () => {
  await env.DB.exec('DELETE FROM household_settings');
  await env.DB.exec('DELETE FROM user_settings');
});

describe('GET /settings', () => {
  it('returns an empty list when nothing has been set', async () => {
    // The Express app stored no defaults either — an absent key falls back in
    // the client. Inventing rows here would change what the calendar shows.
    const { res, body } = await api('/settings');
    expect(res.status).toBe(200);
    expect(body).toEqual({ data: [], error: null });
  });

  it('returns the household keys as a flat list, as the client still expects', async () => {
    // The frontend builds a map from this list. The table split from #71 has
    // to be invisible above the API or the port has broken the client.
    await put('/settings/balance_threshold_green', { value: '1500' });
    await put('/settings/balance_threshold_yellow', { value: '250' });

    const { body } = await api('/settings');
    const map = Object.fromEntries(body.data.map((r: any) => [r.key, r.value]));
    expect(map).toEqual({ balance_threshold_green: '1500', balance_threshold_yellow: '250' });
  });

  it('carries no user rows, because there is no signed-in user to carry them for', async () => {
    // user_settings.user_id is a foreign key and #71 seeds no users; the read
    // side of that table arrives with #76, under its own tests.
    await put('/settings/balance_threshold_green', { value: '1500' });
    const { body } = await api('/settings');
    expect(body.data.every((r: any) => r.key !== 'theme')).toBe(true);
  });
});

describe('PUT /settings/:key — routing by owner', () => {
  it('files a threshold against the household', async () => {
    await put('/settings/balance_threshold_yellow', { value: '250' });

    const row = await env.DB.prepare(
      'SELECT household_id, value FROM household_settings WHERE key = ?',
    )
      .bind('balance_threshold_yellow')
      .first<{ household_id: string; value: string }>();
    expect(row).toEqual({ household_id: MAZZA_HOUSEHOLD_ID, value: '250' });
  });

  it('answers with the stored row, as Express did', async () => {
    const { res, body } = await put('/settings/balance_threshold_green', { value: '1500' });
    expect(res.status).toBe(200);
    expect(body.data).toMatchObject({ key: 'balance_threshold_green', value: '1500' });
    expect(body.error).toBeNull();
  });

  it('overwrites rather than duplicating on a second write', async () => {
    await put('/settings/balance_threshold_green', { value: '1500' });
    await put('/settings/balance_threshold_green', { value: '2000' });

    const { body } = await api('/settings');
    const rows = body.data.filter((r: any) => r.key === 'balance_threshold_green');
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe('2000');
  });
});

describe('PUT /settings/:key — validation', () => {
  it('rejects a key outside the allowed set with 400', async () => {
    const { res, body } = await put('/settings/arbitrary_key', { value: 'x' });
    expect(res.status).toBe(400);
    expect(body.error).toBe('Unknown setting key: arbitrary_key');
  });

  it('writes nothing for a rejected key', async () => {
    await put('/settings/arbitrary_key', { value: 'x' });
    const h = await env.DB.prepare('SELECT COUNT(*) AS n FROM household_settings').first<{
      n: number;
    }>();
    const u = await env.DB.prepare('SELECT COUNT(*) AS n FROM user_settings').first<{ n: number }>();
    expect(h?.n).toBe(0);
    expect(u?.n).toBe(0);
  });

  it('rejects a missing value with 400', async () => {
    const { res } = await put('/settings/balance_threshold_green', {});
    expect(res.status).toBe(400);
  });
});

describe('a per-user key before there is a user', () => {
  it('answers 401 rather than pretending it saved', async () => {
    // `theme` stays in the allowed set for parity with Express, but it belongs
    // to user_settings, whose user_id is a foreign key, and #71 seeds no
    // users. The three ways to make this return 200 are all worse: store it
    // in the household table and #89 has to move a key between tables, which
    // is the retrofit #71 exists to prevent; seed a user no sign-in can claim;
    // or accept the write and drop it, which tells the caller a lie.
    //
    // 401 is what an unauthenticated request will get once #76 lands, so this
    // is the eventual answer arriving early rather than a placeholder.
    const { res, body } = await put('/settings/theme', { value: 'dark' });
    expect(res.status).toBe(401);
    expect(body.error).toBe('No signed-in user');
  });

  it('writes the rejected key nowhere at all', async () => {
    await put('/settings/theme', { value: 'dark' });

    const h = await env.DB.prepare('SELECT COUNT(*) AS n FROM household_settings').first<{
      n: number;
    }>();
    const u = await env.DB.prepare('SELECT COUNT(*) AS n FROM user_settings').first<{ n: number }>();
    expect(h?.n).toBe(0);
    expect(u?.n).toBe(0);
  });

  it('is invisible to the client, which keeps the theme in localStorage', async () => {
    // frontend/src/lib/theme.ts reads and writes the theme through
    // localStorage; nothing in the client ever calls this key. So the 401 is
    // not a regression against the Express 200 — it is an answer no caller
    // has ever asked for.
    const { res } = await put('/settings/balance_threshold_green', { value: '1500' });
    expect(res.status).toBe(200);
  });
});
