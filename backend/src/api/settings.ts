import { Router, Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import { appSettings, ALLOWED_SETTINGS_KEYS } from '../db/schema';
import { UpdateSettingSchema } from '../lib/validate';
import { logger } from '../lib/logger';

const router = Router();

// GET /settings
router.get('/', async (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const rows = await db.select().from(appSettings);
    res.json({ data: rows, error: null });
  } catch (err) {
    logger.error('GET /settings failed', { message: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ data: null, error: 'Internal server error' });
  }
});

// PUT /settings/:key
router.put('/:key', async (req: Request, res: Response) => {
  const key = req.params.key as string;

  // Validate key is in allowed set
  if (!(ALLOWED_SETTINGS_KEYS as readonly string[]).includes(key)) {
    return res.status(400).json({ data: null, error: `Unknown setting key: ${key}` });
  }

  const parsed = UpdateSettingSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ data: null, error: parsed.error.flatten() });
  }

  try {
    const db = getDb();
    await db
      .insert(appSettings)
      .values({ key, value: parsed.data.value })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { value: parsed.data.value, updatedAt: new Date() },
      });

    const rows = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, key))
      .limit(1);

    res.json({ data: rows[0], error: null });
  } catch (err) {
    logger.error('PUT /settings/:key failed', { message: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ data: null, error: 'Internal server error' });
  }
});

export default router;
