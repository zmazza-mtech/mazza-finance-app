# Product Requirements Document: Mazza Finance

**Version**: 1.1
**Date**: 2026-02-20
**Status**: Draft — Security and Design Reviewed
**Author**: Business Analysis Session
**Changelog**: v1.1 — Security review (3 Critical, 5 High, 7 Medium resolved) and
design review (3 Critical, 6 High, 8 Medium resolved) incorporated prior to development.

---

## Table of Contents

1. [Context](#1-context)
2. [Purpose](#2-purpose)
3. [User Personas](#3-user-personas)
4. [Goals and Non-Goals](#4-goals-and-non-goals)
5. [Core Features](#5-core-features)
6. [Data Model](#6-data-model)
7. [API Integration — teller.io](#7-api-integration--tellerio)
8. [Tech Stack and Architecture](#8-tech-stack-and-architecture)
9. [Technical Requirements](#9-technical-requirements)
10. [Task Breakdown](#10-task-breakdown)
11. [MVP vs Phase 2](#11-mvp-vs-phase-2)
12. [Non-Functional Requirements](#12-non-functional-requirements)
13. [Open Questions and Assumptions](#13-open-questions-and-assumptions)

---

## 1. Context

### Background

Most personal finance apps focus on historical spending analysis — budgets, category breakdowns,
and past transaction history. They answer "where did my money go?" but rarely answer the more
actionable question: "will I have enough money on March 22nd?"

Mr. Mazza wants a tool that gives his household a clear, accurate picture of future cash flow
by combining real bank data with intelligent recurring transaction detection and manual
forecasting.

### Current State

No existing tool in this household tracks cash flow on a day-by-day basis with a running
balance. The current approach is ad hoc — mental math or occasional spreadsheet estimates.

### Desired State

A self-hosted web application with a calendar-based cash flow forecasting interface. Past days
reflect real bank transactions pulled from teller.io. Future days reflect detected recurring
charges and manually added one-off transactions. The running balance flows continuously from
day to day, giving a clear picture of account health at any point in the next year.

### Stakeholders

- **Mr. Mazza** — primary user, developer, and decision-maker
- **Mrs. Mazza** — co-user of the application (household finances)

---

## 2. Purpose

### Why This Exists

Household financial surprises — an unexpected low balance, a subscription renewal hitting at
the wrong time — are largely preventable with better cash flow visibility. This app surfaces
future financial pressure points before they happen.

### Business and User Value

- Prevents overdrafts and low-balance surprises by forecasting day-by-day balances
- Surfaces upcoming recurring charges and allows proactive adjustments
- Gives both household members a shared, always-current view of account health
- Replaces mental math and ad hoc spreadsheets with an automated, living forecast

### Product Strategy Alignment

This is a personal productivity tool for household use. There is no monetization goal. Success
is defined by daily usefulness and accuracy of the forecast.

---

## 3. User Personas

### Primary User: Mr. Mazza

- Technically proficient; comfortable with self-hosted infrastructure
- Wants a clean, fast interface he can check daily
- Cares about accuracy and data integrity over visual flair
- Will be responsible for initial setup and ongoing maintenance

### Secondary User: Mrs. Mazza

- Non-technical; needs the interface to be immediately understandable without explanation
- Will primarily view the calendar and add one-off future transactions
- Should not need to interact with setup, sync configuration, or technical settings

---

## 4. Goals and Non-Goals

### Goals (MVP — Phase 1)

- Display a vertical, scrollable calendar timeline showing daily transactions and a cumulative
  running balance
- Pull actual transaction data from teller.io for past and current days
- Auto-detect recurring transactions from transaction history
- Support manually defined recurring transactions
- Support manually added one-off future transactions (persisted to database)
- Provide a dedicated Recurring Transactions management page
- Sync with teller.io on an hourly schedule and on-demand
- Auto-reconcile incoming actual transactions against forecasted recurring entries
- Color-code running balance by health (green / yellow / red thresholds, WCAG-compliant tokens)
- Non-intrusive balance health notifications (dismissible banner with 7-day re-appearance logic)
- Dark mode and light mode with a persistent toggle in the navigation header
- Support multiple checking and savings accounts with a single-select account dropdown on the
  calendar view
- Containerized, self-hosted deployment via Docker Compose
- Lightweight access protection via Caddy HTTP Basic Auth

### Non-Goals (explicitly out of scope for MVP)

- Mobile native apps (iOS/Android)
- Application-layer authentication with sessions, JWT, or user accounts
- Credit card balance forecasting on the calendar (credit cards are connected via teller.io for
  data completeness but excluded from the calendar view)
- Reconciliation mismatch indicator (Phase 2)
- P&L reporting or spending category analysis (Phase 2)
- Data export — CSV, PDF, or otherwise (Phase 2)
- Push or pop-up browser notifications
- Offline mode

---

## 5. Core Features

### 5.1 Calendar Forecast View

The centerpiece of the application. A vertical, scrolling timeline organized month by month.

**Layout and Navigation**

- Vertical scroll timeline, one month per section, with month headers as sticky anchors
- Default landing view: current month, scrolled to today's date
- Navigation: scroll forward up to 12 months (performance-permitting; fall back to 3-month
  window if needed)
- Limited backward navigation: show current month and up to 1–2 months of history for
  reference; no need to browse far into the past
- A "Jump to Today" button in the navigation and `T` keyboard shortcut (when calendar has
  focus) return the user to today's cell after scrolling away

**Today's Cell**

Today's day cell must be visually distinct with a persistent indicator that does not rely on
color alone:
- A "Today" label pill adjacent to the date label
- A distinct left-border accent (e.g., 3px solid accent color) or background tint
- Both the label and border/tint must be visible in both light and dark themes
- Today's cell does not activate inline entry — only the modal "+" button is available on
  today's cell

**Day Cell Structure**

Each day on the calendar renders a cell containing:

1. Date label (e.g., "Thu Feb 20") — today's cell also shows a "Today" pill
2. Transaction list — one line item per transaction:
   - Transaction name / description
   - Amount with red (debit) or green (deposit) color indicator AND a direction icon
     (↑ for deposit, ↓ for debit) — color is never the sole indicator
   - Source badge pill with text label: "Actual", "Forecast", or "Manual" — badge background
     color is supplementary; the text label is the primary indicator
   - Screen reader `aria-label` per item: e.g., "Netflix, $15.99, debit, forecasted"
3. "Show more" truncation when transactions exceed 3 visible items; tap/click reveals a
   bottom sheet drawer on mobile or in-place expansion on desktop
4. Daily net total (sum of all transactions for that day)
5. Running balance — cumulative balance carried from the previous day, updated by today's
   net total, color-coded per health thresholds with a text label

**Running Balance Logic**

- Seed balance: the most recent actual bank balance from teller.io for the selected account
- Past and current days: running balance calculated from actual transaction data
- Future days: running balance calculated from seed balance plus all forecasted and manually
  added transactions
- Only one account is displayed at a time (single-select)

**Balance Health Color Coding**

The running balance figure on each day is color-coded AND paired with a text label. All tokens
must achieve minimum 4.5:1 contrast ratio against their background in both themes — verify
with a contrast checker before implementation.

| Color  | Tailwind Token (Light) | Tailwind Token (Dark) | Text Label | Condition                        |
|--------|------------------------|-----------------------|------------|----------------------------------|
| Green  | `green-700`            | `green-400`           | "Good"     | Balance above warning threshold (default $500) |
| Yellow | `amber-700`            | `amber-300`           | "Low"      | Balance within warning range (default $100–$500) |
| Red    | `red-700`              | `red-400`             | "Critical" | Balance below critical threshold (default $100) |

Thresholds are user-configurable in application settings.

**Account Selector**

- A persistent single-select compact dropdown control, anchored above the calendar scroll area
- On mobile (below 768px): maximum height of 44px; must not consume significant vertical space
- On desktop: a fuller labeled dropdown displaying account name and institution
- Shows checking and savings accounts only; credit card accounts are excluded
- When only one account is connected, displays as a static label (no dropdown needed)

**Non-Intrusive Balance Alert Banner**

- A collapsible bar, fixed to the top of the viewport below the navigation header; slides down
  and pushes calendar content below it (does not overlay content)
- Appears when the forecasted balance is projected to drop into yellow or red territory within
  the next 30 days
- Banner text: "Your balance is forecasted to drop below $X on [date]." with a "View" link
  that scrolls the calendar to that date
- User-dismissible via an explicit close (×) button
- A manually dismissed banner reappears after 7 days if the low-balance condition still exists
- Banner does not appear for past dates

**Keyboard Navigation — Calendar**

The calendar uses a roving tabindex model (not sequential Tab-through-all):

- Tab moves focus to the calendar widget as a single focusable unit
- Arrow keys navigate between day cells (Left/Right = days, Up/Down = weeks)
- Page Up / Page Down jump one month
- Home / End jump to first / last day of the currently visible month
- `T` key (when calendar has focus) jumps to today's cell
- Enter activates the focused day cell (expands or triggers entry)
- Escape collapses inline entry or closes open drawers/modals
- A visible skip-navigation link at the top of the page allows keyboard users to bypass the
  navigation header

---

### 5.2 Transaction Entry — Inline and Modal

Users can add one-off transactions to any future date via two entry methods.

**Touch Device Behavior**

On touch devices:
- Tapping the day cell body expands/collapses the cell only
- The "+" button within each future cell is always visible (not hidden behind hover) and is
  the only way to trigger the inline entry form on mobile
- The inline form on mobile includes a visible "Cancel" button in addition to Escape key

**Inline Entry (default on desktop)**

- On desktop: clicking a future day cell or the "+" button activates an inline input row
- On mobile: only the "+" button triggers inline entry
- Fields: description, amount, debit/deposit segmented control (see below)
- Submit on Enter or confirm (✓) button; cancel on Escape, clicking away, or "Cancel" button

**Amount Field**

- Accepts positive numbers only (0.01 to 9,999,999.99)
- Displays a "$" prefix
- Zero rejected: "Amount must be greater than $0.00"
- Negative numbers rejected: "Enter a positive amount. Use the Debit/Deposit selector to
  indicate direction."
- The debit/deposit segmented control (not amount sign) determines cash flow direction

**Debit/Deposit Segmented Control**

A segmented control with two labeled buttons:
- "Debit (money out)" and "Deposit (money in)"
- Active state indicated by both fill/background and label text weight — color is supplementary
- Implemented as `role="radiogroup"` with `role="radio"` on each option

**Modal Entry**

- A "+" button on any future day cell opens a full modal form
- Fields: description, amount, debit/deposit control, date (pre-filled, editable), optionally
  mark as recurring
- If marked as recurring, routes user to create a recurring transaction definition after saving
- Modal traps focus while open; closing returns focus to the trigger element

**Focus Management**

- When inline entry activates: focus moves to the description field
- When inline entry closes (submit / cancel / Escape): focus returns to the "+" button
- Modal traps focus within itself while open; closing returns focus to the trigger

**Persistence**

- All manually added transactions are saved to the database immediately on submission
- They appear on the calendar instantly (optimistic update) and persist across sessions

**Editing and Deleting Future Transactions**

- Manually added future transactions can be edited or deleted inline
- Delete requires a confirmation dialog:
  - Title: "Delete [transaction name]?"
  - Body: "This will remove this transaction from your forecast. This cannot be undone."
  - Buttons: "Delete" (destructive, red) and "Cancel" (neutral)
- Deleting immediately updates the running balance for all subsequent days
- On server error after optimistic update: roll back and show toast "Failed to save
  transaction. Please try again." (auto-dismisses after 5 seconds)

---

### 5.3 Recurring Transaction Management Page

A dedicated page for viewing and managing all recurring transactions.

**List View**

- Desktop (768px+): table with columns: Name, Amount, Type, Frequency, Next Date, End Date,
  Source, Status
- Mobile (below 768px): card layout. Each card shows name, amount, frequency, and next date
  as primary fields; status as inline badge; type, end date, and source in a collapsible
  detail row

**Actions per Recurring Transaction**

- **Edit series**: Modify name, amount, frequency, next date, end date for all future instances
- **Disable / Re-enable**: Toggle active status without deleting (disabled series do not appear
  in forecast)
- **Delete series**: Requires confirmation dialog:
  - Title: "Delete [name]?"
  - Body: "This will remove all future forecasted occurrences from your calendar. This cannot
    be undone."
  - Buttons: "Delete" (destructive, red) and "Cancel" (neutral)
- **Set end date**: Add or modify the date after which the series stops generating forecast
  entries

**Recurring Transaction End Date — Past-Date Handling**

- When a recurring transaction's end date has passed, the system automatically sets its status
  to `ended` on the next sync or forecast computation
- `ended` is distinct from `disabled` (which is user-intentional)
- The list shows ended transactions in a separate "Ended" section, not the active list
- Ended series can be reactivated by editing or removing the end date

**Single-Instance Override (Exception Pattern)**

- From the calendar, clicking a forecasted recurring transaction on a future date presents:
  - **"Edit this occurrence"** — proceeds directly to the edit form; stores an override record
  - **"Edit this and all future occurrences"** — shows confirmation first: "This will update
    [name] and all future occurrences from [date] forward. This cannot be undone." Only after
    confirmation does the edit form open
- A 5-second undo toast appears after any destructive series modification
- Overriding can change: date, amount, or description
- Deleted single instances create an exclusion record to prevent series regeneration

**Recurrence Patterns Supported**

- Weekly (every 7 days)
- Bi-weekly (every 14 days)
- Monthly (same date each month)
- Yearly (same date each year)

**Auto-Detection**

- Backend analyzes transaction history to detect recurring patterns after each sync
- Detected candidates are placed in a "Detected — Pending Review" section
- Pending items do NOT appear in the forecast until explicitly confirmed by the user
- Section header copy: "We noticed these charges appear regularly in your account history.
  Review each one and confirm if it should appear in your future forecast."
- The section is hidden when empty — no empty section header shown
- A badge count on the Recurring nav item shows the number of items pending review
- Users can: confirm (adds to active forecast), dismiss (ignores pattern), or edit before
  confirming

---

### 5.4 teller.io Sync

**Connection Setup**

- One-time setup via teller.io's Teller Connect widget
- After connection, access tokens are stored encrypted (AES-256-GCM) in the database
- `POST /setup/connect` returns `409 Conflict` if credentials already exist; requires explicit
  credential deletion before re-enrollment

**Sync Schedule**

- Automatic background sync every hour via a scheduled job on the backend
- Manual "Sync Now" button in the navigation header; "Last synced N min ago" timestamp adjacent
- Frontend displays a stale-data warning when last successful sync is older than 2 hours:
  "Data may be outdated — last synced [timestamp]"

**Sync Rate Limiting and Concurrency**

- `POST /sync` rate-limited to once per 5 minutes; returns `429 Too Many Requests` with
  `Retry-After` header if called sooner
- Returns `409 Conflict` if a sync is currently in progress
- Hourly cron checks for an in-progress sync before starting; skips if one is active

**Auto-Reconciliation**

- Matches incoming actual transactions to forecasted recurring entries by date (±1 day) AND
  amount (exact match)
- On match: replaces forecasted entry with actual; advances series next_date
- On no match: inserts actual as-is; leaves forecasted entry for manual resolution

---

### 5.5 Application Settings

- **Account management**: View connected accounts; set default inclusion in calendar view
- **Balance thresholds**: Warning threshold (yellow) and critical threshold (red)
  - Both must be non-negative (0.00–999,999.99)
  - Warning must be greater than critical; validated on save with inline feedback if violated
  - Defaults: warning = $500, critical = $100
- **Dark/light mode toggle**: In the navigation header AND on this page; saved to localStorage
- **Manual sync**: "Sync Now" button with loading state, last-sync timestamp, stale-data
  warning
- **Recurring detection review**: Link to the pending review section

---

## 6. Data Model

All tables use Postgres. UUIDs for primary keys throughout.

### `accounts`

```sql
CREATE TABLE accounts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teller_id       TEXT NOT NULL UNIQUE,       -- teller.io account ID
    institution     TEXT NOT NULL,              -- e.g., "Chase"
    name            TEXT NOT NULL,              -- e.g., "Checking ...1234"
    type            TEXT NOT NULL,              -- "checking" | "savings" | "credit"
    subtype         TEXT,                       -- teller.io subtype if available
    currency        TEXT NOT NULL DEFAULT 'USD',
    last_balance    NUMERIC(12, 2),             -- most recent balance from teller.io
    last_synced_at  TIMESTAMPTZ,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    include_in_view BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### `teller_credentials`

Access tokens encrypted at rest using AES-256-GCM with a cryptographically random 96-bit nonce
per operation. Storage format: `nonce_hex:ciphertext_hex:auth_tag_hex`. Auth tag MUST be
verified on every decryption; failed verification is an error — never proceed with corrupted
plaintext.

```sql
CREATE TABLE teller_credentials (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- AES-256-GCM encrypted: "nonce_hex:ciphertext_hex:auth_tag_hex"
    access_token    TEXT NOT NULL,
    enrollment_id   TEXT NOT NULL UNIQUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### `transactions`

```sql
CREATE TABLE transactions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teller_id       TEXT UNIQUE,                -- null for manual entries
    account_id      UUID NOT NULL REFERENCES accounts(id),
    date            DATE NOT NULL,
    description     TEXT NOT NULL,              -- max 500 chars enforced at API layer
    amount          NUMERIC(12, 2) NOT NULL,    -- negative = debit, positive = deposit
    type            TEXT NOT NULL,              -- "actual" | "manual"
    status          TEXT NOT NULL DEFAULT 'posted', -- "posted" | "pending"
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transactions_account_date ON transactions(account_id, date);
```

### `recurring_transactions`

```sql
CREATE TABLE recurring_transactions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id      UUID NOT NULL REFERENCES accounts(id),
    name            TEXT NOT NULL,              -- max 500 chars
    amount          NUMERIC(12, 2) NOT NULL,    -- negative = debit, positive = deposit
    frequency       TEXT NOT NULL,              -- "weekly" | "biweekly" | "monthly" | "yearly"
    next_date       DATE NOT NULL,
    end_date        DATE,                       -- null = indefinite
    source          TEXT NOT NULL,              -- "auto_detected" | "manual"
    -- "active" | "disabled" | "pending_review" | "ended"
    status          TEXT NOT NULL DEFAULT 'pending_review',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_recurring_account ON recurring_transactions(account_id);
```

### `recurring_overrides`

```sql
CREATE TABLE recurring_overrides (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recurring_transaction_id UUID NOT NULL REFERENCES recurring_transactions(id)
                             ON DELETE CASCADE,
    original_date            DATE NOT NULL,
    override_type            TEXT NOT NULL,     -- "modified" | "deleted"
    override_date            DATE,
    override_amount          NUMERIC(12, 2),
    override_name            TEXT,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_overrides_recurring ON recurring_overrides(recurring_transaction_id);
```

### `sync_log`

```sql
CREATE TABLE sync_log (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    started_at              TIMESTAMPTZ NOT NULL,
    completed_at            TIMESTAMPTZ,
    status                  TEXT NOT NULL,      -- "success" | "partial" | "failed"
    transactions_fetched    INT DEFAULT 0,
    transactions_reconciled INT DEFAULT 0,
    -- Fixed-vocabulary only. Allowed values:
    --   "TELLER_API_TIMEOUT" | "TELLER_API_ERROR" | "TELLER_RATE_LIMITED"
    --   "DB_CONNECTION_FAILED" | "SYNC_ALREADY_IN_PROGRESS" | "UNKNOWN"
    -- Full exception details go to stdout ONLY — never stored here.
    error_code              TEXT,
    -- Human-readable static message paired with error_code. No dynamic data from API responses.
    error_message           TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### `app_settings`

Values validated on startup; app fails to start with a clear error if required settings
contain invalid values.

```sql
CREATE TABLE app_settings (
    key             TEXT PRIMARY KEY,
    value           TEXT NOT NULL,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed defaults:
-- ('balance_threshold_warning', '500')   -- warning threshold (yellow); must be > critical
-- ('balance_threshold_critical', '100')  -- critical threshold (red); must be > 0
-- ('theme', 'light')
-- ('last_sync_at', '')
-- ('banner_dismissed_at', '')
```

---

## 7. API Integration — teller.io

### Authentication

- Certificate-based mutual TLS; all API calls are server-side only — never from the browser
- `POST /setup/connect` returns `409 Conflict` if credentials already exist; explicit deletion
  required before re-enrollment

### Key Endpoints Used

| Endpoint                              | Purpose                                      |
|---------------------------------------|----------------------------------------------|
| `GET /accounts`                       | List all connected accounts                  |
| `GET /accounts/{id}/balances`         | Get current balance for an account           |
| `GET /accounts/{id}/transactions`     | Fetch transactions (paginated, date-filtered) |

### Sync Flow (Hourly + On-Demand)

```
1. Check for in-progress sync; abort with 409 if found
2. For each active account:
   a. Fetch current balance → update accounts.last_balance
   b. Fetch transactions since last_synced_at
   c. Upsert into transactions table (deduplicate by teller_id)
   d. Run auto-reconciliation against recurring_transactions
   e. Update accounts.last_synced_at
3. Run recurring transaction auto-detection on updated history
4. Write entry to sync_log (fixed-vocabulary error codes only)
```

### Log Sanitization Requirement

All logs and database-stored error data MUST NOT include:
- `Authorization` headers or access tokens
- Encryption keys or key material
- Raw HTTP response bodies from teller.io
- Full database query text

Express error handler middleware must sanitize all unhandled exceptions before logging.

### Auto-Reconciliation Logic

```
For each incoming actual transaction (date D, amount A, account X):
  Find recurring_transactions where:
    - account_id = X
    - next_date = D (or within ±1 day tolerance)
    - amount = A (exact match)
    - status = 'active'

  If match found:
    - Mark the forecasted instance as reconciled
    - Advance the recurring series next_date to the following occurrence

  If no match:
    - Insert actual transaction as-is
    - Leave forecasted entry in place (user resolves manually)
```

### Recurring Transaction Detection Heuristics

Run after each sync on the most recent 90 days of transaction history:

```
For each account:
  Group transactions by normalized description (lowercase, strip special chars)
  For each group with 2+ occurrences:
    Calculate intervals between occurrences
    If intervals cluster around 7 days  → candidate: weekly
    If intervals cluster around 14 days → candidate: biweekly
    If intervals cluster around 28–31 days → candidate: monthly
    If intervals cluster around 365 days → candidate: yearly

    If amount variance < 5% across occurrences:
      Create recurring_transactions record with status = 'pending_review'
      (Skip if an active, pending, or dismissed record already exists)

NOTE: All grouping queries use exact equality on normalized description strings.
No LIKE or ILIKE patterns (avoids accidental wildcard matching).
```

---

## 8. Tech Stack and Architecture

### Recommended Stack

| Layer          | Technology                     | Rationale                                                    |
|----------------|--------------------------------|--------------------------------------------------------------|
| Frontend       | React + TypeScript (Vite)      | Fast SPA development, strong ecosystem, easy to maintain     |
| Styling        | Tailwind CSS                   | Utility-first, dark/light mode trivial with CSS variables    |
| State Mgmt     | React Query (TanStack Query)   | Server state management, background refetch, cache           |
| Backend        | Node.js + Express (TypeScript) | Lightweight API server, easy teller.io integration           |
| Database       | PostgreSQL 16                  | Robust, proven, handles numeric precision for finance        |
| ORM            | Drizzle ORM                    | Lightweight, type-safe, pairs well with TypeScript           |
| Job Scheduler  | node-cron                      | Simple in-process cron for hourly sync job                   |
| Reverse Proxy  | Caddy                          | Automatic HTTPS, HTTP Basic Auth, HTTP security headers      |
| Containerization | Docker + Docker Compose      | Per requirements; clean separation of concerns               |

### Access Protection — Caddy HTTP Basic Auth

All routes are protected by HTTP Basic Auth configured in the Caddyfile. This protects against
unauthorized access from any device that reaches the host on the home network.

- Credentials stored as a bcrypt hash in the Caddyfile (`caddy hash-password`)
- All routes (`/*`) require Basic Auth; there are no public endpoints
- Credentials documented in `.env.example` and setup instructions in `README.md`

### HTTPS and TLS

- Port 80 serves only a permanent redirect to HTTPS
- **Recommended:** Real registered domain + Cloudflare DNS + Let's Encrypt DNS-01 ACME via
  Caddy's Cloudflare DNS module — valid certificate, no browser warnings, works on local network
- **Fallback:** Self-signed certificate via `caddy trust`; browser CA import procedure
  documented in `README.md`
- HTTP security headers on all responses:
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: no-referrer`
  - `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:`

### Container Architecture

```
Docker Compose Services:

┌────────────────────────────────────────────────────┐
│  caddy (ports 80/443)                              │
│    HTTP Basic Auth on all routes                   │
│    HTTP → HTTPS redirect on :80                    │
│    /api/* → backend:3001                           │
│    /*      → static frontend files                 │
│    HTTP security headers on all responses          │
└─────────────┬──────────────────────┬───────────────┘
              │                      │
    ┌─────────▼──────┐    ┌──────────▼────────┐
    │  backend        │    │  frontend          │
    │  Node.js:3001   │    │  React SPA         │
    │  USER node      │    │  (built as static  │
    │  cap_drop: ALL  │    │   files, served by │
    │  mem_limit:512m │    │   Caddy)           │
    │  - REST API     │    └───────────────────┘
    │  - cron sync    │
    │  - teller.io    │
    └─────────┬───────┘
              │
    ┌─────────▼──────┐
    │  postgres       │
    │  expose:[5432]  │  ← NOT ports: — internal only
    │  restart:unless │
    │  -stopped       │
    └────────────────┘
```

**Container Hardening**

- Backend: `USER node` in Dockerfile; `cap_drop: [ALL]`; `mem_limit: 512m`; `cpus: 1.0`;
  `restart: unless-stopped`; pinned version tags (not `latest`)
- Postgres: `expose: [5432]` only — never `ports:`; `restart: unless-stopped`; pinned version
- Frontend: static files built in a multi-stage Dockerfile and served by Caddy at runtime —
  no separate runtime container

**Postgres Least-Privilege User**

A dedicated Postgres application user `mazza_app` is created with only DML grants (SELECT,
INSERT, UPDATE, DELETE) on application tables. Migrations run under a higher-privilege role
during container startup. The runtime `DATABASE_URL` uses `mazza_app`, not the superuser.

### Backend API Structure

Base path: `/api/v1`

| Method | Endpoint                                          | Description                                      |
|--------|---------------------------------------------------|--------------------------------------------------|
| GET    | `/accounts`                                       | List all connected accounts                      |
| PATCH  | `/accounts/:id`                                   | Update account settings (include_in_view, etc.)  |
| GET    | `/transactions`                                   | List transactions (query: account_id, start, end)|
| POST   | `/transactions`                                   | Create a manual one-off transaction              |
| PATCH  | `/transactions/:id`                               | Update a manual transaction                      |
| DELETE | `/transactions/:id`                               | Delete a manual transaction                      |
| GET    | `/recurring`                                      | List all recurring transactions                  |
| POST   | `/recurring`                                      | Create a manual recurring transaction            |
| PATCH  | `/recurring/:id`                                  | Update a recurring series                        |
| DELETE | `/recurring/:id`                                  | Delete a recurring series                        |
| POST   | `/recurring/:id/overrides`                        | Create a single-instance override                |
| DELETE | `/recurring/:id/overrides/:overrideId`            | Remove a single-instance override                |
| GET    | `/forecast`                                       | Get forecasted transactions for a date range     |
| POST   | `/sync`                                           | Trigger manual on-demand sync                    |
| GET    | `/sync/status`                                    | Get last sync status and timestamp               |
| GET    | `/settings`                                       | Get all app settings                             |
| PATCH  | `/settings`                                       | Update app settings (thresholds, theme, etc.)    |
| POST   | `/setup/connect`                                  | Initiate teller.io Teller Connect (one-time)     |

### Forecast Computation

```
Input: account_id, start_date, end_date, seed_balance

Algorithm:
1. Fetch all actual transactions in range from DB
2. Generate all recurring transaction instances in range:
   - Expand each active recurring series across the date range
   - Apply recurring_overrides (skip deleted, substitute modified)
   - Exclude dates where an actual transaction already reconciled
3. Fetch all manual one-off transactions in range from DB
4. Merge all three sets, sort by date
5. Walk day by day, computing running balance:
   running_balance[day] = running_balance[day-1] + sum(transactions[day])
6. Return: array of { date, transactions[], daily_net, running_balance }
```

---

## 9. Technical Requirements

### Frontend Requirements

**Calendar View**
- Vertical scrolling timeline, organized by month; scroll-to-today on mount
- Roving tabindex keyboard navigation (arrow keys, Page Up/Down, Home/End, T, Enter, Escape)
- Skip-navigation link at page top
- Each day cell: date label (with "Today" pill + accent on current day), transaction list,
  daily net, running balance
- Transaction items: description, amount with ↑/↓ icon + color, source badge ("Actual" /
  "Forecast" / "Manual"); `aria-label` per item: "[name], [amount], [debit/deposit], [source]"
- Truncate at 3 items; "N more" → bottom sheet on mobile, in-place expand on desktop
- All balance figures color-coded per Tailwind tokens in the spec; paired with text labels
- Account selector compact dropdown (44px max height on mobile) above calendar
- Balance alert banner (collapsible, below nav, pushes content; 7-day re-appearance)
- First-run states: pre-connection prompt; sync loading skeleton; empty day cells with $0.00

**Recurring Transactions Page**
- Desktop table (8 columns); card layout at < 768px
- Inline enable/disable toggle per row/card
- Confirmation dialog required before "Edit this and all future occurrences" opens
- 5-second undo toast for destructive series modifications
- Delete confirmation dialog with specified copy
- Pending Review section: context copy, hidden when empty, nav badge count
- "Ended" section for past-end-date transactions

**Settings Page**
- Account list with include/exclude toggle
- Threshold inputs (warning and critical) with validation (warning > critical > 0)
- Dark/light mode toggle (also in nav header)
- Sync status: last sync time, status labels, stale-data warning (> 2 hours), "Sync Now"
  button with loading state and rate-limit feedback

**Prohibited Patterns**
- `dangerouslySetInnerHTML` is **prohibited** for any field from the database or user input
- Raw SQL in Drizzle is **prohibited** unless provably necessary; any raw SQL must be flagged
  for security review; all query parameters validated and typed before reaching the ORM

**State Management**
- TanStack Query for all server state
- Optimistic updates for add/edit/delete; error toast on rollback
- Theme persisted to localStorage; applied before first render to prevent flash

**Responsive Design**
- Minimum tested viewport: 375px (iPhone SE)
- Recurring transactions table → card layout at < 768px
- Account selector max 44px height on mobile

**Accessibility**
- WCAG 2.1 AA compliance
- Roving tabindex on calendar (not Tab-through-all); skip-navigation link
- Color never sole indicator (pair with icons and text labels)
- All Tailwind color tokens verified at 4.5:1 contrast in both themes before implementation
- Focus management: inline form → description field on open, "+" on close; modal traps focus,
  returns to trigger on close
- `role="radiogroup"` / `role="radio"` on debit/deposit control
- `aria-label` on all interactive elements and transaction items

**Browser Support**
- Modern evergreen browsers: Chrome, Firefox, Safari, Edge (latest 2 versions)

### Backend Requirements

**API**
- RESTful JSON API, consistent response envelope:
  ```json
  { "data": ..., "error": null }
  { "data": null, "error": { "code": "...", "message": "..." } }
  ```
- Input validation on all endpoints with these field-level rules:
  - `amount`: positive number 0.01–9,999,999.99; sign set by debit/deposit flag server-side
  - `description`: non-empty, max 500 characters
  - `date`: valid ISO 8601, within -2 years to +5 years of today
  - `frequency`: exact allowlist: `weekly | biweekly | monthly | yearly`
  - `account_id` and other UUIDs: valid UUID format
  - Settings thresholds: non-negative decimals; warning > critical enforced on write
- Financial amounts as strings or NUMERIC in JSON — never floating point

**Sync Job**
- Idempotent hourly cron; deduplicates by `teller_id`
- Fixed-vocabulary error codes in sync_log; full exception details to stdout only
- Concurrency guard; 5-minute rate limit on `POST /sync`
- `restart: unless-stopped` provides crash recovery

**Security**
- AES-256-GCM encryption for access tokens; random 96-bit nonce per operation; auth tag
  verified on every decryption; storage format: `nonce_hex:ciphertext_hex:auth_tag_hex`
- Backend runs as `USER node`; `cap_drop: [ALL]`
- Postgres internal-only via `expose:` (never `ports:`)
- Caddy Basic Auth + HTTPS + HTTP security headers
- CORS: explicit allowed origin; Origin validation on mutations
- Log sanitization middleware strips credentials, headers, API responses from all logs

**Error Handling**
- teller.io errors: caught, sanitized, logged to stdout; sync records fixed-vocabulary code
- Database errors: caught; return 503
- Unhandled exceptions: sanitized stack traces to stdout only

### Infrastructure Requirements

**Docker Compose — Four Services**
1. `caddy` — ports 80/443; Basic Auth; HTTP → HTTPS redirect; security headers; serves static
   frontend
2. `backend` — internal only; `USER node`; `cap_drop: [ALL]`; resource limits; `restart:
   unless-stopped`
3. `postgres` — `expose: [5432]`; named volume; `restart: unless-stopped`; init script
   creates `mazza_app` user with DML-only grants
4. Frontend: static files built in multi-stage Dockerfile; served by Caddy (no runtime
   container)

**Environment Variables (backend)**
```
DATABASE_URL=postgresql://mazza_app:<password>@postgres:5432/mazza_finance
TELLER_CERT_PATH=/certs/teller.pem
TELLER_KEY_PATH=/certs/teller.key
TELLER_ENVIRONMENT=sandbox|production
# Generate with: openssl rand -hex 32
ENCRYPTION_KEY=<32-byte hex key>
PORT=3001
CADDY_BASIC_AUTH_USER=<username>
CADDY_BASIC_AUTH_HASH=<bcrypt hash from caddy hash-password>
```

**Data Persistence**
- Postgres data: named Docker volume (`postgres_data`)
- teller.io certs: bind-mounted from outside project directory (e.g.,
  `~/.mazza-finance/certs/`); `chmod 600 teller.key`; owner: backend container UID

**Secret Management**
- `.gitignore` created FIRST (before any other setup): excludes `.env`, `.env.*` (except
  `.env.example`), `*.pem`, `*.key`, `*.p12`, `*.p8`
- `.dockerignore` excludes the same patterns
- Cert files stored outside project root — never in `./certs/` within the project directory

**Logging**
- Structured JSON logs to stdout; Docker captures them
- Stale-sync warning: frontend detects last successful sync > 2 hours and displays warning

---

## 10. Task Breakdown

### Phase 1 — MVP

#### DevOps / Infrastructure

- [ ] **Create `.gitignore` FIRST** — exclude `.env`, `.env.*` (except `.env.example`),
      `*.pem`, `*.key`, `*.p12`, `*.p8` — before any other file is created or committed
- [ ] Create `.dockerignore` with the same secret exclusions
- [ ] Initialize Git repository and project structure
- [ ] Create `docker-compose.yml` with backend, postgres, caddy; hardening settings (non-root,
      cap_drop, resource limits, expose not ports, restart: unless-stopped, pinned versions)
- [ ] Write `Dockerfile` for backend (`USER node`, non-root, pinned Node version)
- [ ] Write multi-stage `Dockerfile` for frontend (build stage → static files served by Caddy)
- [ ] Write `Caddyfile`: HTTP→HTTPS redirect, Basic Auth, reverse proxy, HTTP security headers
- [ ] Create `.env.example` with all env vars and key generation instructions
      (`openssl rand -hex 32`)
- [ ] Write Postgres init SQL: create `mazza_app` user, grant DML-only on application tables
- [ ] Write database migration runner (Drizzle migrate, runs under migration user at startup)
- [ ] Verify cert files are outside project root and excluded from Docker build context
- [ ] Write `README.md`: setup steps, HTTPS certificate strategy, Basic Auth setup, cert
      placement, key generation

#### Backend Tasks

**Setup and Infrastructure**
- [ ] Initialize Node.js + TypeScript project with Express
- [ ] Configure Drizzle ORM with Postgres (`mazza_app` runtime user)
- [ ] Write and run initial database migrations for all tables
- [ ] Validate environment variables on startup (fail fast on invalid settings)
- [ ] Implement structured JSON logging with sanitization middleware (strip credentials,
      headers, raw API responses)
- [ ] Implement AES-256-GCM encryption utility: random nonce, `nonce:ciphertext:tag` format,
      auth tag verification on decrypt
- [ ] Implement CORS middleware (explicit allowed origin, Origin header validation on mutations)

**teller.io Integration**
- [ ] Implement teller.io API client (mutual TLS, sanitized error handling)
- [ ] Implement `GET /accounts` sync — fetch and upsert accounts
- [ ] Implement `GET /accounts/:id/balances` — update `last_balance`
- [ ] Implement `GET /accounts/:id/transactions` — paginated fetch, upsert by `teller_id`
- [ ] Implement `POST /setup/connect` — 409 if credentials already exist

**Sync Engine**
- [ ] Implement main sync orchestrator with concurrency guard (409 if in progress)
- [ ] Implement auto-reconciliation logic
- [ ] Implement recurring auto-detection heuristics (exact equality grouping, no LIKE)
- [ ] Implement node-cron hourly job with concurrency guard
- [ ] Implement `POST /sync` with 5-minute rate limiting (check sync_log); 202 Accepted async
- [ ] Implement `GET /sync/status`
- [ ] Write to `sync_log` using fixed-vocabulary error codes only

**Forecast Engine**
- [ ] Implement recurring series expansion for a date range
- [ ] Apply `recurring_overrides` (skip deleted, substitute modified)
- [ ] Merge actuals + recurring + manual transactions, sort by date
- [ ] Compute cumulative running balance day by day
- [ ] Implement `GET /forecast` endpoint (single account_id, start_date, end_date)

**Transactions API**
- [ ] `GET /transactions` with account_id, start_date, end_date filters
- [ ] `POST /transactions` — validate: description (non-empty, max 500), amount (0.01–
      9,999,999.99, positive), date (ISO 8601, ±2yr), type (allowlist)
- [ ] `PATCH /transactions/:id` — same validation; manual only
- [ ] `DELETE /transactions/:id` — manual only

**Recurring Transactions API**
- [ ] `GET /recurring` — list all with status filter
- [ ] `POST /recurring` — validate: name (max 500), amount, frequency (allowlist), next_date,
      end_date (optional; if present, must be > next_date)
- [ ] `PATCH /recurring/:id` — re-validate; auto-set `ended` if end_date is in the past
- [ ] `DELETE /recurring/:id` — cascade overrides
- [ ] `POST /recurring/:id/overrides` — create single-instance override
- [ ] `DELETE /recurring/:id/overrides/:overrideId`

**Accounts and Settings API**
- [ ] `GET /accounts`, `PATCH /accounts/:id`
- [ ] `GET /settings`, `PATCH /settings` — validate thresholds (non-negative, warning > critical)

**Testing — Backend (TDD: write tests before implementation)**
- [ ] Unit tests: AES-256-GCM encryption utility (roundtrip, auth tag failure, nonce uniqueness)
- [ ] Unit tests: forecast engine (balance calculation, override application, series expansion)
- [ ] Unit tests: auto-detection heuristics (exact equality grouping, interval clustering)
- [ ] Unit tests: auto-reconciliation logic
- [ ] Unit tests: input validation rules for all write endpoints
- [ ] Integration tests: all API endpoints (happy path + error cases + validation rejection)
- [ ] Integration tests: sync flow with controlled teller.io responses
- [ ] Integration tests: rate limiting on `POST /sync`
- [ ] Integration tests: 409 on `POST /setup/connect` when credentials exist
- [ ] E2E test: full sync → forecast → manual transaction → updated forecast

#### Frontend Tasks

**Setup**
- [ ] Initialize React + TypeScript project with Vite
- [ ] Configure Tailwind CSS with dark/light mode; implement specified color tokens; verify
      4.5:1 contrast ratios in both themes before proceeding
- [ ] Configure TanStack Query and React Router (`/`, `/recurring`, `/settings`)
- [ ] Implement theme toggle in nav header (localStorage, no flash)
- [ ] Implement API client utility
- [ ] Add skip-navigation link at page top

**Calendar View**
- [ ] `CalendarTimeline` — vertical scroll, month sections
- [ ] `MonthSection` — sticky header + day cells
- [ ] `DayCell` — "Today" pill + border accent on current day; transaction list; daily net;
      running balance with color + text label
- [ ] `TransactionItem` — description, ↑/↓ icon + color, source badge, `aria-label`
- [ ] "Show more" — bottom sheet on mobile, in-place on desktop (threshold: 3)
- [ ] `AccountSelector` — compact dropdown, 44px max height on mobile
- [ ] `InlineTransactionEntry` — "+" only on mobile; click-cell or "+" on desktop; focus
      management; visible "Cancel" on mobile
- [ ] `TransactionModal` — focus trap; focus returns to trigger on close
- [ ] Debit/deposit segmented control (`radiogroup`/`radio` semantics)
- [ ] Amount field (positive only, "$" prefix, validation messages)
- [ ] Optimistic updates with error toast on rollback
- [ ] "Edit this occurrence / Edit all future occurrences" context menu; confirmation dialog
      for "all future" before edit form opens
- [ ] Roving tabindex keyboard navigation (arrow keys, Page Up/Down, Home/End, T, Enter,
      Escape)
- [ ] Scroll-to-today on mount; "Jump to Today" in nav
- [ ] First-run and empty states (setup prompt, loading skeleton, empty day cells)

**Balance Health Banner**
- [ ] `BalanceAlertBanner` — collapsible bar below nav, pushes content
- [ ] Scan forecast for first day in yellow/red within 30 days; "View" link scrolls to date
- [ ] Dismiss (×) button; 7-day re-appearance logic
- [ ] Stale-data warning when last sync > 2 hours

**Recurring Transactions Page**
- [ ] `RecurringList` — desktop table; card layout at < 768px
- [ ] `RecurringRow` / `RecurringCard` with inline enable/disable toggle
- [ ] `EditSeriesModal` — full series edit (name, amount, frequency, next date, end date)
- [ ] `PendingReviewSection` — context copy; hidden when empty; nav badge count
- [ ] `EndedSection` — past-end-date transactions
- [ ] Delete confirmation with specified copy
- [ ] "Edit this and all future" confirmation flow

**Settings Page**
- [ ] Account list with include/exclude toggle
- [ ] Threshold inputs (warning + critical) with validation
- [ ] Theme toggle (also in nav header)
- [ ] Sync status: timestamp, status labels, stale warning, "Sync Now" with loading + rate
      limit feedback

**Testing — Frontend (TDD: write tests before implementation)**
- [ ] Unit tests: balance calculation utility
- [ ] Unit tests: `DayCell` rendering (today indicator, truncation, balance color tokens)
- [ ] Unit tests: inline entry validation (amount, description)
- [ ] Unit tests: debit/deposit segmented control state and aria semantics
- [ ] Unit tests: roving tabindex navigation logic
- [ ] Integration tests: calendar renders with API data; add/edit/delete updates balance
- [ ] Integration tests: "Edit all future" confirmation dialog flow
- [ ] Integration tests: banner appears, links to at-risk date, dismisses, reappears after 7d
- [ ] E2E tests (Playwright): view calendar → add transaction → verify balance update
- [ ] E2E tests: recurring management — confirm pending, edit series, override instance, delete
- [ ] E2E tests: keyboard navigation — Tab to calendar, arrow keys, T, Enter to add transaction

---

## 11. MVP vs Phase 2

### Phase 1 — MVP (In Scope)

| Feature                                             | Priority |
|-----------------------------------------------------|----------|
| Calendar forecast view (vertical timeline)          | P0       |
| teller.io sync (hourly + on-demand)                 | P0       |
| Actual transaction display (past/current days)      | P0       |
| Recurring transaction auto-detection                | P0       |
| Recurring transaction management page               | P0       |
| Single-instance override (exception pattern)        | P0       |
| Manual one-off future transactions                  | P0       |
| Running balance with WCAG-compliant color health    | P0       |
| AES-256-GCM token encryption                        | P0       |
| Caddy HTTP Basic Auth + HTTPS enforcement           | P0       |
| HTTP security headers (CSP, X-Frame-Options, etc.)  | P0       |
| Container hardening (non-root, cap_drop)            | P0       |
| Least-privilege Postgres user                       | P0       |
| Input validation on all write endpoints             | P0       |
| Account toggle (single-select, compact mobile)      | P1       |
| Non-intrusive balance alert banner (7d re-appear)   | P1       |
| Dark / light mode toggle (header + settings)        | P1       |
| Auto-reconciliation of actuals vs forecast          | P1       |
| Accessible keyboard navigation (roving tabindex)    | P1       |
| Docker Compose self-hosted deployment               | P0       |

### Phase 2 — Future Features

| Feature                              | Notes                                               |
|--------------------------------------|-----------------------------------------------------|
| Reconciliation mismatch indicator    | Visual flag when actual balance differs from computed |
| P&L reporting / spending analysis    | Category breakdowns, monthly summaries              |
| Data export (CSV, PDF)               | Transaction and forecast export                     |
| Budget features                      | Spending limits by category                         |
| Mobile native apps                   | iOS / Android                                       |
| Multiple user profiles / auth        | Application-layer auth if opened to more users      |
| Notification integrations            | Email or SMS low-balance alerts                     |
| teller.io webhooks                   | Replace polling with real-time event-driven sync    |
| Backup strategy automation           | pg_dump with encrypted storage                      |

---

## 12. Non-Functional Requirements

### Performance

- Calendar renders current month and 2 adjacent months immediately on load
- Forecast computation for 3 months: under 200ms
- Forecast computation for 12 months: target under 500ms; fall back to 3-month if exceeded
- Sync job completion (per account): under 30 seconds
- UI interactions (inline add, toggle, expand): under 100ms (optimistic updates)

### Reliability

- teller.io sync failures must not crash the app or corrupt data
- Database writes are transactional where multiple records are modified together
- Sync job is idempotent — no duplicate records from running twice
- `restart: unless-stopped` on all containers; stale-data warning in UI at > 2 hours

### Security

- AES-256-GCM token encryption; random nonce; auth tag verified on every decryption
- Caddy HTTP Basic Auth on all routes; HTTPS enforced; port 80 redirects to HTTPS
- Recommended DNS-01 ACME certificate strategy (no browser warnings)
- HTTP security headers on all responses (CSP, X-Frame-Options, X-Content-Type-Options,
  Referrer-Policy)
- Postgres internal-only (`expose:`, not `ports:`)
- Certs stored outside project root; `chmod 600`; owner: backend container UID
- Backend: `USER node`; `cap_drop: [ALL]`
- Least-privilege Postgres user (`mazza_app`); DML-only at runtime
- CORS: explicit allowed origin; Origin validation on mutations
- Log sanitization: no credentials, tokens, API responses, or query text in any logs
- `dangerouslySetInnerHTML` prohibited in React frontend
- Raw SQL in Drizzle prohibited without explicit security review
- `.gitignore` / `.dockerignore` exclude all secret file patterns before first commit

### Maintainability

- TypeScript throughout (frontend and backend)
- Drizzle ORM schema is the source of truth for the data model
- Migrations versioned and run automatically on container startup
- Docker Compose allows full teardown and rebuild in under 5 minutes

### Usability

- Mrs. Mazza can add a one-off future transaction and see the updated balance without training
- App is usable on a phone browser (minimum 375px viewport)
- Dark mode applies instantly on toggle without page reload or flash
- First-run experience covers pre-connection, initial sync loading, and empty calendar states

---

## 13. Open Questions and Assumptions

### Resolved from v1.0 Open Questions

| # | Question                                                             | Resolution                                                  |
|---|----------------------------------------------------------------------|-------------------------------------------------------------|
| 1 | teller.io sandbox history sufficient for auto-detection testing?      | Seed test data manually if insufficient                     |
| 2 | Balance threshold defaults?                                           | Warning = $500, Critical = $100 (configurable)              |
| 3 | "Show more" truncation threshold?                                     | 3 visible items                                             |
| 4 | Multi-select or single-select account toggle?                         | Single-select — one account at a time                       |
| 5 | Pending recurring: appear immediately or require confirmation?         | Require confirmation; pending items do NOT enter forecast   |
| 6 | Recurring detection re-run frequency?                                 | Every sync (hourly); idempotent                             |

### Assumptions Made

1. **Caddy HTTP Basic Auth is the access boundary.** If the app is ever exposed to the public
   internet, application-layer authentication must be added before any Phase 2 deployment.

2. **Single teller.io enrollment.** One enrollment covers all accounts. Multiple institutions
   requiring multiple enrollments is a Phase 2 consideration.

3. **Amounts sign convention.** Debits stored as negative; deposits as positive. Enforced from
   teller.io ingestion through forecast display. Amount field accepts positive numbers only;
   debit/deposit control determines sign.

4. **Seed balance source.** Running balance seeded from `accounts.last_balance`. May lag up to
   1 hour between syncs. Stale-data warning at > 2 hours mitigates this.

5. **Credit card accounts connected but display-excluded.** Stored for future Phase 2 use but
   not included in calendar forecast or running balance.

6. **Recurring detection on 90 days of history.** Yearly subscriptions may not auto-detect
   reliably; manual entry is the fallback.

7. **No real-time webhooks in MVP.** Polling (hourly) used for simplicity. Webhooks are Phase 2.

8. **Cert files live outside the project directory.** Example path: `~/.mazza-finance/certs/`.
   Documented in README.md.

9. **Backup strategy is out of scope for MVP.** pg_dump backups contain encrypted tokens and
   must be stored with equivalent access controls. Backup automation is Phase 2.

---

*End of PRD v1.1*
