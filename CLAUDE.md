# CLAUDE.md — Mazza Finance

Personal cash flow forecasting app for Mr. and Mrs. Mazza.

- Product spec: [`docs/PRD.md`](docs/PRD.md)
- Architecture, and why it changed: [`docs/superpowers/specs/2026-08-17-cloudflare-native-replatform.md`](docs/superpowers/specs/2026-08-17-cloudflare-native-replatform.md)
- Tracking epic for the replatform: issue #63

---

## Read this first: there are two stacks

The app is mid-replatform. **Both exist right now, and confusing them wastes a
session.**

| | `worker/` | `backend/` + `frontend/` + Compose |
|---|---|---|
| Status | where all new work lands | frozen, feature-complete, still running the household's money |
| Runtime | Cloudflare Workers | Docker Compose on the home server |
| API | Hono | Express |
| Database | D1 (SQLite) | PostgreSQL 16 |
| Auth | JWT bearer, every route | Caddy HTTP Basic Auth |

**Default to `worker/`.** The Express tree is the reference implementation the
port was written against and is under a feature freeze (#65) — it takes bug
fixes that block the port, and nothing else. Issue #82 deletes it at cutover,
along with Caddy, Compose, mkcert and Postgres.

Services under `backend/src/services/` are the exception: they are pure
functions the Worker imports directly rather than copying, so that the
categorization, detection, forecast and reconciliation rules cannot drift
between two live implementations. #82 moves them into `worker/src/`.

---

## Project Overview

A self-hosted SPA showing a vertical calendar timeline of actual and forecast
bank transactions with a cumulative running balance. Bank data comes from
SimpleFIN ($1.50/month). The primary user is Mrs. Mazza on her iPhone, which is
what drives the PWA and Face ID work in Phases 3 and 4.

Cost target: **$0/month** plus the domain. Every decision to spend is recorded
in the replatform spec with its reasoning.

---

## Tech Stack — the Worker

| Layer | Technology |
|-------------|--------------------------------------------------|
| Frontend | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS (class-based dark/light) |
| State | TanStack Query v5 |
| Routing | React Router v6 |
| API | Hono on Cloudflare Workers |
| Decimal | decimal.js — ALL financial arithmetic |
| Validation | Zod — ALL request validation |
| ORM | Drizzle ORM (sqlite dialect) |
| Database | Cloudflare D1 |
| Auth | JWT bearer, verified against a JWKS |
| Bank Data | SimpleFIN Bridge (24 polls/day, per household) |
| Testing | Vitest + `@cloudflare/vitest-pool-workers` |

One Worker serves the Vite build and `/api/v1` from a single origin. That is
what removes CORS, the split-origin CSP, and Caddy.

**The auth provider is undecided** (#76). Clerk charges $25/mo for production
passkeys; WorkOS AuthKit includes them free to 1M MAU. The middleware is
provider-agnostic — `AUTH_ISSUER`, `AUTH_AUDIENCE`, `AUTH_JWKS_URL` — so this
is three settings, not a rewrite.

---

## Critical Implementation Rules

### Financial arithmetic

- **NEVER use `parseFloat()`, `Number()`, or native JS arithmetic on money.**
  The one exception is a dedup comparison key in the CSV importer, which
  compares and never stores or totals; it says so where it sits.
- All amounts are `decimal.js` in the service layer, decimal strings on the
  wire: `"amount": "-15.99"`.
- **NEVER aggregate or do arithmetic on an amount column in SQL.** D1 stores
  money as TEXT and SQLite coerces TEXT to a float to add it. Measured: three
  rows of `'0.10'` sum to `0.30000000000000004` as a JS `number`, and
  `'not-a-number'` silently reads as zero. Fetch the rows, sum with decimal.js
  (#69).

### Tenancy

- **Every query takes a household id and filters on it.** No exceptions, and
  no retrofit pass later — the schema has carried `household_id` since
  migration 0000.
- A row belonging to another household answers **404, never 403.** A 403
  confirms the row exists, which is itself a leak across the boundary.
- Household resolution is `currentHouseholdId()` in `worker/src/db/household.ts`,
  a constant until #89 replaces it with a JWT membership lookup. Call it;
  do not inline the constant.

### Security

- **No `/api` route without auth.** The gate is one middleware over
  `/api/v1/*`; `worker/src/api/routes.ts` enumerates every route and the suite
  asserts each 401s unauthenticated. Add a route, add it to that list.
- Zod validation on every write endpoint. No exceptions.
- Every auth failure answers `401 Unauthorized` and nothing more — "expired"
  versus "bad signature" tells an attacker which half to work on.
- `dangerouslySetInnerHTML` is prohibited for any user or bank data.
- SimpleFIN response strings are HTML-sanitized before insertion, and its
  `errors` array is surfaced, never swallowed.
- The SimpleFIN access URL is AES-256-GCM encrypted in D1. The master key
  lives in Wrangler secrets and **never** in the database, a log, or an error
  message.
- Raw SQL (`.execute()`) needs explicit security justification.

### D1 limits that change how code is written

These are not style preferences. Each one is a request that fails without it.

- **50 queries per Worker invocation** on the free tier, not 1,000. No query
  inside a loop over rows, series or accounts — batch it.
- **100 bound parameters per statement.** A bulk insert's row ceiling is
  therefore `floor(100 / columns)`; use `rowsPerInsert()` in
  `worker/src/db/limits.ts` rather than a constant, so adding a column lowers
  the ceiling automatically.
- **Time Travel retains 7 days** on the free tier, not 30. The 30 is the Paid
  figure.

### SimpleFIN

- 24 polls per day, **per household**, and exceeding it **permanently disables
  the token.** That is a cliff, not a rate limit.
- Every caller holds the guard in `worker/src/services/sync-guard.ts` first.
  Refusals happen before a poll is spent — a refused attempt is not a poll and
  must not consume budget.
- A failed or abandoned poll still counts. SimpleFIN counted it.

---

## Running locally

```bash
# Build the SPA — wrangler serves ../frontend/dist as static assets
cd frontend && npm run build

# Apply migrations to the local D1 once
cd ../worker && npx wrangler d1 migrations apply mazza-finance --local

# Serve the SPA and the API together on one origin
npx wrangler dev
```

No Docker, no database password. Miniflare provisions D1 locally.

```bash
cd worker && npm test        # workerd, real D1 bindings, real migrations
cd backend && npm test       # frozen Express tree; needs Docker for Postgres
cd frontend && npm test
cd frontend && npm run build # tsc + vite build
```

The Compose stack (`docker compose up --build`) is still documented in
`README.md` because it is still the live app. Do not reach for it to develop
new work.

---

## TDD Requirement

Tests are written **before** implementation code, and watched failing. Test
output must be pristine — no ignored failures.

**No mocks.** Real data, real APIs, real D1 bindings. Where a real call is
genuinely too expensive to make — a SimpleFIN poll costs one of 24 and the
24th disables the token — split the code at that line instead of mocking
across it: the request construction and the status handling are pure functions
with their own tests, and the fetch is a thin shell over them.

A characterization test that cannot fail is worse than no test. If one is
guarding a refactor, break the code deliberately and watch it go red before
trusting it.

---

## Work tracking

Managed through GitHub Issues in `zmazza-mtech/mazza-finance-app`. Conventions
are injected by the mt-github-tracking plugin; this section holds only what is
specific to this project.

**Tracking epics:** #63 for the replatform — read it before starting anything.
#1 is the pre-replatform epic; its container-hardening invariants are retired
and its money and validation invariants are amended above.

**Replatform milestones:** `Replatform: Runway` (done), `Replatform: Hono + D1`,
`Replatform: Auth & Go-Live`, `PWA & iOS Polish`, `Multi-tenancy Activation`.

**Earlier milestones:** `Test & CI Hardening`, `Categorization v1`,
`Reporting v1`, `Production Hardening`.

**Labels beyond the defaults:** `epic`, `backend`, `frontend`, `database`,
`security`, `infra`, `testing`, `simplefin`, `documentation`

**Project board:** Mazza Finance (user project #4) — a view, never a source of
truth. Backlog = `no:milestone`.
