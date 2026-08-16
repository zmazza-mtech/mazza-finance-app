import express from 'express';
import cors from 'cors';
import accountsRouter from './api/accounts';
import importRouter from './api/import';
import transactionsRouter from './api/transactions';
import recurringRouter from './api/recurring';
import forecastRouter from './api/forecast';
import syncRouter from './api/sync';
import settingsRouter from './api/settings';
import reportsRouter from './api/reports';
import { logger } from './lib/logger';

const app = express();

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

// Body parsing — 2mb to accommodate large CSV import batches
app.use(express.json({ limit: '2mb' }));

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
app.use(`${API_PREFIX}/import`, importRouter);
app.use(`${API_PREFIX}/transactions`, transactionsRouter);
app.use(`${API_PREFIX}/recurring`, recurringRouter);
app.use(`${API_PREFIX}/forecast`, forecastRouter);
app.use(`${API_PREFIX}/sync`, syncRouter);
app.use(`${API_PREFIX}/settings`, settingsRouter);
app.use(`${API_PREFIX}/reports`, reportsRouter);

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
  // body-parser rejects a malformed or oversized body before any route sees
  // it. Those are the client's fault and carry their own status; reporting
  // them as 500 tells the user the server broke when the upload was simply
  // too big.
  const status = (err as { status?: number; statusCode?: number }).status
    ?? (err as { statusCode?: number }).statusCode;
  const type = (err as { type?: string }).type;

  if (type === 'entity.too.large') {
    logger.warn('Request body too large', { message: err.message });
    return res.status(413).json({ data: null, error: 'Request body too large' });
  }

  if (type === 'entity.parse.failed') {
    logger.warn('Request body was not valid JSON', { message: err.message });
    return res.status(400).json({ data: null, error: 'Malformed JSON body' });
  }

  if (typeof status === 'number' && status >= 400 && status < 500) {
    logger.warn('Client error', { message: err.message, status });
    return res.status(status).json({ data: null, error: 'Bad request' });
  }

  logger.error('Unhandled error', { message: err.message });
  res.status(500).json({ data: null, error: 'Internal server error' });
});

export default app;
