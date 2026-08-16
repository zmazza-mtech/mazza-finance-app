# Design: Calendar redesign and spend trending

Date: 2026-08-15
Source handoff: `docs/design_handoff_calendar_and_spend_trending/`

## Purpose

Two user-facing goals, taken from the handoff:

1. **Spend trending is always visible.** An always-on projected-balance strip
   above the calendar carrying burn rate, runway, month-to-date spend and the
   biggest category mover.
2. **The day-by-day calendar is readable.** Cells show three named
   transactions with amounts, an overflow count, the day net, the running
   balance and a spend-intensity bar. A persistent day panel replaces the
   hover popover.

Every screen moves onto the Momoski Tech design system — warm cream, sage and
bark — replacing the current Tailwind gray/blue defaults. Reports gains a
hand-built Sankey view.

The handoff is the visual authority: colors, typography, spacing, radii and
copy in it are final and this document does not restate them. This document
covers what the handoff leaves open — module boundaries, the data the metrics
need, precise metric definitions, geometry, sequencing and testing.

## Decisions

These were settled before the spec was written and constrain everything below.

| Question | Decision |
| --- | --- |
| Dark mode | Deferred. Restyled components drop their `dark:` variants so dark renders identical to light rather than half-broken. `ThemeToggle`, `lib/theme.ts`, the localStorage key and the `index.html` flash script all stay wired. A dark palette is a follow-up slice. |
| Spec scope | All nine slices specified up front. Slices 5–8 are specified before the token system has met real components; assumptions in those sections are marked. |
| Testing line | Strict TDD on pure logic, the new endpoint and component behavior. Pure styling is verified in-browser against the prototype. See [Testing](#testing). |
| Missing category colors | The palette is extended with three new hues. See [Palette extension](#palette-extension). |
| Icons | Hand-rolled inline SVG at 2px stroke and round caps. No `lucide-react`. |
| Font loading | Self-hosted `woff2`. The handoff's "load from Google Fonts, no local files" cannot work — see [Fonts and CSP](#fonts-and-csp). |

## Palette extension

The handoff's category color table lists 13 categories. The application has 16:
`Loan Payments`, `Taxes` and `Fitness` were added in commit `b108716`, after the
design was authored. The three unspent Momoski tokens are not usable for this —
`sage-lighter #D4E4D4` is too pale to read as a 6px dot on white.

Three new hues, tuned to the system's warm, desaturated character:

| Category | Hex | Character | Contrast on white |
| --- | --- | --- | --- |
| Loan Payments | `#8A5570` | muted plum | 5.8:1 |
| Taxes | `#9C7C36` | muted ochre | 3.9:1 |
| Fitness | `#4E7F7A` | muted teal | 4.5:1 |

`#4E7F7A` is the one cool-leaning hue in the palette. It earns that because
every warm slot near it is already spent and a fourth green would be
indistinguishable from the sage family at dot size.

All three clear 3:1 against white, the threshold for a non-text graphical
indicator. Category names always appear as text beside the dot, so color is
never the sole signal.

## Fonts and CSP

`Caddyfile:38` sets `style-src 'self' 'unsafe-inline'; font-src 'self'`. A
`<link>` to `fonts.googleapis.com` is blocked by `style-src` and the `.woff2`
files it references are blocked by `font-src`. Following the handoff literally
yields system fallback fonts on every screen plus console CSP violations.

Bricolage Grotesque, Instrument Sans and JetBrains Mono are therefore
self-hosted: subsetted `woff2` files in `frontend/public/fonts/`, declared with
`@font-face` and `font-display: swap` in `frontend/src/index.css`. CSP is
unchanged, the app renders correctly with no internet access, and no request
leaves the home network on page load.

## Architecture

### New pure modules

The handoff dictates markup and color but not where logic lives. Four new
modules hold everything derived, each independently testable with no React
dependency:

| Module | Responsibility | Arithmetic |
| --- | --- | --- |
| `lib/metrics.ts` | Daily net, daily spend, max daily spend in month, month-to-date spend, burn rate, runway, low point, end-of-window balance | `decimal.js` |
| `lib/trends.ts` | Biggest mover, spend vs. three-month average — operates on trailing category buckets | `decimal.js` |
| `lib/chart.ts` | Balance-curve geometry: y-scale, point coordinates, settled/forecast path split, low-point marker | float (pixel geometry) |
| `lib/sankey.ts` | Sankey geometry: row heights with the 10px floor, node rects, ribbon bezier paths, label percentages | float (pixel geometry) |

Float arithmetic is confined to `chart.ts` and `sankey.ts`, and only for pixel
positions. Both take decimal strings in and convert at the boundary, exactly as
the current `SankeyChart.tsx` does deliberately.

### Single source of category color

`lib/categoryColors.ts` exports `CATEGORY_COLORS: Record<Category, string>` as
raw hex. Today that mapping is duplicated and divergent: `CategoryBadge.tsx`
carries 16 entries as Tailwind classes, `SankeyChart.tsx` carries 13 as hex.
Both collapse onto the new module, which is also consumed by the day panel
dots, the recurring series dots and the Sankey ribbons. SVG fills need hex, so
hex is the canonical form and Tailwind arbitrary values reference it where a
class is wanted.

### New components

- `components/calendar/ProjectionPanel.tsx` — the espresso card and its stats
- `components/calendar/BalanceChart.tsx` — the `0 0 1140 190` SVG
- `components/calendar/DayPanel.tsx` — persistent day detail, replacing the popover
- `components/shared/Icon.tsx` — named inline SVG icons

### Removals

- `components/calendar/ShowMorePopover.tsx` — deleted; overflow is read in the day panel
- `recharts` — dropped from `frontend/package.json`; `SankeyChart.tsx` is rewritten as hand-built SVG and is the only consumer

## Backend: trailing category totals

Biggest mover and spend-vs-average both need *same-day-of-month spans* — Aug
1–15 compared against Jul 1–15, not against all of July. Whole-month buckets
are therefore the wrong shape, and four client round-trips against the existing
endpoint is wasteful.

New sibling endpoint, leaving `category-summary` and its contract untouched:

```
GET /api/reports/category-trend?accountId=<uuid>&asOf=YYYY-MM-DD&months=<1..12>
```

Returns `months` buckets, newest first. Bucket 0 covers the month containing
`asOf`, from month-start through `asOf`. Each earlier bucket covers month-start
through the same day-of-month, clamped to that month's length — `asOf` of
Aug 31 gives a February bucket ending Feb 28 (or Feb 29 in a leap year).

```json
{
  "data": {
    "months": [
      {
        "month": "2026-08",
        "startDate": "2026-08-01",
        "endDate": "2026-08-15",
        "income":    [{ "category": "Income", "total": "4837.32" }],
        "expenses":  [{ "category": "Groceries", "total": "-412.18" }],
        "transfers": []
      }
    ]
  },
  "error": null
}
```

Shape per bucket matches `CategorySummaryResponse` so the existing splitting
logic is shared rather than reimplemented. That splitting logic moves into
`backend/src/services/reports.ts` and both routes call it.

While in this file: `backend/src/api/reports.ts:44` currently does
`parseFloat(total) > 0`. It is only a sign test so it is not presently wrong,
but it is float arithmetic on money in a file this work modifies. It is
replaced with a `Decimal` sign check.

Zod schema in `backend/src/lib/validate.ts`, with `months` bounded to 1–12 and
`asOf` validated as `YYYY-MM-DD`.

## Metric definitions

Ambiguities the handoff leaves open, resolved here. All money arithmetic is
`decimal.js`.

**Day spend** — the absolute sum of negative amounts on a day. Positive
amounts do not offset it.

**Max daily spend in month** — the maximum day spend across the days of the
viewed month. Drives the spend-bar ratio. Zero when the month has no spend, in
which case every bar has height zero.

**Spent MTD** — sum of day spend from day 1 of the viewed month through today.

**Burn rate** — spent MTD divided by days elapsed, where days elapsed is
today's day-of-month. Displayed as `$244/day`.

**Runway** — projected end-of-window balance divided by burn rate, floored to
whole days. Two edges: burn rate of zero displays `—`; an end balance at or
below zero displays `0 days runway`.

**Low point** — the minimum `runningBalance` across the viewed month, with its
date. Ties resolve to the earliest date.

**Comfort floor** — the existing `good` threshold from settings, default
`1000`. Not a new setting. The projection note reads "under your $X comfort
floor" when the low point is at or below it, and "still above your comfort
floor" otherwise.

**Spent vs. average** — spent MTD compared against the mean of the three prior
same-span buckets from `category-trend`. Rendered `▲ 12% vs. average` in
`copper-light` when above, `▼` in `sage-light` when below. A zero average hides
the sub-line entirely rather than rendering an infinite percentage.

**Biggest mover** — the category with the largest absolute difference between
its current-span total and the previous month's same-span total. Ties resolve
to the larger absolute current total. With no prior bucket the value displays
`—` and the sub-line is hidden.

### Projection panel and month navigation

The handoff is silent on what the panel shows when the user navigates months.
It tracks the **viewed** month, and degrades:

| Viewed month | Behavior |
| --- | --- |
| Current | As the handoff describes |
| Past | No forecast segment, no today divider. Burn rate and runway display `—`, since both are present-tense concepts. "Spent MTD" label becomes "Spent" and covers the full month. Vs-average and biggest mover remain valid |
| Future | Entirely forecast: no settled segment, no today divider, burn rate and runway `—`, spend figures are forecast sums |

The forecast window itself stays ±3 months, unchanged.

## Chart geometry

`lib/chart.ts`, `viewBox="0 0 1140 190"`, `preserveAspectRatio="none"`.

- `hi = max(balance) × 1.06`, `lo = min(0, min(balance) × 0.9)`
- 6px inset top and bottom, so the plot band is y ∈ [6, 184]
- `x = index ÷ (days − 1) × 1140`; a single-day month yields `x = 0` for that
  point rather than dividing by zero
- Settled path spans day 1 through today, forecast path today through the last
  day. They share the today point so the line is visually continuous
- A degenerate range (`hi === lo`) pins every point to the vertical midpoint
  instead of dividing by zero

Layer order, back to front: warning band, comfort-floor line, area fill,
settled segment, forecast segment, today divider, low-point marker.

## Sankey geometry

`lib/sankey.ts`, `viewBox="0 0 560 452"`. H = 452, top inset 8, node gap 12,
node minimum height 10.

- Rows are expense categories sorted descending by amount, then a final
  **Kept** row valued at income minus expenses, colored `#7B9E7B`
- `avail = H − 16 − 12 × (n − 1)`; `flex = avail − 10n`; row height
  `h = 10 + (value ÷ income) × flex`
- Target nodes: `x=546`, `width=14`, `rx=3`, stacked from `y=8` with 12px gaps
- Source node: `x=0`, `width=14`, `rx=3`, starting at `8 + 12(n − 1) / 2`,
  height equal to the sum of row heights. Source segments are contiguous
- Ribbons: `M14 sy C280 sy 280 ny 546 ny L546 ny1 C280 ny1 280 sy1 14 sy1 Z`,
  filled with the category color at `opacity .32`

Two degenerate cases the geometry must survive: income of zero (render the
empty state, no ribbons) and a negative Kept value (clamp the Kept row to zero
height and surface the overspend in the caption rather than drawing an
inverted ribbon).

Node labels stay DOM text positioned in percentage terms, not SVG `<text>`, so
they remain legible and selectable at any width.

## Slices

Nine slices, each its own GitHub issue and its own branch off `main`, merged as
it lands.

### Slice 0 — Design foundation

Tokens into `frontend/tailwind.config.ts` under `theme.extend`: the full
Momoski color set plus the three palette extensions, `fontFamily` for display /
sans / mono, the major-third `fontSize` scale, `borderRadius`, warm-tinted
`boxShadow`, and the two motion curves. The existing nested
`balance.good/warning/critical` `.light`/`.dark` pairs flatten to single hexes.

Self-hosted fonts in `frontend/public/fonts/` with `@font-face` in
`frontend/src/index.css`. `lib/categoryColors.ts` created and both existing
maps collapsed onto it. `lib/balance.ts` `getBalanceHealthClasses()` returns
the new tokens. `components/shared/Icon.tsx` created with the icons the
redesign needs: chevron-left, chevron-right, chevron-down, search, close, sort
ascending, sort descending, sun, moon.

`AppLayout.tsx` restyled: sticky blurred header, wrapping header row with
`min-width: 0` on the account pill and sync meta, pill nav, account selector
keeping its `<select>` semantics and `AccountContext` behavior, mono sync meta,
bark sync button.

Acceptance: the shell matches the prototype at 1440px, 1150px and 900px with no
horizontal page scroll; `npm run build` and `npm test` pass; no `dark:` classes
remain in the files touched.

### Slice 1 — Trailing category totals

The `category-trend` endpoint above, its Zod schema, the extracted shared
splitting service, and the `parseFloat` fix. Frontend `useCategoryTrend` hook
and API client function plus types.

Acceptance: integration tests against real Postgres cover the normal case,
day-of-month clamping into a short month, leap-year February, an account with
no transactions, and rejection of `months` outside 1–12 and a malformed `asOf`.

### Slice 2 — Calendar metrics

`lib/metrics.ts` and `lib/trends.ts`, fully test-driven, no UI.

Acceptance: unit tests cover every definition in [Metric
definitions](#metric-definitions) including each named edge case; no
`parseFloat` or `Number()` on any money value.

### Slice 3 — Projection panel

`ProjectionPanel.tsx`, `BalanceChart.tsx` and `lib/chart.ts`. Consumes slices 1
and 2. The sticky `BalanceAlertBanner` is dropped from the calendar screen; the
component is kept and restyled for the critical case.

Acceptance: geometry unit tests including the single-day and degenerate-range
cases; the panel matches the prototype; the three degraded month states above
render correctly.

### Slice 4 — Month grid and day panel

`MonthCalendarGrid.tsx` and `DayCell.tsx` restyled to the cell internals in the
handoff — three transaction lines, foot row, spend-bar strip, truncation rules.
`DayPanel.tsx` added, sticky at `top: 88px`. `ShowMorePopover.tsx` deleted and
the hover `+` button removed. `TransactionModal.tsx` restyled and opened from
the panel CTA.

The roving-tabindex grid semantics in `CalendarTimeline.tsx` are preserved
exactly: arrow keys, `T` for today, Enter/Space to add, `/` to focus search,
Escape to close. Day *selection* is new client state and is independent of the
focus ring, so keyboard focus and selection can differ. Default selection is
today.

Acceptance: existing `DayCell` tests updated and passing; new tests cover
selection driving the panel, overflow counts, the empty-day state, and that
every keyboard binding still works; `role="grid"` / `role="gridcell"` and
per-day `aria-label` are unchanged.

### Slice 5 — Transactions

`TransactionsPage.tsx` and `TransactionsTable.tsx` per the handoff. The
existing `<select>` category behavior and the batch-categorize `ConfirmDialog`
flow, including normalized-description matching, are preserved behind the new
inline pill styling.

Acceptance: summary cards recompute against the active filter; sort toggling
and search behavior unchanged; existing tests pass.

### Slice 6 — Recurring

`RecurringPage.tsx`, `RecurringList.tsx`, `PendingReviewSection.tsx`,
`EditSeriesModal.tsx`. The 🔍 emoji is removed. The sub-768px card list is kept
and restyled.

Acceptance: pending section still hides entirely when nothing is pending;
dismiss keeps its confirm dialog; scan result messages carry the specified
colors.

### Slice 7 — Reports

`lib/sankey.ts`, `SankeyChart.tsx` rewritten as hand-built SVG,
`CategorySummaryTable.tsx` restyled, `ReportsPage.tsx` with the Sankey /
Breakdown segmented control as local state. `recharts` removed from
`package.json`.

Acceptance: geometry unit tests including zero income and negative Kept;
`radiogroup` semantics on the segmented control; percentages remain
`decimal.js`-computed; the card scrolls horizontally only below ~720px.

### Slice 8 — Settings

`SettingsPage.tsx` and the five section components. `ThemeToggle.tsx` loses its
emoji for inline SVG. The existing `green > yellow > 0` threshold validation,
the inline balance editor, `includeInView` behavior and `CsvImportSection`
parsing all survive unchanged behind new styling.

Acceptance: threshold validation and its error copy unchanged; the pill toggles
are keyboard operable with correct ARIA; existing tests pass.

### Slice 9 — Dark palette (deferred)

Derive a dark counterpart for every Momoski token and reintroduce `dark:`
variants across all restyled components. Filed with no milestone.

## Testing

Strict TDD applies to:

- `lib/metrics.ts`, `lib/trends.ts`, `lib/chart.ts`, `lib/sankey.ts`
- the `category-trend` endpoint, as integration tests against real Postgres
- component *behavior*: day selection driving the panel, overflow counts,
  keyboard bindings surviving, the category filter recomputing summaries,
  threshold validation

Existing `DayCell`, `TransactionItem` and `balance` tests are updated as
behavior changes rather than deleted.

**Authorized exception.** Pure visual fidelity — colors, typography, spacing,
radii — is verified in-browser against the prototype and is not asserted in
unit tests. Mr. Mazza authorized this scoped exception on 2026-08-15 after
being shown the alternatives. The reasoning: class-name assertions restate the
implementation, are brittle against every design tweak, and provide no evidence
that the rendered result is correct. There is no Playwright harness yet
(issue #3, unstarted), so no visual-regression net exists; standing one up was
offered and declined for now.

No mocks anywhere, per project rule.

## Tracking

| Milestone | Slices |
| --- | --- |
| `Redesign: Calendar & Spend Trending` | 0, 1, 2, 3, 4 |
| `Redesign: Remaining Screens` | 5, 6, 7, 8 |
| *(no milestone — backlog)* | 9 |

All nine issues are checklisted into epic #1. Branches follow
`redesign/<nn>-<slug>`, e.g. `redesign/00-design-foundation`.

## Out of scope

- Any change to the forecast, sync, detection or categorization services
- Any schema migration — this work adds no columns and no tables
- The ±3 month forecast window, which is unchanged
- Dark mode, which is slice 9
