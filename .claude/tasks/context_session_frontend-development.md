# Context Session: Frontend Development
Created: 2026-02-20
Status: pending (starts after backend API is implemented)
Project: /Users/zac-momoski-tech/code/mazza-finance
Context File: /Users/zac-momoski-tech/code/mazza-finance/.claude/tasks/context_session_frontend-development.md

## Task Type
Frontend Development — React + TypeScript + Vite + Tailwind + TanStack Query

## Goals
Implement the full Mazza Finance frontend following strict TDD. See
`docs/PRD.md` for complete specification.

Working directory: `/Users/zac-momoski-tech/code/mazza-finance/frontend/`

## Tech Stack
- React 18 + TypeScript (strict mode) + Vite
- Tailwind CSS (class-based dark/light mode)
- TanStack Query v5 (all server state)
- React Router v6 (`/`, `/recurring`, `/settings`)
- Vitest + React Testing Library (unit/integration tests)
- Playwright (E2E tests)
- shadcn/ui (component primitives where appropriate)

## Pages and Routes

```
/           → Calendar forecast view
/recurring  → Recurring transaction management
/settings   → Application settings
```

## Component Architecture

### Layout
- `AppLayout` — nav header (theme toggle, "Jump to Today", "Sync Now" button,
  account selector, last-synced timestamp), skip-nav link
- `BalanceAlertBanner` — collapsible bar below nav header

### Calendar (`/`)
- `CalendarTimeline` — vertical scroll container, renders MonthSection per month
- `MonthSection` — sticky month header + list of DayCell components
- `DayCell` — date label, "Today" indicator, transaction list, net, running balance
- `TransactionItem` — amount (↑/↓ icon + color), description, source badge
- `ShowMoreDrawer` — bottom sheet on mobile, inline expansion on desktop
- `InlineTransactionEntry` — inline form (desktop: click-cell; mobile: "+" only)
- `TransactionModal` — full modal form with focus trap
- `RecurringInstanceMenu` — context menu: "Edit this occurrence" vs
  "Edit this and all future occurrences"
- `ConfirmDialog` — reusable confirmation dialog

### Recurring (`/recurring`)
- `RecurringList` — table on desktop, card list on mobile
- `RecurringRow` (desktop) / `RecurringCard` (mobile)
- `PendingReviewSection` — explanatory copy, confirm/dismiss/edit actions
- `EditSeriesModal` — full series edit form
- `EndedSection` — past-end-date transactions

### Settings (`/settings`)
- `AccountSettings` — include/exclude toggles per account
- `ThresholdSettings` — warning + critical inputs with ordering validation
- `ThemeToggle` — also rendered in nav header
- `SyncStatus` — timestamp, status label, "Sync Now" button

## Critical Implementation Rules

### No dangerouslySetInnerHTML
PROHIBITED for any content sourced from teller.io or user input. All
transaction descriptions, account names, and institution names are rendered
as text nodes only.

### Accessibility (WCAG 2.1 AA)
- Calendar keyboard navigation: roving tabindex model
  - Tab → focus calendar widget as a unit
  - Arrow keys → navigate between day cells
  - Page Up/Down → jump one month
  - Home/End → first/last of current month
  - `T` → jump to today
  - Enter → activate focused cell
  - Escape → close inline entry / modal
- Focus management:
  - Inline entry open → focus moves to description field
  - Inline entry close → focus returns to "+" button
  - Modal open → focus trap; close → focus returns to trigger
- All interactive elements: `aria-label` required
- Transaction item aria-label format: "[name], $[amount], [debit|deposit], [actual|forecasted|manual]"
- Debit/deposit control: `role="radiogroup"` + `role="radio"` per option
- Color is NEVER the sole indicator — all color-coded elements pair with icons or text labels
- Skip-navigation link at page top

### Balance Health Color Tokens
Must achieve 4.5:1 contrast — verify before implementation:
| State    | Light mode    | Dark mode    | Text label |
|----------|---------------|--------------|------------|
| Good     | green-700     | green-400    | "Good"     |
| Warning  | amber-700     | amber-300    | "Low"      |
| Critical | red-700       | red-400      | "Critical" |

### Mobile Behavior (375px minimum)
- Account selector: max 44px height
- "Show more": bottom sheet drawer (not in-place expansion)
- Recurring transactions: card layout below 768px
- "+" button always visible on touch (not hover-only)
- Inline entry: "Cancel" button visible (Escape not available on mobile keyboards)

### Debit/Deposit Control
Segmented control:
- "Debit (money out)" and "Deposit (money in)"
- `role="radiogroup"` with `role="radio"` per option
- Active state: fill/background + text weight (not color alone)

### Amount Field
- Positive numbers only (0.01 – 9,999,999.99)
- "$" prefix displayed
- Negative input → "Enter a positive amount. Use the Debit/Deposit selector to indicate direction."

### Today's Cell
- "Today" pill label + left-border accent visible in both themes
- No inline entry on today's cell — modal "+" only

### Theme Toggle
- Persisted to localStorage
- Applied BEFORE first render (no flash)
- In navigation header AND settings page

### Optimistic Updates
- All add/edit/delete operations use TanStack Query optimistic updates
- On server error: rollback + toast "Failed to save transaction. Please try again."
  (auto-dismisses after 5 seconds)

### Balance Alert Banner
- Fixed below nav header; pushes calendar content down (not overlay)
- Scans forecast for first day balance entering yellow or red within 30 days
- Dismissal cooldown: 7 days (stored in localStorage)
- Dismissed state resets if condition disappears and reappears

### API Client
- Base URL: from `VITE_API_BASE_URL` env var
- All mutating requests include `Authorization: Bearer` header if required
  (or rely on Caddy Basic Auth — consistent with backend spec)
- Amounts received from API are decimal strings; parse with decimal.js for any
  display arithmetic

## TDD Requirements

Write tests BEFORE implementation. Test output must be pristine.

### Unit Tests
- Balance calculation utility (decimal string arithmetic)
- `DayCell`: today indicator, truncation threshold, color token application
- `InlineTransactionEntry`: amount validation, negative rejection, max length
- `ThresholdSettings`: ordering validation (warning > critical > 0)
- `RecurringInstanceMenu`: "Edit all future" triggers confirmation dialog
- Roving tabindex keyboard navigation logic
- Source badge text labels and aria-label format

### Integration Tests
- Calendar renders with API data; add transaction → balance updates
- "Edit all future" flow: confirmation dialog appears before form
- Banner appears, "View" link scrolls to date, dismiss, reappears after 7 days
- Pending review section: hidden when empty, badge count updates on confirm/dismiss

### E2E Tests (Playwright)
- View calendar → add future transaction → verify balance update
- Recurring management: confirm pending → verify forecast includes it
- Edit single occurrence (no confirmation) vs. edit all future (confirmation required)
- Keyboard navigation: Tab to calendar → arrow keys → T for today → Enter to add
- Dark/light mode toggle: no flash on reload
- Mobile viewport (375px): account selector, bottom sheet, card layout

## Files to Create

```
frontend/
├── src/
│   ├── main.tsx
│   ├── App.tsx               # Router setup, QueryClient provider
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppLayout.tsx
│   │   │   └── BalanceAlertBanner.tsx
│   │   ├── calendar/
│   │   │   ├── CalendarTimeline.tsx
│   │   │   ├── MonthSection.tsx
│   │   │   ├── DayCell.tsx
│   │   │   ├── TransactionItem.tsx
│   │   │   ├── ShowMoreDrawer.tsx
│   │   │   ├── InlineTransactionEntry.tsx
│   │   │   ├── TransactionModal.tsx
│   │   │   └── RecurringInstanceMenu.tsx
│   │   ├── recurring/
│   │   │   ├── RecurringList.tsx
│   │   │   ├── RecurringRow.tsx
│   │   │   ├── RecurringCard.tsx
│   │   │   ├── PendingReviewSection.tsx
│   │   │   ├── EditSeriesModal.tsx
│   │   │   └── EndedSection.tsx
│   │   ├── settings/
│   │   │   ├── AccountSettings.tsx
│   │   │   ├── ThresholdSettings.tsx
│   │   │   ├── ThemeToggle.tsx
│   │   │   └── SyncStatus.tsx
│   │   └── shared/
│   │       ├── ConfirmDialog.tsx
│   │       ├── SegmentedControl.tsx
│   │       ├── AmountField.tsx
│   │       └── SourceBadge.tsx
│   ├── pages/
│   │   ├── CalendarPage.tsx
│   │   ├── RecurringPage.tsx
│   │   └── SettingsPage.tsx
│   ├── hooks/
│   │   ├── useCalendar.ts     # TanStack Query for forecast
│   │   ├── useAccounts.ts
│   │   ├── useRecurring.ts
│   │   ├── useSettings.ts
│   │   └── useSync.ts
│   ├── api/
│   │   ├── client.ts          # Fetch wrapper
│   │   └── types.ts           # API response types
│   └── lib/
│       ├── balance.ts         # Balance health logic (using decimal.js)
│       ├── theme.ts           # Theme toggle + localStorage
│       └── keyboard.ts        # Roving tabindex utilities
├── tests/
│   ├── unit/
│   └── e2e/
│       └── *.spec.ts
├── public/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.ts
└── playwright.config.ts
```

## Agent Activity Log
<!-- Subagents MUST append their entries below this line -->

**Agent**: mazza-developer-frontend-ui
**Started**: 2026-02-20 21:00
**Completed**: 2026-02-20 22:05
**Status**: success
**Task**: Implement full React frontend per PRD spec

**Findings**:
- TDD applied strictly: 65 unit tests written before implementation, all passing
- TypeScript strict mode required removing all `import React` bare imports (react-jsx transform handles JSX automatically)
- `useThresholds()` hook exposes `yellowThreshold` — callers destructure with rename to `criticalThreshold` where needed
- Vite's `import.meta.env` requires `"types": ["vite/client"]` in tsconfig to type-check cleanly
- Production build: 288kB JS / 29kB CSS, no warnings

**Actions Taken**:
- Scaffolded Vite + React 18 + TypeScript project manually (interactive CLI not usable in non-TTY)
- Configured Tailwind (class-based dark mode), PostCSS, Vitest + jsdom test environment
- Implemented `lib/balance.ts` (decimal.js arithmetic, health thresholds, formatCurrency) with 19 tests
- Implemented `lib/keyboard.ts` (roving tabindex state machine) with 12 tests
- Implemented `lib/theme.ts` (localStorage persistence, flash-prevention script in index.html)
- Implemented `api/types.ts` and `api/client.ts` (typed fetch wrappers for all 12 API endpoints)
- Implemented TanStack Query v5 hooks: useAccounts, useForecast, useRecurring, useSettings, useSync
- Implemented shared components: AmountField (9 tests), SourceBadge (7 tests), ConfirmDialog, SegmentedControl
- Implemented calendar: TransactionItem (7 tests), DayCell (11 tests), MonthSection, CalendarTimeline, ShowMoreDrawer, InlineTransactionEntry, TransactionModal, RecurringInstanceMenu
- Implemented layout: AppLayout (nav header, skip-nav, account selector, sync button, theme toggle), BalanceAlertBanner (30-day scan, 7-day dismissal cooldown)
- Implemented recurring: RecurringList (desktop table + mobile cards), PendingReviewSection, EditSeriesModal
- Implemented settings: ThemeToggle, ThresholdSettings (ordering validation), AccountSettings, SyncStatus
- Implemented pages: CalendarPage, RecurringPage, SettingsPage
- Implemented App.tsx with BrowserRouter, QueryClientProvider, AccountContext, localStorage persistence
- All 65 unit tests pass; `npm run build` succeeds cleanly

**Blockers/Issues**:
- None — all issues resolved during implementation

**Files Modified**:
- frontend/index.html
- frontend/package.json, tsconfig.json, tsconfig.node.json, vite.config.ts, tailwind.config.ts, postcss.config.js
- frontend/src/main.tsx, App.tsx, index.css
- frontend/src/api/client.ts, types.ts
- frontend/src/lib/balance.ts, keyboard.ts, theme.ts
- frontend/src/hooks/useAccounts.ts, useForecast.ts, useRecurring.ts, useSettings.ts, useSync.ts
- frontend/src/components/shared/AmountField.tsx, ConfirmDialog.tsx, SegmentedControl.tsx, SourceBadge.tsx
- frontend/src/components/calendar/CalendarTimeline.tsx, DayCell.tsx, InlineTransactionEntry.tsx, MonthSection.tsx, RecurringInstanceMenu.tsx, ShowMoreDrawer.tsx, TransactionItem.tsx, TransactionModal.tsx
- frontend/src/components/layout/AppLayout.tsx, BalanceAlertBanner.tsx
- frontend/src/components/recurring/EditSeriesModal.tsx, PendingReviewSection.tsx, RecurringList.tsx
- frontend/src/components/settings/AccountSettings.tsx, SyncStatus.tsx, ThemeToggle.tsx, ThresholdSettings.tsx
- frontend/src/pages/CalendarPage.tsx, RecurringPage.tsx, SettingsPage.tsx
- frontend/tests/setup.ts
- frontend/tests/unit/balance.test.ts, keyboard.test.ts, AmountField.test.tsx, SourceBadge.test.tsx, DayCell.test.tsx, TransactionItem.test.tsx

---

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
