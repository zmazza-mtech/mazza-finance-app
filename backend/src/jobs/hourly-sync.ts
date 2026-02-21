import cron from 'node-cron';
import { runSync } from './sync';
import { logger } from '../lib/logger';

/**
 * Schedules the sync job to run at the top of every hour.
 * Call this once during app startup.
 */
export function startHourlySyncJob(): void {
  cron.schedule('0 * * * *', async () => {
    logger.info('Hourly sync triggered');
    try {
      await runSync();
    } catch (err) {
      // runSync logs internally — this catch prevents unhandled rejections
      logger.error('Unhandled error in hourly sync job', { err });
    }
  });

  logger.info('Hourly sync job scheduled (every hour, on the hour)');
}
