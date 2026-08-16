# Handoff: Calendar redesign + spend trending (Mazza Finance)

## Overview

This package redesigns the Mazza Finance cash-flow app (`zmazza-mtech/mazza-finance-app`, branch `main`) around two goals:

1. **Spend trending is always visible** — an always-on projected-balance strip above the calendar, with burn rate, runway, month-to-date spend and the biggest category mover.
2. **The day-by-day calendar is readable** — cells show three named transactions with amounts, an overflow count, the day net, the running balance and a spend-intensity bar; a persistent day panel holds the full detail instead of a hover popover.

Transactions, Recurring, Reports and Settings are redesigned in the same visual language. Reports gains a Sankey view of income into categories.

Everything is restyled onto the **Momoski Tech design system** (warm cream / sage / bark palette, Bricolage Grotesque + Instrument Sans + JetBrains Mono), replacing the current Tailwind gray/blue defaults.

## About the design files

The files in this bundle are **design references written in HTML** — prototypes that show intended look and behavior. They are not production code to copy. The task is to **recreate these designs in the existing codebase**: React 18 + TypeScript + Vite, Tailwind CSS (class-based dark/light), TanStack Query v5, React Router v6, `decimal.js` for all money arithmetic. Keep the existing component boundaries and data hooks; replace markup and styling.

The prototypes use hard-coded August 2026 sample data and inline styles because of how they were authored. In the real app, all values come from the existing hooks (`useForecast`, `useTransactions`, `useRecurring`, `useCategorySummary`, `useSettings`, `useSync`) and all styling should be Tailwind classes with the tokens listed below added to `tailwind.config.ts`.

**Critical existing rule that still applies:** amounts are decimal strings from the API. Never `parseFloat`/`Number` them for arithmetic — use `decimal.js`, as `lib/balance.ts` already does. The only place float math is acceptable is chart geometry (pixel positions), which the current `SankeyChart.tsx` already does deliberately.

## Fidelity

**High fidelity.** Colors, typography, spacing, radii and copy are final. Recreate pixel-for-pixel using Tailwind classes with the tokens below. Layout numbers in this document are the intended values, not approximations.

---

## Design tokens

Add these to `tailwind.config.ts` under `theme.extend`. They come from the Momoski Tech design system.

### Colors

| Token | Hex | Use |
| --- | --- | --- |
| `sage` | `#7B9E7B` | primary; positive/enabled states, spend bars (light) |
| `sage-light` | `#A3BFA3` | balance curve stroke on dark, low-spend bars |
| `sage-lighter` | `#D4E4D4` | active nav pill, "Actual" badge background |
| `sage-dark` | `#5A7A5A` | income amounts, confirm button, links |
| `sage-deep` | `#3D5C3D` | positive amounts, "good" balance, badge text |
| `bark` | `#5D4037` | primary buttons, today chip, display headings |
| `bark-light` | `#7B5B4F` | debit amounts, "Forecast" badge text |
| `bark-lighter` | `#A68B7B` | — |
| `bark-dark` | `#3E2723` | display heading color, button hover |
| `cream` | `#FAF7F2` | page background (never pure white pages) |
| `cream-mid` | `#F0EBE3` | borders, dividers, muted fills |
| `warm-gray` | `#B5AEA4` | tertiary text, mono metadata |
| `stone` | `#8A8279` | muted body text |
| `charcoal` | `#3A3530` | body text |
| `espresso` | `#2A2420` | projection panel background |
| `copper` | `#C17D4A` | accent: add-transaction CTA, warning balance, low-point marker, pending badge |
| `copper-light` | `#D9A373` | dining category, dark-panel accent text |
| `copper-dark` | `#9B5F30` | copper button hover, "Low" threshold label |
| `error` | `#C1574A` | critical balance, heavy-spend bar, delete affordance |
| `border-mid` | `#E3DDD2` | dashed drop zone, emphasized card border |

Replace the existing `balance.good/warning/critical` tokens in `tailwind.config.ts` with:

- good → `#3D5C3D` (sage-deep)
- warning → `#C17D4A` (copper)
- critical → `#C1574A` (error)

These are the values `lib/balance.ts` `getBalanceHealthClasses()` should return. Contrast on cream is ≥ 4.5:1 for all three.

### Category colors

Used for the dot beside a transaction, the Sankey ribbons and the recurring-series dot. Replace the current `CATEGORY_CLASSES` map in `components/shared/CategoryBadge.tsx` and `CATEGORY_COLORS` in `components/reports/SankeyChart.tsx` with:

| Category | Hex |
| --- | --- |
| Income | `#5A7A5A` |
| Housing | `#5D4037` |
| Utilities | `#7B9E7B` |
| Groceries | `#A3BFA3` |
| Transportation | `#C17D4A` |
| Insurance | `#8A8279` |
| Healthcare | `#C1574A` |
| Entertainment | `#A68B7B` |
| Dining | `#D9A373` |
| Shopping | `#7B5B4F` |
| Subscriptions | `#B5AEA4` |
| Transfers | `#3D5C3D` |
| Other | `#B5AEA4` |

### Typography

Load from Google Fonts (one stylesheet link, no local files):

```
https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,200..800&family=Instrument+Sans:wght@400..700&family=JetBrains+Mono:wght@400;500&display=swap
```

| Role | Family | Notes |
| --- | --- | --- |
| Display | `Bricolage Grotesque`, Georgia, serif | headings; `letter-spacing: -0.02em` at 2rem+, `-0.01em` below; `line-height: 1.1–1.15`; weight 600–700 |
| Body | `Instrument Sans`, system-ui, sans-serif | all UI text; `line-height: 1.65` for prose, 1.3–1.45 in dense rows |
| Mono | `JetBrains Mono`, ui-monospace, monospace | **every money value**, dates, and labels. As a label: uppercase, `letter-spacing: 0.12–0.14em`, 10–11px, color `warm-gray` |

Type scale (major third): `xs .75rem` / `sm .875rem` / `base 1rem` / `lg 1.125rem` / `xl 1.25rem` / `2xl 1.563rem` / `3xl 1.953rem` / `4xl 2.441rem`.

Page titles use `4xl` display. Card titles use `xl` display. Section metric values use `2xl` mono.

### Spacing, radii, shadows, motion

- Spacing: 8-pt base — 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64px.
- Radii: `sm 4` / `md 8` (fields, small tiles) / `lg 16` (cards) / `xl 24` (projection panel) / `full 9999` (**all buttons and pills — buttons are always pill-shaped**).
- Shadows are warm-tinted, never black: `sm 0 1px 2px rgba(93,64,55,.06)` / `md 0 4px 12px rgba(93,64,55,.08)` / `lg 0 8px 32px rgba(93,64,55,.12)` / `xl 0 16px 48px rgba(93,64,55,.16)`. Cards have **no shadow at rest**, `md` on hover.
- Motion: `ease-out cubic-bezier(.16,1,.3,1)` (primary), `ease-spring cubic-bezier(.34,1.56,.64,1)` (small lifts); durations 150ms / 300ms / 500ms.
- Hover: buttons lift `translateY(-1px)` + shadow; ghost buttons take a `cream-mid` background. Press returns to baseline, no shrink.
- Layout max width **1200px**, horizontal padding 24px.
- No emoji anywhere. The current `ThemeToggle` (🌙/☀️) and `RecurringPage` (🔍) emoji must be replaced with inline SVG icons (2px stroke, round caps) or text labels.

---

## App shell

Replaces `components/layout/AppLayout.tsx`.

- Sticky header, `background: rgba(250,247,242,0.92)` with `backdrop-filter: blur(12px)`, bottom border `cream-mid`, min-height 64px, inner max-width 1200px, padding `10px 24px`.
- **The header row must wrap** (`flex-wrap: wrap`, `gap: 12px 20px`) and the account pill and sync meta must be allowed to shrink (`min-width: 0` + truncate). Without this the row forces horizontal page scroll below ~1150px. Only the brand and Sync button keep `flex-shrink: 0`.
- Brand: "Mazza Finance", display font, 19px, weight 700, `letter-spacing -0.02em`, color `bark-dark`.
- Nav: pill buttons, 14px, padding `7px 14px`, radius full. Active = `sage-lighter` background + `sage-deep` text + weight 600. Inactive = `stone` text, hover `cream-mid` background. Order: Calendar, Transactions, Recurring, Reports, Settings.
- Account selector: white pill, 1px `cream-mid` border, 13px, shows `Joint Checking · $3,142.00` (name, middot in `warm-gray`, balance in mono). Keeps the existing `<select>` semantics and `AccountContext` behavior.
- Sync meta: mono 11px uppercase `letter-spacing .12em`, `warm-gray` — `Synced 07:14 · 21/24` (remaining/limit, same data as today).
- Sync button: `bark` background, `cream` text, 14px weight 600, padding `8px 16px`, radius full; hover `bark-dark` + 1px lift. Disabled at limit as today.
- The current sticky `BalanceAlertBanner` is dropped from the calendar screen — the projection panel already names the low point and date. Keep the component for the critical case if you want, restyled: `#FAF7F2` background, 1px `border-mid`, copper text, pill Dismiss.

---

## Screen 1 — Calendar (`pages/CalendarPage.tsx`)

Purpose: see whether money holds up over the next 30 days, and what happens on any single day.

### 1a. Projection panel (new — the "spend trending" strip)

Full-width card, `espresso` background, radius 24, padding `24px 28px 20px`, margin-bottom 20.

Top row, `flex`, `space-between`, `gap: 32px`, wraps:

- Left block:
  - Label: mono 10px uppercase `.14em`, `sage-light` — "Projected balance · through Aug 31".
  - Value: display 2.441rem, `line-height 1.05`, `letter-spacing -.02em`, `cream` — end-of-window projected balance (last day's `runningBalance`).
  - Note: 13px, `copper-light` — "Low point $836.69 on Aug 27 — under your $1,000 comfort floor". Text switches to "still above your comfort floor" when the minimum stays above the green threshold.
- Right block, three stats, `gap: 28px`. Each: mono 10px uppercase `.14em` `stone` label, mono 1.25rem `cream` value, 12px sub-line:
  - **Burn rate** — `$244/day` (the `/day` suffix 12px `warm-gray`); sub-line `10 days runway` in `warm-gray`. Burn rate = total spend (sum of negative amounts) month-to-date ÷ days elapsed. Runway = projected end balance ÷ burn rate, floored.
  - **Spent MTD** — sum of negative amounts from day 1 through today; sub-line `▲ 12% vs. average` in `copper-light` (compare against the 3-month average for the same day-of-month span; use `▼` and `sage-light` when below).
  - **Biggest mover** — the category with the largest absolute change vs. the previous month; sub-line `+$180.00 vs. July` in `warm-gray`.

Chart, directly below, `viewBox="0 0 1140 190"`, `preserveAspectRatio="none"`, height 190, full width:

- Warning band: `rect` from the comfort-floor y down to the bottom, `#C17D4A` at `opacity .10`.
- Comfort-floor line: 1px `#C1574A`, `stroke-dasharray="4 5"`, `opacity .8`.
- Area under the whole balance series: `#7B9E7B` at `opacity .18`.
- Settled segment (day 1 → today): `#A3BFA3`, `stroke-width 2.5`, solid, `stroke-linejoin: round`.
- Forecast segment (today → last day): same stroke, `stroke-dasharray="6 5"`, `opacity .85`. The two paths share the today point so the line is continuous.
- Today divider: vertical 1px `#FAF7F2` at `opacity .35`.
- Low point: `circle r=4.5` filled `#C17D4A`.
- Y scale: `hi = max(balance) * 1.06`, `lo = min(0, min(balance) * 0.9)`, 6px inset top and bottom. X scale: index / (days − 1) across the full width.

Axis row below the chart: mono 10px uppercase `.12em` `stone`, three items spread — `AUG 1` / `TODAY · AUG 15` / `AUG 31 · SOLID = SETTLED, DASHED = FORECAST`.

### 1b. Section header

`flex`, `space-between`, margin-bottom 12: display 1.563rem `bark-dark` "August, day by day"; right side mono 10px uppercase `warm-gray` legend "Bar = spend that day", then ‹ / Today / › controls — 36px circular white buttons with `cream-mid` border and `bark` glyphs, and a pill "Today" button (13px, weight 600, `bark`).

### 1c. Month grid

Wrapper is a **wrapping flex row**, not a fixed 2-column grid: calendar `flex: 1 1 640px; min-width: 0`, day panel `flex: 1 1 320px; max-width: 336px`, `gap: 16px`, `align-items: flex-start`. Below roughly 1000px the panel wraps under the grid instead of crushing the cells.

Calendar card: white, 1px `cream-mid`, radius 16, `overflow: hidden`.

- Weekday header: 7-column grid, `cream` background, bottom border `cream-mid`, each cell padding `10px 0`, centered mono 10px uppercase `.14em` `stone` — SUN…SAT (weeks start Sunday, as today).
- Day grid: 7 columns, cells `min-height: 126px`, right + bottom 1px `cream-mid` borders. Leading/trailing filler cells `#FDFCFA`, no content.
- Cell internals, top to bottom, padding `9px 10px 0`:
  1. Header row, `flex space-between`, `gap: 4px`, **`min-width: 0`**:
     - Day chip: inline-flex, `min-width: 22px`, height 22, padding `0 5px`, radius full, mono 12px, `flex-shrink: 0`. Today = `bark` background + `cream` text. Future days = `stone` text, transparent. Past = `charcoal` text.
     - Running balance: mono 11px, health color (`sage-deep` / `copper` / `error`), right-aligned, **`min-width: 0` + `overflow: hidden` + `text-overflow: ellipsis` + `white-space: nowrap`**. Without these the balance paints over the neighbouring cell at narrow widths.
  2. Transaction lines: up to **3** (was 2), `flex-direction: column`, `gap: 2px`, 11px, `line-height 1.35`. Each line is `flex space-between` with `min-width: 0`: description truncates with ellipsis on the left; amount on the right in mono, `bark-light` for debits and `sage-deep` for credits, also `min-width: 0` + truncate. Signed with `−$` / `+$` (U+2212 minus, not a hyphen). No arrow glyphs and no per-line source badge — source lives in the panel.
  3. Foot row, `flex`, `align-items: baseline`, `space-between`, both spans truncating: overflow count `+2 MORE` (mono 10px `.08em` `warm-gray`) on the left; `NET −$130.37` on the right, mono 10px, `stone` when negative, `sage-deep` when positive. Empty strings when there is nothing to show.
  4. Spend bar strip: 26px tall, `align-items: flex-end`, padding `0 6px`. Bar fills the cell width, `border-radius: 4px 4px 0 0`, height `= ratio × 24px` with a 3px minimum when spend > 0 (0 when no spend), where `ratio = day spend ÷ max daily spend in the month`. Color: `> .55` → `#C1574A`, `> .25` → `#C17D4A`, else `#A3BFA3`.
- Cell states: selected = `cream` background + `inset 0 0 0 2px #7B9E7B`; hover = `cream` background; whole cell is clickable and selects the day. Keep the existing roving-tabindex grid semantics from `CalendarTimeline.tsx` (arrow keys, `T` for today, Enter/Space to open add-transaction, `/` to focus search, Escape to close) — the redesign changes visuals only.
- The hover-only `+` button and the `ShowMorePopover` are removed. Adding a transaction happens from the day panel; overflow transactions are read in the day panel.

### 1d. Day panel (new, persistent)

White card, 1px `cream-mid`, radius 16, padding 20, `position: sticky; top: 88px`.

- Kind label: mono 10px uppercase `.14em` `warm-gray` — "Today" / "Forecast day" / "Settled day".
- Date: display 1.563rem `bark-dark` — "Saturday, August 15".
- Two stat tiles side by side, `gap: 10px`, `cream` background, radius 8, padding 12: **Day net** (mono 1.125rem, `bark-light` negative / `sage-deep` positive, "—" when zero) and **Balance after** (mono 1.125rem, health color).
- Transaction list, one row per transaction, padding `10px 0`, bottom border `cream-mid`:
  - Left: description 14px `charcoal`; below it a meta row with a 6px category dot + category name (mono 10px uppercase `.1em` `stone`) and a source pill (mono 10px uppercase `.1em`, radius full, padding `1px 6px`) — Actual `#D4E4D4`/`#3D5C3D`, Forecast `#F0EBE3`/`#7B5B4F`, Manual `#FAF7F2`/`#8A8279`.
  - Right: amount, mono 14px weight 500, `bark-light` / `sage-deep`, signed.
- Empty state: 13px `stone` — "Nothing scheduled. Balance carries forward."
- Primary CTA full-width pill: `copper` background, white text, 14px weight 600, padding `11px 18px`; hover `copper-dark` + lift — "Add transaction". Opens the existing `TransactionModal` for the selected date (restyle it with these tokens: white panel, radius 16, pill buttons, `cream` fields with `cream-mid` borders).

---

## Screen 2 — Transactions (`pages/TransactionsPage.tsx`)

- Title: display 2.441rem "Transactions"; subtitle 15px `stone` — "Aug 1 – Aug 31, 2026 · Joint Checking" (range + account name).
- Three summary cards, equal columns, `gap: 12px`, white, 1px `cream-mid`, radius 16, padding 18. Label mono 10px uppercase `warm-gray`; value mono 1.563rem. **Money in** (`sage-deep`), **Money out** (`bark-light`), **Net · N transactions** (`bark-dark`). Totals reflect the active filter.
- Filter row, wrapping, `gap: 10px`: a white date-range pill showing `FROM 2026-08-01 TO 2026-08-31` (mono 10px uppercase labels in `warm-gray`); category filter pills — "All categories" plus the categories present in range; active pill = `sage-lighter` background, `sage-deep` text, `sage-light` border; inactive = white with `cream-mid` border and `stone` text. Right-aligned search input, 220px, white, 1px `cream-mid`, radius full, padding `9px 14px` — "Search descriptions".
- Table card: white, 1px `cream-mid`, radius 16, `overflow: hidden`. Header row `cream` background, bottom border `cream-mid`, mono 10px uppercase `.14em` `stone`. Columns `104px | 1fr | 150px | 130px | 110px` with `gap: 12px`, padding `12px 18px`: Date (sortable, shows `↓`/`↑`), Description, Category, Amount (right), Source (right).
- Body rows padding `11px 18px`, bottom border `cream-mid`, hover `cream`. Date mono 12px `stone`. Description 14px `charcoal`, truncates. Category is an inline editable pill (white, 1px `cream-mid`, radius full, 12px, category dot + name + `▾` in `warm-gray`, hover border `sage-light`) — keep the existing `<select>` behavior and the batch-categorize `ConfirmDialog` flow, including normalized-description matching. Amount mono 14px right-aligned, `bark-light`/`sage-deep`. Source pill as in the day panel.

## Screen 3 — Recurring (`pages/RecurringPage.tsx`)

- Header row: display 2.441rem "Recurring" + 15px `stone` sub-line stating counts ("Eight series drive your forecast. Two more are waiting on you."). Right: ghost pill "Scan for patterns" (white, `cream-mid` border, `bark` text) and `copper` pill "Add manually". Both keep current behavior; the 🔍 emoji is removed. Scan result messages: success `sage-dark`, none `stone`, error `error`.
- **Needs your review** card: white, 1px `border-mid`, radius 16, padding 20. Title display 1.25rem + count badge (`copper` circle, white mono 12px, min-width 22, height 22). Body copy 14px `stone` — "We spotted these patterns in your bank history. Confirm the ones we got right, dismiss the rest." Then one row per pending series: `cream` background, 1px `cream-mid`, radius 8, padding `14px 16px`, `flex space-between` — name 15px weight 600, meta mono 12px `stone` (`−$42.00 · Monthly · seen 4 months running`); actions Edit (ghost pill), Dismiss (ghost pill, `stone` text), Confirm (`sage-dark` pill, white text, hover `sage-deep`). Hidden entirely when nothing is pending, as today. Dismiss keeps its confirm dialog.
- Series table card, same shell as Transactions. Columns `1fr | 130px | 120px | 130px | 100px | 210px`, padding `13px 18px`: Series (7px category dot + name, truncates), Amount (mono, right, signed), Frequency (13px `stone`, capitalized), Next date (mono 12px `stone`), Status pill (Active `#D4E4D4`/`#3D5C3D`, Disabled `#F0EBE3`/`#8A8279`), Actions right-aligned — Edit / Disable-Enable / Delete as 12px pills; Delete uses a `#E8D3CE` border and `error` text, hover `#F7EDEB`. Keep the existing `EditSeriesModal` and delete `ConfirmDialog`, restyled.
- The current mobile card list can stay as the sub-768px layout, restyled with the same tokens.

## Screen 4 — Reports (`pages/ReportsPage.tsx`)

- Title display 2.441rem "Reports"; subtitle 15px `stone` — "Aug 1 – Aug 15, 2026 · settled transactions only".
- Chart card: white, 1px `cream-mid`, radius 16, padding 22. Header wraps: left = display 1.25rem "Where the income went" + mono 12px `stone` summary `$4,837.32 in · −$3,663.20 out · $1,174.12 kept`; right = a segmented control (`radiogroup`, `cream` track, 1px `cream-mid`, radius full, padding 4) with **Sankey** and **Breakdown**; selected segment = `bark` background, `cream` text, weight 600.

### Sankey view (default)

Replaces the recharts `Sankey`. Three side-by-side columns in one flex row, `align-items: stretch`:

1. **Left labels**, width 150, `position: relative`. One absolutely positioned block, `right: 12px`, `text-align: right`, `top: <source-center %>`, `transform: translateY(-50%)`: "Income" (14px `charcoal`) and the income total (mono 12px `stone`).
2. **SVG**, `viewBox="0 0 560 452"`, `flex: 1`, `height: auto`. Geometry (H = 452, top inset 8, node gap 12, node min height 10):
   - Rows = expense categories sorted descending by amount, then a final **Kept** row (income − expenses) colored `#7B9E7B`.
   - `avail = H − 16 − 12 × (n − 1)`; `flex = avail − 10n`; each row height `h = 10 + (value ÷ income) × flex`. The 10px floor keeps sub-1% categories visible and their labels legible.
   - Target nodes: `rect x=546 width=14 rx=3`, stacked from y = 8 with 12px gaps, filled with the category color.
   - Source node: `rect x=0 width=14 rx=3`, starting at `8 + 12(n−1)/2` so the bundle is vertically centered against the target column, height = sum of row heights. Source segments are contiguous (no gaps).
   - One ribbon per row: filled path from the source segment to the target node, cubic beziers with control points at the horizontal midpoint (x = 280) — `M14 sy C280 sy 280 ny 546 ny L546 ny1 C280 ny1 280 sy1 14 sy1 Z` — filled with the category color at `opacity .32`.
3. **Right labels**, width 270, `position: relative`. One absolutely positioned row per node at `top: <node-center %>`, `transform: translateY(-50%)`, `left: 12px`, `right: 0`, `flex space-between`: 7px category dot + name (13px `charcoal`, truncates) on the left, `amount · percent` (mono 11px `stone`) on the right.

Caption under the chart: mono 10px uppercase `.12em` `warm-gray` — "Ribbon width = share of income · sage band = kept".

Keep node labels as DOM text positioned in percentage terms rather than SVG `<text>`, so they stay legible and selectable at any width.

### Breakdown view

The prior bar treatment: a 26px full-width stacked bar (one segment per category, 2px gaps, radius full) above one row per category — `150px | 1fr | 120px | 70px`: dot + name, a 10px track (`cream` background) with a filled bar in the category color, amount (mono 14px, right), percent (mono 12px `stone`).

- Below the chart card, two cards side by side (`gap: 16px`): **Income** and **Expenses** summary tables, display 1.25rem titles, rows `1fr | 110px | 60px` (name, amount right, percent right), bottom border `cream-mid`, and a bold Total row. This is the existing `CategorySummaryTable` restyled; percentages stay `decimal.js`-computed.

## Screen 5 — Settings (`pages/SettingsPage.tsx`)

Max width 760px. Title display 2.441rem "Settings" + 15px `stone` sub-line "Sync, thresholds, accounts and imports." Each section is a white card, 1px `cream-mid`, radius 16, padding 22, `gap: 16px` between cards.

1. **Bank sync** — display 1.25rem title; status 14px `sage-dark` ("Last synced 7:14 AM · 2 accounts updated"; failure state in `error`, running in `sage`); mono 11px uppercase `warm-gray` "21 of 24 syncs remaining today". Right: `bark` pill "Sync now", disabled at the limit.
2. **Balance health** — title + 14px `stone` explainer "The calendar colors your running balance against these two lines. Good must sit above Low." Two fields side by side: labels 13px, "Good — at or above" in `sage-deep`, "Low — at or below" in `copper-dark`; inputs `cream` background, 1px `cream-mid`, radius 8, padding `11px 14px`, mono 15px. `copper` pill "Save thresholds" plus 13px `stone` note "Alerts fire when a forecast day crosses either line." Keep the existing `green > yellow > 0` validation and error text in `error` color.
3. **Accounts in the forecast** — title + explainer. One row per account, padding `14px 0`, bottom border `cream-mid`: name 15px `charcoal`; mono 11px uppercase `warm-gray` meta `CHECKING · BALANCE $3,142.00`; right side "Edit balance" text link (`sage-dark`, underline `sage-light`) and a 42×24 pill toggle — track `sage` when on, `cream-mid` when off, 18px white knob with `0 1px 2px rgba(93,64,55,.2)`, knob left 3px / 21px. Keeps the inline balance editor and `includeInView` behavior.
4. **Import transactions** — title + explainer "CSV with date, description and amount columns. Duplicates are skipped." Dashed drop zone: 1px dashed `border-mid`, radius 16, padding 28, `cream` background, 14px `stone` prompt and a ghost pill "Choose file". Existing `CsvImportSection` parsing/preview/error handling unchanged, restyled.
5. **Appearance** — title, 14px `stone` current-mode line, same pill toggle on the right. Emoji removed.

---

## Interactions & behavior

- **Nav** — five routes, unchanged (`/`, `/transactions`, `/recurring`, `/reports`, `/settings`).
- **Day selection** — clicking any day cell selects it and updates the panel; selection is independent from the roving-tabindex focus ring, so keyboard focus and selection can differ. Default selection on load is today.
- **Month navigation** — ‹ / › shift one month; "Today" returns to the current month and reselects today. Forecast window stays ±3 months as today.
- **Chart toggle** — Sankey ⇄ Breakdown is local component state; no refetch.
- **Category filter** (Transactions) — a single active pill; recomputes the three summary cards.
- **Transitions** — 150ms `ease-out` on hover/background changes; 300ms on panel content swaps. No animation on the balance curve on first paint.
- **Loading** — replace the blue spinner with a 32px ring, `sage` track, transparent top, 500ms spin.
- **Error** — inline text in `error` on `cream`; wording unchanged.
- **Responsive** — header wraps; calendar and day panel wrap at roughly 1000px; the Sankey's left/right label columns stay fixed while the SVG flexes, and the whole card scrolls horizontally only below ~720px.
- **Accessibility** — keep every existing role and label: `role="grid"`/`gridcell"` with `aria-label` per day, the sync button's state-dependent labels, `radiogroup` semantics on segmented controls, source and category text labels so color is never the only signal, and 44px minimum hit targets on touch.

## State

Nothing new server-side. New client state: `selectedDay` (calendar, defaults to today), `chartMode` ('sankey' | 'bars'), `categoryFilter` (already exists). Derived values computed from the existing forecast payload with `decimal.js`: daily net, daily spend, max daily spend in month, month-to-date spend, burn rate, runway, low point (date + balance), end-of-window balance, per-category month-to-date totals, biggest mover vs. previous month.

The biggest-mover and vs-average figures need the prior 3 months of category totals. `GET /api/reports/category-summary` already returns category totals for a date range — call it for the trailing months (or add a `months` parameter) rather than computing on the client from a wider forecast window.

## Assets

None. All fonts load from Google Fonts; every mark in the design is text, an inline SVG shape, or a CSS-drawn element. No images, no icon font, no emoji. If icons are wanted beyond the chevrons, use Lucide (2px stroke, round caps) — flagged as a substitution in the design system, so confirm before shipping.

## Files in this bundle

| File | What it is |
| --- | --- |
| `Mazza Finance Redesign.dc.html` | The design to implement. All five screens; nav switches between them; Reports has the Sankey/Breakdown toggle. Open in a browser. |
| `reference/Current-Calendar.dc.html` | Faithful recreation of today's calendar screen (Tailwind gray/blue), for before/after comparison. |
| `reference/Redesign-A-Trend-Tiles.dc.html` | Explored alternative: four metric tiles + rolling-spend sparkline. Not the chosen direction. |
| `reference/Redesign-C-Category-Pulse.dc.html` | Explored alternative: projection block + category vs. 3-month-average bars. Not the chosen direction. |

The prototypes are single self-contained HTML files. Their inline styles are an artifact of the authoring environment — implement with Tailwind classes and the tokens above.

## Source files to change

| Area | Files |
| --- | --- |
| Shell | `frontend/src/components/layout/AppLayout.tsx`, `BalanceAlertBanner.tsx`, `frontend/src/index.css`, `frontend/tailwind.config.ts`, `frontend/index.html` (font link) |
| Calendar | `pages/CalendarPage.tsx`, `components/calendar/CalendarTimeline.tsx`, `MonthCalendarGrid.tsx`, `DayCell.tsx`, `TransactionItem.tsx`, `TransactionModal.tsx`; delete or repurpose `ShowMorePopover.tsx`; new day-panel component |
| Shared | `components/shared/SourceBadge.tsx`, `CategoryBadge.tsx`, `SegmentedControl.tsx`, `DateRangePicker.tsx`, `AmountField.tsx`, `ConfirmDialog.tsx`, `lib/balance.ts` (health colors) |
| Transactions | `pages/TransactionsPage.tsx`, `components/transactions/TransactionsTable.tsx` |
| Recurring | `pages/RecurringPage.tsx`, `components/recurring/RecurringList.tsx`, `PendingReviewSection.tsx`, `EditSeriesModal.tsx` |
| Reports | `pages/ReportsPage.tsx`, `components/reports/SankeyChart.tsx` (rewrite as hand-built SVG; recharts can be dropped), `CategorySummaryTable.tsx` |
| Settings | `pages/SettingsPage.tsx`, `components/settings/SyncStatus.tsx`, `ThresholdSettings.tsx`, `AccountSettings.tsx`, `CsvImportSection.tsx`, `ThemeToggle.tsx` |

Existing project rules still hold: tests before implementation, `decimal.js` for all money math, Zod on every write endpoint, no `dangerouslySetInnerHTML`.
