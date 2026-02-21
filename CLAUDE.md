# CLAUDE.md — Mazza Finance

Personal cash flow forecasting app for Mr. and Mrs. Mazza.
Full specification: [`docs/PRD.md`](docs/PRD.md)

---

## Project Overview

A self-hosted SPA that shows a vertical calendar timeline of actual and
forecasted bank transactions with a cumulative running balance. Connects to
bank accounts via teller.io. Deployed via Docker Compose on a home server.

---

## Tech Stack

| Layer       | Technology                                      |
|-------------|-------------------------------------------------|
| Frontend    | React 18 + TypeScript + Vite                    |
| Styling     | Tailwind CSS (class-based dark/light)           |
| State       | TanStack Query v5                               |
| Routing     | React Router v6                                 |
| Backend     | Node.js + Express + TypeScript                  |
| Decimal     | decimal.js — ALL financial arithmetic           |
| Validation  | Zod — ALL request validation                    |
| ORM         | Drizzle ORM                                     |
| Database    | PostgreSQL 16                                   |
| Scheduler   | node-cron                                       |
| Proxy       | Caddy (HTTPS, Basic Auth, CSP headers)          |
| Testing     | Vitest (backend) + Playwright (E2E)             |
| Containers  | Docker + Docker Compose                         |

---

## Directory Structure

```
mazza-finance/
├── backend/
│   ├── src/
│   │   ├── api/          # Express route handlers
│   │   ├── db/           # Drizzle schema, migrations, client
│   │   ├── services/     # Business logic (forecast, sync, detection)
│   │   ├── jobs/         # node-cron scheduled jobs
│   │   └── lib/          # Shared utilities (crypto, logger, decimal)
│   ├── tests/
│   │   ├── unit/
│   │   └── integration/
│   ├── Dockerfile
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── components/   # Reusable UI components
│   │   ├── pages/        # Route-level page components
│   │   ├── hooks/        # TanStack Query hooks
│   │   ├── api/          # API client + type definitions
│   │   └── lib/          # Shared utilities
│   ├── tests/
│   │   ├── unit/
│   │   └── e2e/          # Playwright tests
│   ├── Dockerfile
│   ├── package.json
│   └── tsconfig.json
├── docs/
│   └── PRD.md            # Full product requirements document
├── .claude/
│   └── tasks/            # Subagent context files
├── docker-compose.yml
├── Caddyfile
├── .env.example
├── .gitignore
├── CLAUDE.md             # This file
└── README.md
```

---

## Critical Implementation Rules

### Financial Arithmetic
- **NEVER use `parseFloat()`, `Number()`, or native JS arithmetic on money**
- All amounts use `decimal.js` throughout the backend
- Drizzle NUMERIC columns must use `mapFromDriverValue` to return strings
- JSON amounts are always decimal strings: `"amount": "-15.99"`

### Security
- `dangerouslySetInnerHTML` is **prohibited** for any user or bank data
- All teller.io API response strings must be HTML-sanitized before DB insertion
- CORS must use explicit origin allowlist — never `cors({ origin: '*' })`
- Drizzle raw SQL (`.execute()`) requires explicit security justification
- Zod validation is **required** on every write endpoint — no exceptions

### Authentication
- Caddy HTTP Basic Auth gates all routes (configured in Caddyfile)
- Credentials set via Caddy's `caddy hash-password` utility (see README)

### Token Encryption
- Algorithm: AES-256-GCM
- Per-operation random 96-bit nonce via `crypto.randomBytes(12)`
- Storage format: `nonce_hex:ciphertext_hex:auth_tag_hex`
- Decryption auth tag failure = hard error; never swallow silently

### Containers
- Backend runs as `USER node` (UID 1001) — never root
- `cap_drop: ALL` on backend service
- Postgres has **no `ports:` mapping** — internal network only
- Backend `mem_limit: 512m`, `cpus: 0.5`

---

## Certificate Paths (on this host)

```
TELLER_CERT_PATH=~/.ssh/teller_public_certificate.pem
TELLER_KEY_PATH=~/.ssh/teller_private_key.pem
```

These are bind-mounted into the backend container at runtime. Never copy them
into the project directory. They are `chmod 600` / `chmod 644` as required.

---

## Environment Setup

Copy `.env.example` to `.env` and fill in values:
```bash
cp .env.example .env
# Generate encryption key:
openssl rand -hex 32
```

See `README.md` for full setup instructions including Caddy Basic Auth setup.

---

## Running Locally

```bash
# Start all services
docker compose up --build

# Backend tests
cd backend && npm test

# Frontend build check
cd frontend && npm run build

# E2E tests (requires running stack)
cd frontend && npx playwright test
```

---

## TDD Requirement

Per project rules, tests are written **before** implementation code.
Test output must be pristine — no ignored failures.

Required coverage per the PRD:
- Backend: unit + integration tests (Vitest)
- Frontend: unit + integration tests (Vitest/Testing Library)
- E2E: Playwright tests for critical user flows
