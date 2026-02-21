import { Router, Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import { accounts } from '../db/schema';
import { logger } from '../lib/logger';

const router = Router();

// GET /accounts
router.get('/', async (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const rows = await db.select().from(accounts).orderBy(accounts.institution, accounts.name);
    res.json({ data: rows, error: null });
  } catch (err) {
    logger.error('GET /accounts failed', { err });
    res.status(500).json({ data: null, error: 'Internal server error' });
  }
});

// GET /accounts/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, req.params.id!))
      .limit(1);

    if (rows.length === 0) {
      return res.status(404).json({ data: null, error: 'Account not found' });
    }

    res.json({ data: rows[0], error: null });
  } catch (err) {
    logger.error('GET /accounts/:id failed', { err });
    res.status(500).json({ data: null, error: 'Internal server error' });
  }
});

export default router;
