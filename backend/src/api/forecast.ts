import { Router, Request, Response } from 'express';
import Decimal from 'decimal.js';
import { and, eq, gte, lte } from 'drizzle-orm';
import { getDb } from '../db/client';
import { transactions, recurringTransactions, recurringOverrides, accounts } from '../db/schema';
import { ForecastQuerySchema } from '../lib/validate';
import {
  expandRecurringSeries,
  applyOverrides,
  computeForecast,
  type RecurringDef,
  type OverrideDef,
  type ActualTransaction,
} from '../services/forecast';
import { logger } from '../lib/logger';

const router = Router();

// GET /forecast?accountId=&startDate=&endDate=
router.get('/', async (req: Request, res: Response) => {
  const parsed = ForecastQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ data: null, error: parsed.error.flatten() });
  }

  const { accountId, startDate, endDate } = parsed.data;

  try {
    const db = getDb();

    // Fetch account to get seed balance
    const accountRows = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, accountId))
      .limit(1);

    if (accountRows.length === 0) {
      return res.status(404).json({ data: null, error: 'Account not found' });
    }

    // Fetch actual + manual transactions in range
    const txRows = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.accountId, accountId),
          gte(transactions.date, startDate),
          lte(transactions.date, endDate)
        )
      );

    // If lastBalance is set and the view starts in the past, back-calculate the
    // opening balance at startDate so historical running balances are accurate.
    // seedBalance = lastBalance - sum(all transactions from startDate to today)
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

    // Fetch active recurring series for this account
    const recurringRows = await db
      .select()
      .from(recurringTransactions)
      .where(
        and(
          eq(recurringTransactions.accountId, accountId),
          eq(recurringTransactions.status, 'active')
        )
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

    // Fetch overrides for those series
    const seriesIds = series.map((s) => s.id);
    const overrideRows = seriesIds.length > 0
      ? await db
          .select()
          .from(recurringOverrides)
          .where(
            and(
              gte(recurringOverrides.originalDate, startDate),
              lte(recurringOverrides.originalDate, endDate)
            )
          )
      : [];

    const overrides: OverrideDef[] = overrideRows
      .filter((o) => seriesIds.includes(o.recurringTransactionId))
      .map((o) => ({
        recurringTransactionId: o.recurringTransactionId,
        originalDate: o.originalDate,
        overrideType: o.overrideType as OverrideDef['overrideType'],
        overrideDate: o.overrideDate ?? null,
        overrideAmount: o.overrideAmount ?? null,
        overrideName: o.overrideName ?? null,
      }));

    // Expand recurring series and apply overrides
    const allInstances = series.flatMap((s) =>
      expandRecurringSeries(s, startDate, endDate)
    );
    const instances = applyOverrides(allInstances, overrides);

    // Compute forecast
    const days = computeForecast(
      actuals,
      instances,
      manuals,
      startDate,
      endDate,
      seedBalance
    );

    res.json({ data: days, error: null });
  } catch (err) {
    logger.error('GET /forecast failed', { message: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ data: null, error: 'Internal server error' });
  }
});

export default router;
