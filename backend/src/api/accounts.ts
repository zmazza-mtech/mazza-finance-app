import { Router, Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../db/client';
import { accounts } from '../db/schema';
import { UuidParamSchema } from '../lib/validate';
import { logger } from '../lib/logger';

const CreateManualAccountSchema = z.object({
  institution: z.string().min(1).max(100),
  name: z.string().min(1).max(100),
  type: z.enum(['checking', 'savings', 'credit']),
});

const UpdateAccountSchema = z.object({
  includeInView: z.boolean().optional(),
  isActive: z.boolean().optional(),
  lastBalance: z.string().regex(/^-?\d+(\.\d{1,2})?$/, 'Must be a decimal amount').optional(),
});

const router = Router();

// POST /accounts — create a manual account (no Teller ID)
router.post('/', async (req: Request, res: Response) => {
  const parsed = CreateManualAccountSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ data: null, error: parsed.error.flatten() });
  }

  try {
    const db = getDb();
    const rows = await db
      .insert(accounts)
      .values({
        tellerId: null,
        institution: parsed.data.institution,
        name: parsed.data.name,
        type: parsed.data.type,
        isActive: true,
        includeInView: true,
      })
      .returning();

    res.status(201).json({ data: rows[0], error: null });
  } catch (err) {
    logger.error('POST /accounts failed', { message: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ data: null, error: 'Internal server error' });
  }
});

// GET /accounts
router.get('/', async (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const rows = await db.select().from(accounts).orderBy(accounts.institution, accounts.name);
    res.json({ data: rows, error: null });
  } catch (err) {
    logger.error('GET /accounts failed', { message: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ data: null, error: 'Internal server error' });
  }
});

// GET /accounts/:id
router.get('/:id', async (req: Request, res: Response) => {
  const paramParsed = UuidParamSchema.safeParse(req.params);
  if (!paramParsed.success) {
    return res.status(400).json({ data: null, error: 'Invalid account id' });
  }

  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, paramParsed.data.id))
      .limit(1);

    if (rows.length === 0) {
      return res.status(404).json({ data: null, error: 'Account not found' });
    }

    res.json({ data: rows[0], error: null });
  } catch (err) {
    logger.error('GET /accounts/:id failed', { message: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ data: null, error: 'Internal server error' });
  }
});

// PATCH /accounts/:id (include/exclude from view, active toggle)
router.patch('/:id', async (req: Request, res: Response) => {
  const paramParsed = UuidParamSchema.safeParse(req.params);
  if (!paramParsed.success) {
    return res.status(400).json({ data: null, error: 'Invalid account id' });
  }

  const bodyParsed = UpdateAccountSchema.safeParse(req.body);
  if (!bodyParsed.success) {
    return res.status(400).json({ data: null, error: bodyParsed.error.flatten() });
  }

  if (Object.keys(bodyParsed.data).length === 0) {
    return res.status(400).json({ data: null, error: 'No fields to update' });
  }

  try {
    const db = getDb();

    const existing = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, paramParsed.data.id))
      .limit(1);

    if (existing.length === 0) {
      return res.status(404).json({ data: null, error: 'Account not found' });
    }

    // Build update object with only the defined fields (exactOptionalPropertyTypes safe)
    const updates: { includeInView?: boolean; isActive?: boolean; lastBalance?: string; updatedAt: Date } = {
      updatedAt: new Date(),
    };
    if (bodyParsed.data.includeInView !== undefined) updates.includeInView = bodyParsed.data.includeInView;
    if (bodyParsed.data.isActive !== undefined) updates.isActive = bodyParsed.data.isActive;
    if (bodyParsed.data.lastBalance !== undefined) updates.lastBalance = bodyParsed.data.lastBalance;

    const rows = await db
      .update(accounts)
      .set(updates)
      .where(eq(accounts.id, paramParsed.data.id))
      .returning();

    res.json({ data: rows[0], error: null });
  } catch (err) {
    logger.error('PATCH /accounts/:id failed', { message: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ data: null, error: 'Internal server error' });
  }
});

export default router;
