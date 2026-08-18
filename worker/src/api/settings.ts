/**
 * Settings — ported from `backend/src/api/settings.ts` (#68), across the table
 * split from #71.
 *
 * The old `app_settings` was one flat key/value table with no owner. It is now
 * two, routed by who the value belongs to. The wire shape is unchanged: the
 * frontend reads a flat list and builds a map from it, so the split has to be
 * invisible above the API or the port has broken the client.
 */
import { Hono } from 'hono';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../db/client.js';
import { householdSettings } from '../db/schema.js';
import { currentHouseholdId } from '../db/household.js';
import { ok, fail, serverError } from '../lib/envelope.js';
import type { Env } from '../env.js';

/**
 * Every key the Express app allowed, and which table now owns it.
 *
 * Decided in migration 0001 rather than here, and repeated here only as the
 * routing table the requests need. No key moves between the two later — that
 * retrofit is what #71 exists to prevent.
 */
const SETTING_OWNER = {
  balance_threshold_green: 'household',
  balance_threshold_yellow: 'household',
  last_sync_at: 'household',
  theme: 'user',
} as const;

type SettingKey = keyof typeof SETTING_OWNER;

const UpdateSettingSchema = z.object({ value: z.string().min(1).max(255) });

async function readJson(c: { req: { json: () => Promise<unknown> } }): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}

const app = new Hono<{ Bindings: Env }>();

// GET /settings
app.get('/', async (c) => {
  try {
    const db = getDb(c.env.DB);
    const rows = await db
      .select({
        key: householdSettings.key,
        value: householdSettings.value,
        updatedAt: householdSettings.updatedAt,
      })
      .from(householdSettings)
      .where(eq(householdSettings.householdId, currentHouseholdId()));

    // User-owned keys are absent because there is no signed-in user to own
    // them yet. #76 provisions one from a verified JWT and this read grows a
    // second half, with its own tests rather than dead code written early.
    return ok(c, rows);
  } catch (err) {
    return serverError(c, 'GET /settings', err);
  }
});

// PUT /settings/:key
app.put('/:key', async (c) => {
  const key = c.req.param('key');
  if (!(key in SETTING_OWNER)) {
    return fail(c, `Unknown setting key: ${key}`, 400);
  }

  const parsed = UpdateSettingSchema.safeParse(await readJson(c));
  if (!parsed.success) return fail(c, parsed.error.flatten(), 400);

  if (SETTING_OWNER[key as SettingKey] === 'user') {
    // `user_settings.user_id` is a foreign key and no users are seeded (#71).
    // Storing this in the household table instead would put the key in the
    // table the split decided it does not belong in, and #89 would have to
    // move it. 401 is what an unauthenticated request gets once #76 lands, so
    // this is the eventual answer arriving early rather than a placeholder.
    return fail(c, 'No signed-in user', 401);
  }

  try {
    const db = getDb(c.env.DB);
    const householdId = currentHouseholdId();

    await db
      .insert(householdSettings)
      .values({ householdId, key, value: parsed.data.value })
      .onConflictDoUpdate({
        target: [householdSettings.householdId, householdSettings.key],
        set: { value: parsed.data.value, updatedAt: new Date().toISOString() },
      });

    const rows = await db
      .select({
        key: householdSettings.key,
        value: householdSettings.value,
        updatedAt: householdSettings.updatedAt,
      })
      .from(householdSettings)
      .where(
        and(eq(householdSettings.householdId, householdId), eq(householdSettings.key, key)),
      )
      .limit(1);

    return ok(c, rows[0]);
  } catch (err) {
    return serverError(c, 'PUT /settings/:key', err);
  }
});

export default app;
