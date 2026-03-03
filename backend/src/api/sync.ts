import { Router, Request, Response } from 'express';
import { getDb } from '../db/client';
import { syncLog } from '../db/schema';
import { runSync } from '../jobs/sync';
import { logger } from '../lib/logger';
import { desc, sql, and, gte } from 'drizzle-orm';

const router = Router();

const DAILY_SYNC_LIMIT = 24;

/** Count successful + running syncs started today (UTC). */
async function getSyncsToday(): Promise<number> {
  const db = getDb();
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(syncLog)
    .where(
      and(
        gte(syncLog.startedAt, todayStart),
        sql`${syncLog.status} IN ('running', 'success')`
      )
    );

  return rows[0]?.count ?? 0;
}

// POST /sync — trigger an on-demand sync
router.post('/', async (_req: Request, res: Response) => {
  try {
    const syncsToday = await getSyncsToday();
    if (syncsToday >= DAILY_SYNC_LIMIT) {
      return res.status(429).json({
        data: null,
        error: `Daily sync limit reached (${DAILY_SYNC_LIMIT}). Resets at midnight UTC.`,
      });
    }

    // Fire and forget — return immediately; client polls /sync/status
    runSync().catch((err) => logger.error('On-demand sync failed', { message: err instanceof Error ? err.message : String(err) }));
    res.status(202).json({ data: { accepted: true }, error: null });
  } catch (err) {
    logger.error('POST /sync failed', { message: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ data: null, error: 'Internal server error' });
  }
});

// GET /sync/status — return last sync + today's usage
router.get('/status', async (_req: Request, res: Response) => {
  try {
    const db = getDb();

    const [lastSyncRows, syncsToday] = await Promise.all([
      db.select().from(syncLog).orderBy(desc(syncLog.startedAt)).limit(1),
      getSyncsToday(),
    ]);

    res.json({
      data: {
        lastSync: lastSyncRows[0] ?? null,
        syncsToday,
        dailyLimit: DAILY_SYNC_LIMIT,
      },
      error: null,
    });
  } catch (err) {
    logger.error('GET /sync/status failed', { message: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ data: null, error: 'Internal server error' });
  }
});

export default router;
