import { Hono } from 'hono';

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  ENCRYPTION_KEY: string;
}

const app = new Hono<{ Bindings: Env }>();

// Same `{ data, error }` envelope as the Express backend — the frontend
// client is unchanged by the port.
app.get('/api/v1/health', (c) => c.json({ data: { status: 'ok' }, error: null }));

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
