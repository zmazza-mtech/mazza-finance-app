/**
 * Forecast — ported from `backend/src/api/forecast.ts` (#68).
 *
 * The pipeline is the unchanged service layer, imported from the Express tree
 * (see the transactions router for why it is imported rather than copied).
 * What changes is the scoping: every read is filtered by household, including
 * the override read, which Express filtered by date alone and then narrowed
 * in JS.
 */
import { Hono } from 'hono';
import Decimal from 'decimal.js';
import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { accounts, recurringOverrides, recurringTransactions, transactions } from '../db/schema.js';
import { currentHouseholdId } from '../db/household.js';
import { ok, fail, serverError } from '../lib/envelope.js';
import { ForecastQuerySchema } from '../lib/validate.js';
import {
  expandRecurringSeries,
  applyOverrides,
  computeForecast,
  reconcileInstances,
  type ActualTransaction,
  type OverrideDef,
  type RecurringDef,
} from '../../../backend/src/services/forecast.js';
import type { Env } from '../env.js';

/** D1 binds at most 100 parameters per query. */
const ID_BATCH = 90;

const app = new Hono<{ Bindings: Env }>();

// GET /forecast?accountId=&startDate=&endDate=
app.get('/', async (c) => {
  const parsed = ForecastQuerySchema.safeParse(
    Object.fromEntries(new URL(c.req.url).searchParams),
  );
  if (!parsed.success) return fail(c, parsed.error.flatten(), 400);

  const { accountId, startDate, endDate } = parsed.data;

  try {
    const db = getDb(c.env.DB);
    const householdId = currentHouseholdId();

    const accountRows = await db
      .select()
      .from(accounts)
      .where(and(eq(accounts.id, accountId), eq(accounts.householdId, householdId)))
      .limit(1);

    if (accountRows.length === 0) return fail(c, 'Account not found', 404);

    const txRows = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.accountId, accountId),
          eq(transactions.householdId, householdId),
          gte(transactions.date, startDate),
          lte(transactions.date, endDate),
        ),
      );

    // If lastBalance is set and the view starts in the past, back-calculate
    // the opening balance at startDate so historical running balances are
    // accurate: seedBalance = lastBalance - sum(startDate..today).
    const lastBalance = accountRows[0]!.lastBalance;
    const serverToday = new Date().toISOString().slice(0, 10);
    let seedBalance: string;
    if (lastBalance && startDate < serverToday) {
      const historicalSum = txRows
        .filter((t) => String(t.date) <= serverToday)
        .reduce((sum, t) => sum.plus(new Decimal(String(t.amount))), new Decimal(0));
      seedBalance = new Decimal(lastBalance).minus(historicalSum).toFixed(2);
    } else {
      seedBalance = lastBalance ?? '0';
    }

    const actuals: ActualTransaction[] = txRows
      .filter((t) => t.type === 'actual')
      .map((t) => ({
        id: t.id,
        date: t.date,
        description: t.description,
        amount: t.amount,
        type: 'actual' as const,
      }));

    const manuals: ActualTransaction[] = txRows
      .filter((t) => t.type === 'manual')
      .map((t) => ({
        id: t.id,
        date: t.date,
        description: t.description,
        amount: t.amount,
        type: 'manual' as const,
      }));

    const recurringRows = await db
      .select()
      .from(recurringTransactions)
      .where(
        and(
          eq(recurringTransactions.accountId, accountId),
          eq(recurringTransactions.householdId, householdId),
          eq(recurringTransactions.status, 'active'),
        ),
      );

    const series: RecurringDef[] = recurringRows.map((r) => ({
      id: r.id,
      accountId: r.accountId,
      name: r.name,
      amount: r.amount,
      frequency: r.frequency as RecurringDef['frequency'],
      nextDate: r.nextDate,
      endDate: r.endDate ?? null,
      status: r.status as RecurringDef['status'],
    }));

    // Overrides for those series, narrowed in SQL by series id as well as by
    // date. Express filtered by date alone and discarded the rest in JS,
    // which reads every household's overrides for that window.
    const seriesIds = series.map((s) => s.id);
    const overrideRows: (typeof recurringOverrides.$inferSelect)[] = [];
    for (let i = 0; i < seriesIds.length; i += ID_BATCH) {
      const slice = seriesIds.slice(i, i + ID_BATCH);
      const rows = await db
        .select()
        .from(recurringOverrides)
        .where(
          and(
            eq(recurringOverrides.householdId, householdId),
            inArray(recurringOverrides.recurringTransactionId, slice),
            gte(recurringOverrides.originalDate, startDate),
            lte(recurringOverrides.originalDate, endDate),
          ),
        );
      overrideRows.push(...rows);
    }

    const overrides: OverrideDef[] = overrideRows.map((o) => ({
      recurringTransactionId: o.recurringTransactionId,
      originalDate: o.originalDate,
      overrideType: o.overrideType as OverrideDef['overrideType'],
      overrideDate: o.overrideDate ?? null,
      overrideAmount: o.overrideAmount ?? null,
      overrideName: o.overrideName ?? null,
    }));

    const allInstances = series.flatMap((s) => expandRecurringSeries(s, startDate, endDate));
    const overridden = applyOverrides(allInstances, overrides);

    // Drop instances a posted transaction already covers, so a bill that was
    // forecast and then paid is counted once rather than twice (#43).
    const instances = reconcileInstances(accountId, actuals, overridden);

    const days = computeForecast(actuals, instances, manuals, startDate, endDate, seedBalance);

    return ok(c, days);
  } catch (err) {
    return serverError(c, 'GET /forecast', err);
  }
});

export default app;
