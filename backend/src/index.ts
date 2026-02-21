import 'dotenv/config';
import { runMigrations } from './db/migrate';
import { startHourlySyncJob } from './jobs/hourly-sync';
import { logger } from './lib/logger';
import app from './app';

// ---------------------------------------------------------------------------
// Required env vars
// ---------------------------------------------------------------------------

const required = [
  'DATABASE_URL',
  'ENCRYPTION_KEY',
  'CORS_ORIGIN',
  'TELLER_CERT_PATH',
  'TELLER_KEY_PATH',
];

for (const key of required) {
  if (!process.env[key]) {
    logger.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

// Validate ENCRYPTION_KEY is exactly 64 hex characters (32 bytes for AES-256)
if (!/^[0-9a-fA-F]{64}$/.test(process.env.ENCRYPTION_KEY ?? '')) {
  logger.error('ENCRYPTION_KEY must be a 64-character hex string (generate with: openssl rand -hex 32)');
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

  // 3. Schedule hourly sync
  startHourlySyncJob();

  // 4. Run an initial sync on startup
  const { runSync } = await import('./jobs/sync');
  runSync().catch((err) => logger.error('Initial sync failed', { err }));
}

main().catch((err) => {
  logger.error('Startup failed', { err });
  process.exit(1);
});
