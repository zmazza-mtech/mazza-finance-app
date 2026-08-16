# CLAUDE.md — Mazza Finance

Personal cash flow forecasting app for Mr. and Mrs. Mazza.
Full specification: [`docs/PRD.md`](docs/PRD.md)

---

## Project Overview

A self-hosted SPA that shows a vertical calendar timeline of actual and
forecasted bank transactions with a cumulative running balance. Connects to
bank accounts via SimpleFIN ($1.50/month). Deployed via Docker Compose on a
home server.

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
| Bank Data   | SimpleFIN Bridge (24 polls/day limit)           |
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
│   │   ├── jobs/         # Demand-driven sync job
│   │   └── lib/          # Shared utilities (simplefin client, logger, decimal)
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
- All SimpleFIN API response strings must be HTML-sanitized before DB insertion
- SimpleFIN `errors` array must be logged and surfaced to user
- CORS must use explicit origin allowlist — never `cors({ origin: '*' })`
- Drizzle raw SQL (`.execute()`) requires explicit security justification
- Zod validation is **required** on every write endpoint — no exceptions

### Authentication
- Caddy HTTP Basic Auth gates all routes (configured in Caddyfile)
- Credentials set via Caddy's `caddy hash-password` utility (see README)

### SimpleFIN Access URL
- Stored as a Docker Compose secret at `/run/secrets/simplefin_access_url`
- Read via `readSecret('SIMPLEFIN_ACCESS_URL')` helper (checks `_FILE` env var first)
- Never stored in the database — env/secret only

### Containers
- Backend runs as `USER node` (UID 1001) — never root
- `cap_drop: ALL` on backend service
- Postgres has **no `ports:` mapping** — internal network only
- Backend `mem_limit: 512m`, `cpus: 0.5`

---

## SimpleFIN Setup

1. Create `secrets/simplefin_access_url.txt` with your SimpleFIN Access URL
2. `chmod 600 secrets/simplefin_access_url.txt`
3. Docker Compose mounts it as a secret at `/run/secrets/simplefin_access_url`

Rate limit: 24 polls per day (rolling, resets at midnight UTC). Exceeding the
limit permanently disables the token. Syncs are demand-driven — auto on first
page load of the day, then manual "Sync Now" button.

---

## Environment Setup

Copy `.env.example` to `.env` and fill in values:
```bash
cp .env.example .env
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

---

## Work tracking

Managed through GitHub Issues in `zmazza-mtech/mazza-finance-app`. Conventions are
injected by the mt-github-tracking plugin; this section holds only what is
specific to this project.

**Tracking epic:** issue #1 — read it before starting anything. It carries the
design invariants (decimal.js for money, Zod on every write, SimpleFIN's 24-poll
ceiling, container hardening) and the checklist of every issue.

**Milestones:**
- `Test & CI Hardening` — Playwright E2E suite, integration coverage for
  post-MVP endpoints, CI workflow
- `Categorization v1` — trustworthy and correctable auto-categorization
- `Reporting v1` — reporting surface beyond the existing Sankey
- `Production Hardening` — reconciliation surfacing, backups, open UX TODOs

**Labels beyond the defaults:** `epic`, `backend`, `frontend`, `database`,
`security`, `infra`, `testing`, `simplefin`

**Project board:** Mazza Finance (user project #4) — a view, never a source of
truth. Backlog = `no:milestone`.
