import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { join } from 'path';
import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

export async function runMigrations(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is required');

  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool);

  console.log('Running migrations...');
  // __dirname resolves to src/db/ in dev (tsx) and dist/db/ in production (node)
  await migrate(db, { migrationsFolder: join(__dirname, 'migrations') });
  console.log('Migrations complete.');

  await pool.end();
}

// Only auto-run when executed directly via `tsx src/db/migrate.ts`
if (require.main === module) {
  runMigrations().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}
