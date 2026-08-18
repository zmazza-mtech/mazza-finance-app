/**
 * Accounts — ported 1:1 from `backend/src/api/accounts.ts` (#68).
 *
 * Every query takes the household as its first filter, and a row belonging to
 * another household is reported as absent rather than forbidden: a 403 would
 * confirm the row exists, which is itself a leak across the boundary the
 * tenancy is there to draw.
 */
import { Hono } from 'hono';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../db/client.js';
import { accounts } from '../db/schema.js';
import { currentHouseholdId } from '../db/household.js';
import { ok, fail, serverError } from '../lib/envelope.js';
import type { Env } from '../env.js';

const CreateManualAccountSchema = z.object({
  institution: z.string().min(1).max(100),
  name: z.string().min(1).max(100),
  type: z.enum(['checking', 'savings', 'credit']),
});

const UpdateAccountSchema = z.object({
  includeInView: z.boolean().optional(),
  isActive: z.boolean().optional(),
  lastBalance: z
    .string()
    .regex(/^-?\d+(\.\d{1,2})?$/, 'Must be a decimal amount')
    .optional(),
});

const UuidSchema = z.string().uuid();

/** A body that is absent or not JSON is a client error, never a 500. */
async function readJson(c: { req: { json: () => Promise<unknown> } }): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}

const app = new Hono<{ Bindings: Env }>();

// POST /accounts — create a manual account (no SimpleFIN ID)
app.post('/', async (c) => {
  const parsed = CreateManualAccountSchema.safeParse(await readJson(c));
  if (!parsed.success) return fail(c, parsed.error.flatten(), 400);

  try {
    const db = getDb(c.env.DB);
    const rows = await db
      .insert(accounts)
      .values({
        householdId: currentHouseholdId(),
        simplefinId: null,
        institution: parsed.data.institution,
        name: parsed.data.name,
        type: parsed.data.type,
        isActive: true,
        includeInView: true,
      })
      .returning();

    return ok(c, rows[0], 201);
  } catch (err) {
    return serverError(c, 'POST /accounts', err);
  }
});

// GET /accounts
app.get('/', async (c) => {
  try {
    const db = getDb(c.env.DB);
    const rows = await db
      .select()
      .from(accounts)
      .where(eq(accounts.householdId, currentHouseholdId()))
      .orderBy(accounts.institution, accounts.name);

    return ok(c, rows);
  } catch (err) {
    return serverError(c, 'GET /accounts', err);
  }
});

// GET /accounts/:id
app.get('/:id', async (c) => {
  const id = UuidSchema.safeParse(c.req.param('id'));
  if (!id.success) return fail(c, 'Invalid account id', 400);

  try {
    const db = getDb(c.env.DB);
    const rows = await db
      .select()
      .from(accounts)
      .where(and(eq(accounts.id, id.data), eq(accounts.householdId, currentHouseholdId())))
      .limit(1);

    if (rows.length === 0) return fail(c, 'Account not found', 404);
    return ok(c, rows[0]);
  } catch (err) {
    return serverError(c, 'GET /accounts/:id', err);
  }
});

// PATCH /accounts/:id — include/exclude from view, active toggle, balance
app.patch('/:id', async (c) => {
  const id = UuidSchema.safeParse(c.req.param('id'));
  if (!id.success) return fail(c, 'Invalid account id', 400);

  const parsed = UpdateAccountSchema.safeParse(await readJson(c));
  if (!parsed.success) return fail(c, parsed.error.flatten(), 400);

  // An empty body is rejected rather than answered with an unchanged row: a
  // 200 there reads as "saved" for a request that saved nothing.
  if (Object.keys(parsed.data).length === 0) return fail(c, 'No fields to update', 400);

  try {
    const db = getDb(c.env.DB);
    const scope = and(eq(accounts.id, id.data), eq(accounts.householdId, currentHouseholdId()));

    const existing = await db.select().from(accounts).where(scope).limit(1);
    if (existing.length === 0) return fail(c, 'Account not found', 404);

    const updates: {
      includeInView?: boolean;
      isActive?: boolean;
      lastBalance?: string;
      updatedAt: string;
    } = { updatedAt: new Date().toISOString() };
    if (parsed.data.includeInView !== undefined) updates.includeInView = parsed.data.includeInView;
    if (parsed.data.isActive !== undefined) updates.isActive = parsed.data.isActive;
    if (parsed.data.lastBalance !== undefined) updates.lastBalance = parsed.data.lastBalance;

    const rows = await db.update(accounts).set(updates).where(scope).returning();
    return ok(c, rows[0]);
  } catch (err) {
    return serverError(c, 'PATCH /accounts/:id', err);
  }
});

export default app;
