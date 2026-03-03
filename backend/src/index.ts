import 'dotenv/config';
import { runMigrations } from './db/migrate';
import { logger } from './lib/logger';
import { readSecret } from './lib/read-secret';
import app from './app';

// ---------------------------------------------------------------------------
// Required env vars
// ---------------------------------------------------------------------------

const required = [
  'DATABASE_URL',
  'CORS_ORIGIN',
];

for (const key of required) {
  if (!process.env[key]) {
    logger.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

// Validate SimpleFIN Access URL is available (via file or env var)
if (!readSecret('SIMPLEFIN_ACCESS_URL')) {
  logger.error('SIMPLEFIN_ACCESS_URL is not configured. Set SIMPLEFIN_ACCESS_URL_FILE or SIMPLEFIN_ACCESS_URL.');
  process.exit(1);
}

const PORT = parseInt(process.env.PORT ?? '3001', 10);

// ---------------------------------------------------------------------------
// Startup sequence
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // 1. Run database migrations
  logger.info('Running database migrations...');
  await runMigrations();
  logger.info('Migrations complete');

  // 2. Start HTTP server
  app.listen(PORT, '0.0.0.0', () => {
    logger.info(`Backend listening on port ${PORT}`);
  });

  // Syncs are demand-driven — triggered by frontend on first page load of
  // the day and via manual "Sync Now". No cron job needed.
}

main().catch((err) => {
  logger.error('Startup failed', { err });
  process.exit(1);
});
