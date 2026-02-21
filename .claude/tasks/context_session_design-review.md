# Context Session: Design Review
Created: 2026-02-20 00:00
Status: in_progress
Project: /Users/zac-momoski-tech/code/mazza-finance
Context File: /Users/zac-momoski-tech/code/mazza-finance/.claude/tasks/context_session_design-review.md

## Task Type
Design Review — Pre-Development PRD UX/Accessibility Review

## Goals
Review the Mazza Finance PRD (`docs/PRD.md`) for UX design gaps, accessibility
issues, and implementation risks BEFORE development begins. The app does not
exist yet — this is a spec review, not a live browser test.

Flag all concerns by severity: Critical / High / Medium / Low.
Critical, High, and Medium items must be resolved before development starts.

## Files in Scope
- `/Users/zac-momoski-tech/code/mazza-finance/docs/PRD.md` — Full PRD

## Key Context

This is a household personal finance app (Mr. and Mrs. Mazza only). Key
users:
- **Mr. Mazza** — technically proficient, daily user
- **Mrs. Mazza** — non-technical, primary actions are viewing calendar and
  adding one-off future transactions. Must be immediately understandable
  without training.

Target: Web SPA, mobile-responsive, minimum viewport 375px (iPhone SE),
WCAG 2.1 AA compliance.

## Areas to Review

### Calendar View (PRD Section 5.1)
- **Day cell density on mobile**: PRD truncates at 3–4 items per cell. On a
  375px viewport, how much vertical space does each day cell consume? Is the
  layout viable for a month with many transaction-heavy days?
- **Sticky month headers**: Do sticky headers consume too much screen real
  estate on mobile?
- **Running balance placement**: Balance shown at the bottom of each day cell.
  On a phone, is this always visible or will it require scrolling within a cell?
- **Color coding only**: PRD says color is never the sole indicator (green/
  yellow/red with icons/text). Is this spelled out clearly enough for
  implementors? What specific icons or text labels should accompany each color?
- **Today's date indicator**: PRD doesn't explicitly spec a visual "today"
  marker on the calendar. Is scroll-to-today sufficient, or should today's
  cell be visually distinct?

### Transaction Entry (PRD Section 5.2)
- **Inline entry on mobile**: Clicking a future day cell triggers an inline
  form. On mobile touch devices, does "clicking" a cell vs. triggering inline
  entry create ambiguity (tap to expand cell vs. tap to open entry)?
- **Inline vs modal discoverability**: The "+" button is the modal trigger.
  Is the "+" button clearly visible on mobile day cells when they already
  contain truncated transactions?
- **Keyboard accessibility**: Inline entry submits on Enter, cancels on Escape.
  Are there keyboard trap risks? What's the tab order within the inline form?
- **Debit/deposit toggle UX**: How should the toggle look? A switch? A
  segmented control? PRD doesn't specify the control type.
- **Amount field**: Does it accept negative numbers? Or is the debit/deposit
  toggle the sign indicator? This needs to be unambiguous.

### Recurring Transaction Management (PRD Section 5.3)
- **"Edit this instance / Edit all future" context menu**: This is a
  destructive-risk interaction. Accidentally editing "all future" instead of
  "this instance" could corrupt a user's forecast. Is a context menu
  sufficient, or should this require a confirmation dialog?
- **Pending Review section (first-run UX)**: Mrs. Mazza may encounter the
  Pending Review section with no context. The label "Detected — Pending
  Review" may not be self-explanatory. Should there be onboarding copy?
- **End date on recurring transactions**: PRD specifies an optional end date
  field. How does the UI handle a recurring transaction with an end date that
  has already passed? Should it auto-disable?

### Settings Page (PRD Section 5.5)
- **Balance threshold inputs**: Green/yellow/red thresholds. Are these dollar
  inputs? Do they enforce that green > yellow > red? What happens if the user
  enters invalid values (e.g., yellow > green)?
- **Theme toggle placement**: Is it accessible in the settings page only, or
  also in a persistent header? A header toggle is more discoverable.

### Notifications (PRD Section 5.1 — Balance Alert Banner)
- **Banner re-appearance logic**: PRD says "dismisses when the condition is
  resolved or user manually dismisses it." What if the user dismisses it but
  the condition persists for 30 days? Should it re-appear after a cooldown?
- **Banner placement**: At the top of the calendar view? Fixed to viewport
  top? PRD doesn't specify exact placement.

### Accessibility (PRD Section 9)
- **WCAG 2.1 AA color contrast**: Green/yellow/red on both light and dark
  backgrounds must meet contrast ratios. Dark mode yellow on dark background
  is a common failure.
- **Screen reader labels**: PRD says "screen reader labels on all interactive
  elements" — are there specific components that are high risk (e.g., the
  debit/deposit toggle, the inline entry, the account selector)?
- **Focus management**: When the inline entry form opens/closes, where does
  focus go? This needs to be explicitly spec'd.
- **Keyboard navigation on calendar**: Tab through days — on a 12-month
  calendar, tabbing through 365 days is unusable. Does the PRD need to spec
  skip-navigation or month-level keyboard shortcuts?

### Responsive Design
- **Account selector above calendar**: On mobile, does this take up too much
  vertical space? Should it collapse into a compact selector?
- **Table layout for recurring transactions page**: The PRD describes a table
  with 8 columns. An 8-column table is unusable on mobile without horizontal
  scroll or a card layout fallback. The PRD mentions "table or card list" —
  this needs to be more explicit.

## Agent Activity Log
<!-- Subagents MUST append their entries below this line -->

### Template for Subagent Entries:
**Agent**: <agent-type>
**Started**: <YYYY-MM-DD HH:MM>
**Completed**: <YYYY-MM-DD HH:MM>
**Status**: <success|blocked|error>

**Task**: <what the agent was asked to do>

**Findings**:
- <key findings>

**Actions Taken**:
- <what was done>

**Blockers/Issues**:
- <any problems encountered>

**Files Modified**:
- <list of files changed>

---
