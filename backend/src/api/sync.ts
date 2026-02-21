import { Router, Request, Response } from 'express';
import { getDb } from '../db/client';
import { syncLog } from '../db/schema';
import { runSync } from '../jobs/sync';
import { logger } from '../lib/logger';
import { desc } from 'drizzle-orm';

const router = Router();

// POST /sync — trigger an on-demand sync
router.post('/', async (_req: Request, res: Response) => {
  try {
    // Fire and forget — return immediately; client polls /sync/status
    runSync().catch((err) => logger.error('On-demand sync failed', { message: err instanceof Error ? err.message : String(err) }));
    res.status(202).json({ data: { accepted: true }, error: null });
  } catch (err) {
    logger.error('POST /sync failed', { message: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ data: null, error: 'Internal server error' });
  }
});

// GET /sync/status — return the most recent sync log entry
router.get('/status', async (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(syncLog)
      .orderBy(desc(syncLog.startedAt))
      .limit(1);

    res.json({ data: rows[0] ?? null, error: null });
  } catch (err) {
    logger.error('GET /sync/status failed', { message: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ data: null, error: 'Internal server error' });
  }
});

export default router;
