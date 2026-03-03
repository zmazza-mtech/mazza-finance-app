/**
 * Integration tests for the Express API.
 *
 * These tests spin up the app (no real DB — uses in-memory db stub).
 * For a full DB integration test, the CI/CD pipeline would use a
 * test Postgres container. Here we focus on:
 *   - Request/response shape validation
 *   - Zod input validation (400 on bad input)
 *   - Route existence and HTTP method handling
 *   - 404 for unknown routes
 *
 * NOTE: DB-dependent endpoints return 500 without a live database — tests
 * that need a live DB are marked and skipped in CI without Postgres.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import supertest from 'supertest';
import app from '../../src/app';

const request = supertest(app);

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const res = await request.get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

// ---------------------------------------------------------------------------
// 404 for unknown routes
// ---------------------------------------------------------------------------

describe('Unknown routes', () => {
  it('returns 404 for unknown GET', async () => {
    const res = await request.get('/api/v1/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body.error).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Input validation — no DB required
// ---------------------------------------------------------------------------

describe('POST /api/v1/transactions — input validation', () => {
  it('returns 400 when accountId is missing', async () => {
    const res = await request
      .post('/api/v1/transactions')
      .send({ date: '2024-01-01', description: 'Test', amount: '-10.00' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when date format is invalid', async () => {
    const res = await request
      .post('/api/v1/transactions')
      .send({
        accountId: '550e8400-e29b-41d4-a716-446655440000',
        date: '01/01/2024', // wrong format
        description: 'Test',
        amount: '-10.00',
      });

    expect(res.status).toBe(400);
  });

  it('returns 400 when amount is not a decimal string', async () => {
    const res = await request
      .post('/api/v1/transactions')
      .send({
        accountId: '550e8400-e29b-41d4-a716-446655440000',
        date: '2024-01-01',
        description: 'Test',
        amount: 'ten dollars', // invalid
      });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/v1/recurring — input validation', () => {
  it('returns 400 for invalid frequency', async () => {
    const res = await request
      .post('/api/v1/recurring')
      .send({
        accountId: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Netflix',
        amount: '-15.99',
        frequency: 'daily', // not in enum
        nextDate: '2024-02-01',
      });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/forecast — input validation', () => {
  it('returns 400 when accountId is missing', async () => {
    const res = await request
      .get('/api/v1/forecast')
      .query({ startDate: '2024-01-01', endDate: '2024-01-31' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when dates are invalid format', async () => {
    const res = await request
      .get('/api/v1/forecast')
      .query({
        accountId: '550e8400-e29b-41d4-a716-446655440000',
        startDate: '2024/01/01',
        endDate: '2024/01/31',
      });

    expect(res.status).toBe(400);
  });
});

describe('PUT /api/v1/settings/:key — input validation', () => {
  it('returns 400 for unknown setting key', async () => {
    const res = await request
      .put('/api/v1/settings/unknown_key')
      .send({ value: 'something' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('unknown_key');
  });

  it('returns 400 when value is missing', async () => {
    const res = await request
      .put('/api/v1/settings/theme')
      .send({});

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Method not allowed basics
// ---------------------------------------------------------------------------

describe('HTTP method enforcement', () => {
  it('GET /api/v1/sync returns 404 (POST only)', async () => {
    const res = await request.get('/api/v1/sync');
    expect(res.status).toBe(404);
  });
});
