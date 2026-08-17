# Design: Cloudflare-native replatform

Date: 2026-08-17
Status: approved by owner 2026-08-17

## Purpose

The app was built as a self-hosted home-LAN tool: Docker Compose on a home
server, Caddy HTTP Basic Auth, mkcert certificates, zero app-layer auth. The
premise has changed:

- **The primary user is Mrs. Mazza, on her iPhone** — the app must be an
  installable PWA with Face ID unlock. A native Swift app stays a future
  option; a clean bearer-token API keeps it open.
- **Greenfield architecture on the owner's fleet standard.** Every other app
  the owner runs is on Cloudflare compute + D1. This app joins the fleet:
  Workers-native (Hono + D1), free tier. No Caddy, no home server, no interim
  hosting phase.
- **SaaS-shaped from day one.** Household multi-tenancy is in the schema from
  the first migration; the Mazzas are household #1.
- **Cost target: $0/mo** (Workers, D1 and Clerk free tiers); the only planned
  spend is a domain (~$10/yr). Escape hatch: Workers Paid ($5/mo) if forecast
  CPU needs it.

### Feasibility facts

- The responsive phone UI is already shipped (issues #50–#60). This spec is
  about everything around the UI.
- The backend is barely Postgres-coupled: exactly **one** DB-side money
  operation (`backend/src/api/reports.ts` — a `SUM(amount)` for the Sankey
  report). All other money math is decimal.js in `services/` with decimal
  strings on the wire, which survives SQLite untouched. The `check()`
  constraints have SQLite equivalents in Drizzle.
- Eight thin Express routers; `services/` are pure functions needing no
  changes; the frontend has a single `request()` wrapper in
  `frontend/src/api/client.ts`.
- `backend/src/lib/crypto.ts` already implements AES-256-GCM
  (nonce:ciphertext:tag) — ported to Web Crypto for Workers, same format.
- Real iPhone blockers today: untrusted mkcert cert (issue #62), zero app
  auth, no PWA scaffolding, inputs under 16px (iOS auto-zoom), Playwright
  "mobile" project emulating Android Chrome rather than WebKit, and
  `refetchOnWindowFocus: false` leaving balances stale on resume.

## Target architecture

```
    iPhone (Safari / installed PWA, Face ID passkey)
                      |  HTTPS
        Cloudflare (DNS, CDN, WAF, real certs)
                      |
        ONE Worker at app.<domain>
        ├─ Static assets: Vite build (SPA + PWA shell)
        ├─ /api/v1/*: Hono app (ported routers, unchanged
        │    services/, Clerk JWT middleware, household
        │    scoping on every query)
        └─ same origin → no CORS, no split-origin CSP
                      |
        D1 (SQLite): tenancy-ready schema; amounts as TEXT
        decimal strings; per-household encrypted SimpleFIN
        URL (AES-256-GCM via Web Crypto; key in Wrangler
        secrets); Time Travel PITR
                      |
        SimpleFIN Bridge (per-household token, 24/day budget
        per household, demand-driven, D1 row-lock sync guard)

    Clerk (hosted auth): passkey primary (Face ID),
    email-code fallback, no OAuth redirects
```

Retired entirely: Caddy, mkcert, Basic Auth, docker-compose (prod *and*
dev), Postgres, the home server, Express, `readSecret()`. Local dev is
`wrangler dev` (Miniflare D1) + Vite.

## Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| 1 | Runtime | Workers-native: Hono + D1 (owner-confirmed) | Matches the owner's fleet, truly $0, best scaling story. One-time port of 8 thin routers with the existing test suite as safety net. |
| 2 | Serving topology | Single Worker: static assets + Hono API, same origin | Workers static assets is Cloudflare's recommended new-project path; same origin kills CORS/split-CSP complexity and is one `wrangler deploy`. |
| 3 | Money in D1 | TEXT decimal strings; ALL arithmetic in decimal.js; SQL arithmetic on money banned | Preserves the epic #1 invariant. The one `SUM` in reports is rewritten as decimal.js summation in the service layer. New invariant: "no SQL aggregation/arithmetic on amount columns — fetch and sum with decimal.js." |
| 4 | Auth | Clerk — passkey + email-code only, no OAuth redirects | Face ID is a hard requirement; Cloudflare Access is email-OTP-only. Clerk verifies JWTs statelessly in Hono middleware; free to 10k MAU. Bearer-token API = future Swift/Capacitor ready. Redirect-based providers can strand sessions in iOS standalone PWA context — hence none configured. |
| 5 | Tenancy | Household model, in the schema from migration #1; queries written scoped from day one | households / users (Clerk ID, JIT-provisioned) / household_memberships (owner\|member) / household_settings / user_settings / simplefin_connections. During the port, household resolution is a constant (the Mazza household); Phase 4 swaps in JWT-membership resolution. No retrofit pass later. |
| 6 | Isolation upgrade path | App-level scoping now; D1-per-household noted as the future hard-isolation option | SQLite has no RLS; per-tenant DBs (D1 supports thousands) is the Cloudflare-idiomatic stronger answer if SaaS gets real. Not built now. |
| 7 | SimpleFIN token | Encrypted D1 column (AES-256-GCM via Web Crypto, same nonce:ciphertext:tag format), single master key in Wrangler secrets, `key_version` column | One KEK outside the DB covers the DB-exfiltration threat; per-tenant DEK/KMS is overkill below ~1k tenants. |
| 8 | Sync guard + budget | D1 `sync_log` row lock (`status='running'` + staleness timeout), 24/day budget scoped by `household_id` | Demand-driven invariant survives, reworded per-household. No cron, no background poller. Durable Object noted as upgrade if lock contention ever matters. |
| 9 | Forecast CPU | **Measured 2026-08-17** under workerd (`worker/tests/forecast-cpu.spec.ts`): the unoptimized pipeline averages **~106ms** on a heavy 226-day load — ~10× over the free-tier 10ms budget | The cost is quadratic hot spots, not decimal.js itself: the per-day `filter` over all transactions in `computeForecast` and per-series Decimal-heavy matching in `reconcileInstances`. **Phase 1 therefore includes a forecast performance pass** (group transactions by date, index actuals by date in reconciliation, reuse Decimal instances) expected to yield 10–20×; Workers Paid ($5/mo, 30s CPU) stays as the fallback if the pass can't reach budget. The pass helps phone latency on any tier, so it is not tier-contingent work. |
| 10 | PWA | App-shell precache via vite-plugin-pwa; NetworkOnly for `/api`; `refetchOnWindowFocus: true` + visibilitychange invalidation + "Updated Xm ago" | Money never silently stale — the responsive spec's principle survives its no-PWA conclusion, which is formally superseded. |
| 11 | IDs / schema dialect | Drizzle `sqlite-core`; TEXT PKs via `crypto.randomUUID()`; `check()` constraints preserved; ISO-8601 TEXT dates | Straight dialect translation; the app already treats IDs and dates as strings. |
| 12 | Testing | `@cloudflare/vitest-pool-workers` (tests run in workerd with real D1 bindings) replacing supertest; Playwright vs `wrangler dev`, plus a WebKit iPhone project | TDD invariant survives; tests exercise the real runtime. The current mobile project emulates Android Chrome — the actual user is on WebKit. |
| 13 | Backups | D1 Time Travel (30-day PITR) + nightly `wrangler d1 export` → R2 via GitHub Actions; interim `pg_dump` cron on the home server immediately | Closes #11. Data loss is the only permanent failure mode — interim dumps start now, not at migration. |
| 14 | CSV export | Authenticated fetch + blob download replacing plain `<a>` links (which relied on Basic Auth replay) | Smallest change; signed URLs unwarranted. |
| 15 | OpenAPI | `zod-openapi` from existing Zod schemas, Phase 5 | Enables a Swift client someday; not critical path. |

## Phases

### Phase 0 — Clear the runway (owner action)
Land in-flight PRs (#45→#47→#49 chain, #44, #46, #48; then #26). Start a
cron'd `pg_dump` on the home server immediately. Feature freeze after: no new
Express-side features — everything new lands on the Hono side.
**Exit:** 0 open PRs; nightly dump running.

### Phase 1 — Replatform: Hono + D1 (2–4 weeks)
Behavior-identical port, verified by the existing test suite ported to
`vitest-pool-workers`.
- Scaffold: wrangler config (Worker + static assets + D1 binding + secrets),
  Vite build wired as Worker assets, `wrangler dev` local loop. Week-1 spike:
  forecast CPU measurement (decision 9 gate).
- Schema: Drizzle sqlite translation of current tables **plus** tenancy
  tables and `household_id` columns from day one;
  `unique(household_id, simplefin_id)`; seed migration creates the Mazza
  household; `app_settings` splits into `household_settings` +
  `user_settings` now.
- Routers: Express → Hono, 1:1, tests ported first. Zod validation and the
  `{ data, error }` envelope unchanged. All queries scoped (`householdId`
  required first arg); household resolved from a constant for now.
- Lib: crypto → Web Crypto (fixture-tested against the Node version);
  logger → console (Workers Logs); `readSecret()` deleted — SimpleFIN URL
  read from `simplefin_connections`, imported by a one-time script.
- Reports: the `SUM` rewritten as decimal.js summation; invariant + test.
- Sync: D1 row-lock guard + per-household 24/day budget.
**Exit:** ported suite green in workerd; app fully functional under
`wrangler dev` with migrated sample data; forecast CPU within budget (or
Paid plan consciously adopted).

### Phase 2 — Auth + go-live (1–2 weeks)
Clerk (Hono middleware, ClerkProvider + sign-in route, bearer injection in
`client.ts`, CSV fetch+blob, JIT provisioning); buy domain; deploy Worker;
data migration `pg_dump` → transform → D1 verified by row counts +
per-account balance checksums; on-device passkey QA before announcing;
home server retired; Caddy/compose/Postgres deleted from the repo.
**Exit:** Face ID sign-in on the real iPhone; API is 401 without a token.

### Phase 3 — PWA + iOS polish (1–2 weeks)
vite-plugin-pwa (manifest, app-shell precache, NetworkOnly `/api`,
autoUpdate); freshness (`refetchOnWindowFocus: true`, visibilitychange
invalidation, "Updated Xm ago", resume triggers the daily sync); ≥16px
input sweep; Playwright WebKit iPhone project; on-device install QA.
**Exit:** installed home-screen app, Face ID unlock, never silently stale.

### Phase 4 — Multi-tenancy activation (1–2 weeks)
Household constant → JWT-membership lookup; two-household isolation suite
written first; minimal invite flow; settings UI for SimpleFIN connection and
household members.
**Exit:** isolation suite green; a test second household sees only its data.

### Phase 5 — SaaS readiness (on demand, unscoped)
Stripe, onboarding, per-tenant rate limiting, `zod-openapi`, audit log,
D1-per-household isolation if warranted, Capacitor spike if native matters.

## Superseded artifacts

| Artifact | Status |
|---|---|
| Caddy + mkcert + Basic Auth | Deleted at Phase 2 cutover — its jobs (LAN TLS, auth, static serving) move to Cloudflare/Clerk/Worker assets |
| Docker Compose (prod and dev), Postgres, home server | Retired at Phase 2 cutover; `wrangler dev` replaces the dev loop |
| Container-hardening invariants in CLAUDE.md | Moot — no containers; CLAUDE.md rewritten in Phase 2 |
| Docker-secret SimpleFIN invariant (`readSecret`) | Replaced by encrypted-at-rest per-household D1 column, key in Wrangler secrets |
| Responsive spec decision 3 ("not a PWA") | Superseded (amendment noted in that spec); no-stale-money principle survives as decision 10 |
| PRD non-goals (no auth, no multi-user, no native/offline, self-host posture) | Amended with a premise-change addendum in Phase 2 |
| Issue #62 (LAN plain-HTTP fix) | Obsoleted — closed |
| Issue #11 (backups) | Interim `pg_dump` cron now; permanently closed by decision 13 |
| CSV `<a>` links; `refetchOnWindowFocus: false` | Replaced in Phases 2–3 |
| Epic #1 wording | Amended: "no SQL arithmetic on amounts"; secret invariant reworded; sync invariant per-household; new "no /api route without auth" and "isolation suite must pass" |

## Verification

- Phase 1: ported Vitest suite green under `vitest-pool-workers`; crypto
  fixture cross-check (Node-encrypted → Worker-decrypted); forecast CPU
  measurement recorded here; full walkthrough on `wrangler dev`.
- Phase 2: migration checksums (row counts + per-account balance sums, pg vs
  D1); 401/200 auth matrix; real-iPhone passkey QA over cellular.
- Phase 3: WebKit Playwright project green; on-device install/resume QA.
- Phase 4: two-household isolation suite green.
- Every phase: full test suite, no ignored failures (TDD invariant).

## Open questions (non-blocking)

1. Domain name — needed at Phase 2 cutover; decide whether the SaaS brand
   name is chosen now.
2. Clerk free-tier check — verify passkey GA status/limits at Phase 2 start
   (WorkOS, free to 1M MAU, is the fallback).
3. D1 free-tier limits — verify row-read/write daily caps at Phase 1 start.
