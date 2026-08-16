# Design: Responsive phone layout

Date: 2026-08-16
Source handoff: `docs/mobile_only/`

## Purpose

Make the app usable on a phone. Today it is effectively desktop-only: across
45 `.tsx` files there are six responsive breakpoint usages in total, five
components escape a narrow viewport by scrolling sideways, and the header
assumes a horizontal nav row.

The handoff is `docs/mobile_only/Mazza Finance Mobile.dc.html` — five screens
in a 393x852 phone frame, on the same design system the app already uses. Its
README points to a "Mobile (<= 640px)" section of the calendar handoff README
for tokens and breakpoint rules. That section does not exist. The `.dc.html`
is therefore the only visual authority, and the rules below are derived from
it.

**Nothing in the handoff is a new feature.** Every screen maps to something
already built — `ProjectionPanel` already computes burn, runway and spend;
`SankeyChart` already exists; `RecurringList` already has a card variant. This
is adaptation, not construction.

## Decisions

Settled before this spec was written; everything below depends on them.

1. **One breakpoint: 640px.** Below it, the phone shell. Above it, today's
   desktop layout, unchanged. Tablets get the desktop layout, whose header
   already wraps. No tablet-specific treatment.
2. **Full feature parity.** Everything reachable on desktop stays reachable on
   the phone. The handoff omits roughly ten controls; they get phone
   treatments rather than being hidden.
3. **Responsive site, not a PWA.** No manifest, no service worker, no offline
   caching. Safe-area insets are still handled so the tab bar clears the home
   indicator. A service worker would interact badly with Caddy basic auth, and
   stale financial data is worse than no data.
4. **CSS by default; JS branching at five enumerated seams.** See "The seam
   rule" below.
5. **Verification is a Playwright mobile project plus unit tests.** No visual
   snapshot baselines — they drift on every font and copy change and cost more
   than they catch for a two-person app.

## The seam rule

The default is one component tree reshaped by Tailwind utilities. JS branching
on viewport is permitted only where CSS genuinely cannot express the change,
and only at these five seams:

| Seam | Phone | Desktop |
|---|---|---|
| `AppLayout` | bottom tab bar, slim header | header nav |
| `Sheet` (shared primitive) | slide-up bottom sheet | centred modal |
| `DayPanel` | rendered inside `Sheet` | inline `<aside>` |
| `TransactionsTable` | card rows | `<table>` |
| `SankeyChart` / `buildSankeyLayout` | narrow vertical geometry | wide horizontal |

This is a closed list. It widens only by an explicit decision recorded here,
never because branching was convenient in the moment. Everything else —
`DayCell`, `ProjectionPanel`, `SummaryCards`, `BreakdownChart`, settings,
recurring — is CSS only and must not call `useIsPhone()`.

Rendering both trees and toggling with `hidden`/`sm:block` is rejected wherever
the duplicated markup is interactive or labelled: it doubles the accessible
row count and produces duplicate landmarks and accessible names. It stays
acceptable for inert presentational fragments.

## Foundations

### Breakpoint and hook

Tailwind's default `sm` is 640px and its utilities are min-width, so the phone
shell is the unprefixed base and desktop rules carry the `sm:` prefix. Every
component touched by this work is therefore read mobile-first, inverting the
current desktop-first habit.

`src/lib/viewport.ts` exports:

```
export const PHONE_QUERY = '(max-width: 639.98px)';
```

The fractional bound avoids the gap at exactly 640px where neither Tailwind's
`sm:` nor a `max-width: 639px` query would match.

`src/hooks/useIsPhone.ts` wraps `matchMedia(PHONE_QUERY)` in
`useSyncExternalStore` — not `useState` plus `useEffect`, so the first render
already has the correct answer and there is no layout flash. It re-renders on
orientation change. It is the only place viewport is read in JS.

### Shell metrics

- `index.html`'s viewport meta gains `viewport-fit=cover`.
- Top and bottom padding use `env(safe-area-inset-top)` and
  `env(safe-area-inset-bottom)` plus a literal offset, not the handoff's fixed
  50px and 22px — those are iOS insets plus real padding, and both resolve to
  0 on Android and desktop Chrome.
- The phone shell is `100dvh` with a `100vh` fallback. `vh` alone is wrong in
  Safari, where the collapsing URL bar makes it overshoot.
- Header and tab bar are fixed; `<main>` is the only scroller.

### Shared classes

`index.css` already carries `hit-target`, which applies `min-height: 44px`
under `@media (pointer: coarse)`. Much of the handoff's 44px requirement is
therefore already met wherever that class is applied; the work is an audit for
interactive elements missing it.

A sibling `list-row` class provides the handoff's 56px list rows, also gated on
`pointer: coarse` so desktop rows stay compact.

## Shell

`AppLayout` is a seam.

**Phone.** A slim sticky header carrying brand, the `21/24` sync counter and
the Sync button; and a fixed bottom `<nav>` of five icon-and-label tabs at
`min-height: 52px` plus bottom inset, using the handoff's inline SVG icons.
`NavLink` still drives it, so routing and active state are unchanged. Only one
`<nav aria-label="Main navigation">` exists at a time.

The tab bar labels the transactions route **"Activity"**, per the handoff. The
route stays `/transactions` and the desktop nav still reads "Transactions".

**Desktop.** Today's header, untouched.

**Account selector.** The handoff's header has no room for it, and parity
forbids dropping it. On phone it moves into the Settings screen's "Accounts in
the forecast" card as the active-account control, and the Transactions screen
shows the selected account in the subtitle the handoff already draws
(`Aug 1 - Aug 31 · Joint Checking`).

## The `Sheet` primitive

`TransactionModal`, `EditSeriesModal` and `ConfirmDialog` each hand-roll
`fixed inset-0 z-50`, a backdrop, Escape handling and focus management — three
copies of the same block, with `RecurringInstanceMenu` a fourth variant.

`src/components/shared/Sheet.tsx` replaces all four shells. It is the single
place the phone/desktop dialog presentation branches, so extracting it *is*
the seam rather than a refactor performed alongside one.

**Phone.** Slides up from the bottom, `border-radius: 24px 24px 0 0`, drag
handle, `max-height` capped so the tab bar stays visible, its own internal
scroller.

**Desktop.** Today's centred dialog, visually unchanged.

**Shared.** Backdrop, `role="dialog"`, `aria-modal="true"`, Escape to close,
focus trap, focus restored to the trigger on close, `body` scroll lock, and
`prefers-reduced-motion` suppressing the slide.

This is the highest-risk change in the project — it touches four working
dialogs — so it lands as its own issue, with its own tests, before anything
depends on it.

## Calendar

### Day panel

The panel body already matches the handoff closely: kind label, full date, two
stat tiles, transaction list, add-transaction CTA. Phone renders that same body
inside `Sheet`, opened by tapping a day and closed by the close button, the
backdrop or Escape. Desktop keeps the `sticky` `<aside>` as-is. The stat tiles
become `grid-cols-2`.

**Consequence:** on desktop, selecting a day updates a persistent panel; on
phone it opens something modal. "Selected day" and "sheet open" therefore
become two pieces of state rather than one. The sheet closes on month
navigation and on tab change; the selection survives, so returning to Calendar
shows the same day highlighted without re-opening the sheet.

### Cells

`DayCell` is `min-h-[126px]` and renders up to `MAX_VISIBLE` transaction rows
plus a `NET` line. None of that fits the handoff's 62px cell. Below `sm` the
cell shows only the day-number pill, a short balance (`3,142` — no cents, no
currency symbol), a `2x` transaction count, and the spend bar.

This is CSS: the transaction list and NET line hide, and only the balance
formatter switches to a short form. `DayCell` is not a seam and must not call
`useIsPhone()`.

Roving-tabindex keyboard navigation stays wired. It is inert without a
keyboard but costs nothing, and Bluetooth keyboards exist.

### Header and projection

`CalendarTimeline`'s month heading and previous/today/next controls stack. The
search input, `w-40` inline today, collapses behind a search icon that opens a
full-width field.

`ProjectionPanel` keeps its dark hero card; the sparkline goes full-bleed and
the burn/runway/spend tiles become a 3-up grid at 8px gap.

## Lists and reports

Four components currently escape a narrow viewport by scrolling sideways:
`TransactionsTable` (`min-w-[720px]`), `SankeyChart` (720px),
`BreakdownChart` (560px) and `MonthlyComparison` (520px). On a 393px screen a
horizontal scroll container is a trap — you lose the row you are reading as
soon as you pan. Each gets a real phone treatment rather than a wider canvas.

`CategorySummaryTable` fails differently: it is `w-full table-fixed` with no
minimum, so it crushes its columns instead of scrolling. It needs the same card
treatment for the same reason.

### Transactions

`TransactionsTable` gains a card-list sibling below `sm`, following the pattern
`RecurringList` already established: description, category dot and label,
source badge, right-aligned amount, 56px row, grouped under sticky
`Sat · Aug 9` day headers. This is a seam.

`SummaryCards` goes 3-up at 8px gap. `CategoryFilterPills` becomes a
horizontally scrolling chip strip — a legitimate horizontal scroll, since chips
are independent and losing your place among them means nothing.

### Recurring

Mostly done already. The existing `md:` card/table split moves to `sm:` so it
agrees with the rest of the app, and the card gains three full-width
Edit / Disable / Delete buttons at 44px. `PendingReviewSection` already stacks
at `sm:` and needs only its button row widened.

### Reports

`buildSankeyLayout` hardcodes `VIEWBOX_WIDTH = 560` and `TARGET_X = 546` at
module scope. The phone needs a 200x480 canvas rendered as a 106px SVG column
with labels beside it. The function therefore takes a dimensions argument;
desktop passes today's constants, phone passes the narrow set, and existing
call sites keep their behaviour through defaults.

It also gains a **top-six-plus-`Other` rollup**, off by default and enabled for
phone. The handoff notes that phones fit only six named categories, and eleven
ribbons in 480px would be unreadable.

`lib/sankey.ts` is pure and already unit-tested, so the parameterisation is
tested at the lib level before `SankeyChart` consumes it.

`BreakdownChart` reflows to a stacked bar plus legend rows, which has no
minimum width. `MonthRangePicker`, `ExportControls`, `MonthlyComparison` and
`CategorySummaryTable` — parity items with no handoff screen — stack vertically
into full-width controls, and both tables become card rows.

### Settings

Already a single column of cards, so the work is mechanical: full-width buttons
and inputs, 56px account rows with the toggle as a real 44px control, the
account selector landing here, and `CsvImportSection`'s drop zone becoming a
tap-to-choose-file box. Drag-and-drop is meaningless on a phone, so below `sm`
it is a button, not a drop target. `UncategorizedReview` already stacks at
`sm:`. `ThemeToggle` stays where it is.

## Testing

**Playwright.** A second project, `mobile`, using `devices['Pixel 5']`
(393x851, near-identical to the handoff's 393x852) against the same Docker
stack. It runs a subset, not a duplicate suite — only flows where the phone
shell genuinely differs: tab-bar navigation, tapping a day to open the sheet
and closing it three ways, add-transaction through the sheet, the transactions
card list, the vertical Sankey. `keyboard.spec.ts` stays desktop-only.

Existing specs that select on desktop-only markup get selectors valid in both
shells rather than being forked.

E2E runtime roughly doubles across the mobile subset. `workers: 1` stays: the
suite trades speed for a reproducible balance, and this work is not a reason to
undo that.

**Vitest.** `useIsPhone` against a mocked `matchMedia`; the `Sheet` primitive's
focus trap, Escape, scroll lock and focus restore; `buildSankeyLayout` with
narrow dimensions and the rollup; the short-balance formatter.

Unit tests deliberately do **not** assert Tailwind class strings. That tests
the stylesheet's spelling rather than the layout, and it rots on every
refactor. Layout is Playwright's job.

## Sequencing

Two milestones, named to match the existing `Redesign:` convention.

**`Responsive: Shell & Sheet Foundations`** — everything else depends on all
four:

1. Mobile-first breakpoint foundation — `PHONE_QUERY`, `useIsPhone()`,
   `viewport-fit=cover`, safe-area utilities, `100dvh` shell, `list-row`,
   hit-target audit
2. Phone app shell — bottom tab bar and slim header in `AppLayout`
3. Shared `Sheet` primitive — extract, then migrate all four dialogs
4. Playwright `mobile` project and CI wiring

**`Responsive: Screens`** — mostly parallel once the above lands:

5. Calendar — compact `DayCell`, header reflow, `ProjectionPanel` 3-up tiles
6. Calendar — `DayPanel` as bottom sheet (needs 3)
7. Transactions — card rows, summary tiles, filter chip strip
8. Recurring — `md:` to `sm:` reconciliation, 44px button rows
9. Reports — parameterise `buildSankeyLayout` dimensions and add the rollup
10. Reports — `SankeyChart`, `BreakdownChart`, `MonthlyComparison`, controls
    (needs 9)
11. Settings — full-width controls, account selector relocation, CSV
    tap-to-choose

Issue 3 carries the most risk (four working dialogs) and issue 9 the only real
arithmetic. Both are sequenced so their tests land before anything consumes
them.

## Out of scope

Two existing issues sit adjacent to this work and stay separate rather than
silently widening it:

- **#27** — light-mode contrast shortfalls inherited from the Momoski handoff.
  This will surface constantly while working in every component. Instances get
  noted on #27, not fixed here.
- **#26** — wire `RecurringInstanceMenu` into the day panel. The `Sheet`
  migration covers that menu's *presentation*; wiring it into the day panel
  remains #26's job.

Also out of scope: any PWA capability, tablet-specific layouts, and visual
regression baselines.
