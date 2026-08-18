import { Hono } from 'hono';
import accounts from './api/accounts.js';
import settings from './api/settings.js';
import transactions from './api/transactions.js';
import recurring from './api/recurring.js';
import forecast from './api/forecast.js';
import reports from './api/reports.js';
import type { Env } from './env.js';

export type { Env };

const app = new Hono<{ Bindings: Env }>();

// Same `{ data, error }` envelope as the Express backend — the frontend
// client is unchanged by the port.
app.get('/api/v1/health', (c) => c.json({ data: { status: 'ok' }, error: null }));

// Routers, mounted under the same prefix the Express app used so the frontend
// client's base URL is unchanged by the port (#68).
app.route('/api/v1/accounts', accounts);
app.route('/api/v1/settings', settings);
app.route('/api/v1/transactions', transactions);
app.route('/api/v1/recurring', recurring);
app.route('/api/v1/forecast', forecast);
app.route('/api/v1/reports', reports);

app.notFound((c) => {
  if (new URL(c.req.url).pathname.startsWith('/api/')) {
    return c.json({ data: null, error: 'Not found' }, 404);
  }
  // Non-API paths are served by the assets binding (SPA fallback) before the
  // Worker runs; reaching here means assets are not configured (tests).
  return c.text('Not found', 404);
});

app.onError((err, c) => {
  console.error('unhandled error', { message: err.message });
  return c.json({ data: null, error: 'Internal server error' }, 500);
});

export default app;
