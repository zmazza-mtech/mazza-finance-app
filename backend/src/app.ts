import express from 'express';
import cors from 'cors';
import accountsRouter from './api/accounts';
import enrollRouter from './api/enroll';
import transactionsRouter from './api/transactions';
import recurringRouter from './api/recurring';
import forecastRouter from './api/forecast';
import syncRouter from './api/sync';
import settingsRouter from './api/settings';
import { logger } from './lib/logger';

const app = express();

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

// Body parsing — cap at 100kb to prevent request flooding
app.use(express.json({ limit: '100kb' }));

// CORS — explicit allowlist; wildcard prohibited
const corsOrigin = process.env.CORS_ORIGIN;
if (!corsOrigin) {
  throw new Error('CORS_ORIGIN must be set');
}

app.use(
  cors({
    origin: corsOrigin,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type'],
    credentials: false, // no cookies — Caddy Basic Auth only
  })
);

// Request logging — path only, never query params (may contain sensitive data)
app.use((req, _res, next) => {
  logger.info('Request', { method: req.method, path: req.path });
  next();
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const API_PREFIX = '/api/v1';

app.use(`${API_PREFIX}/accounts`, accountsRouter);
app.use(`${API_PREFIX}/enroll`, enrollRouter);
app.use(`${API_PREFIX}/transactions`, transactionsRouter);
app.use(`${API_PREFIX}/recurring`, recurringRouter);
app.use(`${API_PREFIX}/forecast`, forecastRouter);
app.use(`${API_PREFIX}/sync`, syncRouter);
app.use(`${API_PREFIX}/settings`, settingsRouter);

// Health check — no auth required (Caddy allows this path)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ data: null, error: 'Not found' });
});

// Error handler — never expose stack traces to client
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error', { message: err.message });
  res.status(500).json({ data: null, error: 'Internal server error' });
});

export default app;
