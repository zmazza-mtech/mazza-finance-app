# Context Session: Backend Development
Created: 2026-02-20
Status: in_progress
Project: /Users/zac-momoski-tech/code/mazza-finance
Context File: /Users/zac-momoski-tech/code/mazza-finance/.claude/tasks/context_session_backend-development.md

## Task Type
Backend Development — Node.js + TypeScript + Express + Drizzle + Postgres

## Goals
Implement the full Mazza Finance backend following strict TDD (tests written
BEFORE implementation code). See `docs/PRD.md` for complete specification.

Working directory: `/Users/zac-momoski-tech/code/mazza-finance/backend/`

## Tech Stack
- Node.js 20 + TypeScript (strict mode)
- Express — REST API
- Drizzle ORM — type-safe DB access (NO raw SQL without security review)
- Zod — ALL request validation
- decimal.js — ALL financial arithmetic (never parseFloat/Number on money)
- node-cron — hourly sync job
- Winston — structured JSON logging with sanitization
- Vitest + supertest — testing

## Key Architectural Rules

### Financial Arithmetic
- NEVER use `parseFloat()` or `Number()` on financial values
- Use `decimal.js` for all arithmetic in the forecast engine
- Configure Drizzle NUMERIC columns with `mapFromDriverValue: (v) => String(v)`
  so DB amounts always come back as strings, never JS floats
- JSON response amounts are always decimal strings

### Encryption
- Algorithm: AES-256-GCM
- Nonce: `crypto.randomBytes(12)` — new nonce per encryption operation
- Storage format: `nonce_hex:ciphertext_hex:auth_tag_hex`
- Decryption: auth tag verification failure must throw — never silently continue
- Key: from `ENCRYPTION_KEY` env var (32-byte hex)

### Input Validation
- Every write endpoint (`POST`, `PATCH`, `DELETE`) must have a Zod schema
- UUID path params must be validated before reaching DB queries
- Date query params must be ISO 8601 `YYYY-MM-DD`
- `GET /forecast` must enforce max 366-day range
- `PATCH /settings` must reject any key not in: `balance_threshold_green`,
  `balance_threshold_yellow`, `theme`, `last_sync_at`
- Text fields: max 500 characters

### Logging Sanitization
- NEVER log: access tokens, ENCRYPTION_KEY, DATABASE_URL, request/response bodies
  containing financial amounts or account identifiers
- teller.io HTTP errors: log status code and sanitized message only — NOT the
  full error object (which contains Authorization headers)
- sync_log entries: counts and status codes only — no individual transaction details

### Sync Concurrency
- Check for `status = 'running'` in sync_log before starting any sync
- `POST /sync`: rate-limit to once per 5 minutes; return 409 if in progress
- `next_date` advancement in reconciliation: use `SELECT ... FOR UPDATE`

### Security
- CORS: explicit origin from `CORS_ORIGIN` env var — never wildcard
- Raw SQL in Drizzle: prohibited without explicit comment justification

## API Surface (18 endpoints)

Base path: `/api/v1`
All responses: `{ data: ..., error: null }` or `{ data: null, error: { code, message } }`

```
GET    /accounts
PATCH  /accounts/:id
GET    /transactions         (query: account_id, start, end)
POST   /transactions
PATCH  /transactions/:id
DELETE /transactions/:id
GET    /recurring            (query: status filter)
POST   /recurring
PATCH  /recurring/:id
DELETE /recurring/:id
POST   /recurring/:id/overrides
DELETE /recurring/:id/overrides/:overrideId
GET    /forecast             (query: account_id, start, end — max 366 days)
POST   /sync                 (rate-limited, 202 Accepted async)
GET    /sync/status
GET    /settings
PATCH  /settings             (allowlisted keys only)
POST   /setup/connect        (409 if credentials already exist)
```

## Data Model (6 tables)

See `docs/PRD.md` Section 6 for full schema. Key points:
- All PKs: UUID via `gen_random_uuid()`
- `recurring_transactions.status`: `active | disabled | pending_review | ended`
- `sync_log.status`: `running | success | partial | failed`
- `app_settings.key`: restricted to 4 known values

## Forecast Algorithm

See `docs/PRD.md` Section 8 (Forecast Computation). Uses decimal.js for all
balance arithmetic. Returns `{ date, transactions[], daily_net, running_balance }`
with all monetary values as decimal strings.

## TDD Requirements

Write tests BEFORE implementation. Test output must be pristine.

### Unit Tests Required
- AES-256-GCM utility: encrypt/decrypt roundtrip, auth tag failure hard-error,
  unique nonce per call
- Forecast engine: balance calculation, override application, series expansion,
  decimal precision
- Auto-detection heuristics: grouping, interval clustering, amount variance
- Auto-reconciliation: match logic, `next_date` advancement, no-match behavior
- Zod schemas: valid inputs, invalid inputs, edge cases for each endpoint

### Integration Tests Required
- All 18 API endpoints: happy path + error cases + validation rejection
- Auth: write endpoints reject requests without Basic Auth (Caddy handles this,
  but middleware should still be testable)
- `POST /sync`: rate limiting (second call within 5 min → 429), concurrent (→ 409)
- `POST /setup/connect`: second call with same enrollment_id → 409
- Settings: unknown key → 400

### E2E Test
- Full flow: setup connect → sync → forecast → add manual transaction →
  forecast reflects transaction

## Files to Create

```
backend/
├── src/
│   ├── index.ts              # Express app entry point
│   ├── app.ts                # App factory (for testing)
│   ├── api/
│   │   ├── accounts.ts
│   │   ├── transactions.ts
│   │   ├── recurring.ts
│   │   ├── forecast.ts
│   │   ├── sync.ts
│   │   ├── settings.ts
│   │   └── setup.ts
│   ├── db/
│   │   ├── client.ts         # Drizzle client
│   │   ├── schema.ts         # All 6 table schemas
│   │   └── migrations/       # Drizzle migration files
│   ├── services/
│   │   ├── forecast.ts       # Forecast computation engine
│   │   ├── sync.ts           # Sync orchestrator
│   │   ├── reconciliation.ts # Auto-reconciliation logic
│   │   └── detection.ts      # Recurring detection heuristics
│   ├── jobs/
│   │   └── hourly-sync.ts    # node-cron job
│   └── lib/
│       ├── crypto.ts         # AES-256-GCM utility
│       ├── logger.ts         # Winston with sanitization
│       ├── teller-client.ts  # teller.io API client (mTLS)
│       └── validate.ts       # Shared Zod schemas
├── tests/
│   ├── unit/
│   │   ├── crypto.test.ts
│   │   ├── forecast.test.ts
│   │   ├── detection.test.ts
│   │   └── reconciliation.test.ts
│   └── integration/
│       ├── accounts.test.ts
│       ├── transactions.test.ts
│       ├── recurring.test.ts
│       ├── forecast.test.ts
│       ├── sync.test.ts
│       └── settings.test.ts
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── drizzle.config.ts
```

## Agent Activity Log
<!-- Subagents MUST append their entries below this line -->

### Template for Subagent Entries:
**Agent**: <agent-type>
**Started**: <YYYY-MM-DD HH:MM>
**Completed**: <YYYY-MM-DD HH:MM>
**Status**: <success|blocked|error>
**Task**: <what the agent was asked to do>
**Findings**: <key findings>
**Actions Taken**: <what was done>
**Blockers/Issues**: <any problems encountered>
**Files Modified**: <list of files changed>

---
