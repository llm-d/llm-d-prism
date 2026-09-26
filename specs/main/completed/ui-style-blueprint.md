# Proposal & Design: UI/Style Blueprint — shared primitives + a `style` skill

## Context / Intent

PR #88 (Results Store closed-beta) added a large amount of UI: a filterable dashboard with
KPI cards, a multi-step upload wizard, auth chrome, admin review panels, and several
dialogs. Nearly all of it was hand-rolled — an audit of this branch found 12 bespoke
modals, ~22 button variants, ~42 ad-hoc status color strings, 19 inline spinners, three
coexisting theming systems, and a CSS-variable token layer that no component actually
uses. The new surfaces import nothing from `src/components/common/`.

The problem is not this PR — it is that Prism has no repeatable way to add UI. Every
feature (human- or agent-authored) re-derives the same visual decisions, and they drift
(e.g. `ChartCard` is dark-only while `Card` supports both modes).

**Intent:** turn the style and UI implementation in this codebase into a repeatable
"blueprint" made of two mutually reinforcing halves:

1. **Code**: a shared primitive library that makes the consistent thing the easy thing.
2. **Contract**: a `skills/style.md` skill that dictates how all UI/style changes are
   made, so humans and agents converge on the library instead of around it.

Either half alone fails: a library without a contract gets bypassed (that is the current
state of `common/` — 9 importers, 0 from PR #88's surfaces); a contract without a library
has nothing to point at.

## Proposed Solution

### Part 1 — Shared UI primitive library (`src/components/ui/`)

Create a `ui/` directory of presentational primitives, distinct from the existing
`common/` (which holds chart-domain components and will be folded in over time):

- `cn()` utility (`src/utils/cn.js`) wrapping `clsx` + `tailwind-merge` — both already in
  `package.json`, currently unused. All variant logic in the primitives uses it.
- `Button` — variants: `primary` (brand emerald), `secondary`, `ghost`, `danger`; sizes
  `sm`/`md`; loading state (absorbs most of the 19 inline spinners).
- `Badge` / `StatusChip` — one component with a status→color map (`staged`, `processing`,
  `in-review`, `approved`, `rejected`, plus generic `info`/`warn`/`error`/`success`).
  Replaces the ~42 ad-hoc status color strings.
- `Modal` — overlay + panel + header/footer slots, escape/backdrop close. Replaces the 12
  hand-rolled `fixed inset-0` overlays.
- `Input`, `Select`, `Textarea`, `Checkbox` — consistent focus rings and dark-mode
  treatment (replaces ~49 ad-hoc input stylings).
- `Panel` (the `bg-white dark:bg-slate-800 rounded-xl border …` card shell), `StatCard`
  (KPI card, superseding `common/Card`), `EmptyState`, `Spinner`.
- Chart layer: `ChartContainer` (light+dark, superseding dark-only `ChartCard`), themed
  axis/grid/tooltip defaults, and a single shared categorical palette exported from one
  module — replacing per-dashboard `SCENARIO_COLORS`/`RUN_COLORS`/`STAT_COLORS` arrays.

### Part 2 — One theming system

Adopt the CSS-variable → Tailwind `@theme` token layer that already exists in
`src/index.css` as the *only* source of color truth:

- Primitives reference tokens (`theme-bg`, `theme-card`, `--brand-accent`,
  `--chart-grid`, …), not raw `slate-800`/hex values.
- Dark mode is handled once, at the token layer, instead of per-callsite `dark:` pairs.
- The 209 hardcoded hex values are migrated opportunistically as call sites move onto the
  primitives (see Rollout).

### Part 3 — `skills/style.md`: the contract

A new skill, following the existing loose-file convention (`skills/fast_docker_dev.md`),
that **dictates all UI/style changes**. It is the written half of the blueprint:

- **Trigger**: any change that adds or modifies JSX markup, Tailwind classes, colors, or
  chart styling.
- **Rules** (enforced by review and by agents loading the skill):
  1. Use primitives from `src/components/ui/` for buttons, badges, modals, inputs, panels,
     stat cards, empty states, spinners. Never re-implement one inline.
  2. Colors come from theme tokens only. No new hex literals or raw palette classes in
     components; chart series colors come from the shared palette module.
  3. New repeated pattern (used ≥2 places)? Extract it into `ui/` in the same PR — do not
     copy-paste.
  4. Every primitive and every screen must work in light and dark mode.
  5. If a needed primitive doesn't exist, the skill defines the process: add it to `ui/`
     with variants, then use it — with a pointer to this spec for design intent.
- The skill also carries the quick-reference style guide itself: spacing scale, radius,
  typography, status→color semantics, and chart defaults — so an agent can produce
  on-blueprint UI without reading the whole codebase.

### Rollout (incremental, no big-bang restyle)

1. Land `cn()`, the `ui/` primitives, the shared chart palette, and `skills/style.md`.
2. Migrate the PR #88 surfaces (`ResultsStore`, `ManageBenchmarks/*`,
   `DataConnections/SubmitValidationPage`) onto the primitives as the proving ground.
3. Ratchet: new/modified code must comply (per the skill); untouched dashboards migrate
   opportunistically. De-fork the `UnifiedDataTable`/`FilterPanel` pairs as part of this.
4. When stable, fold `common/` chart components into the themed chart layer and update
   `specs/main/` to document `ui/` as the system of record.

## Success Criteria

- `skills/style.md` exists and is loadable by agents; `enforce-development-loop` (UI/UX
  stage) references it.
- All buttons, badges, modals, inputs, spinners, and panels in the PR #88 surfaces render
  via `src/components/ui/` primitives; zero hand-rolled `fixed inset-0` overlays remain in
  those files.
- No new hex color literals or per-dashboard palette arrays are introduced after the
  blueprint lands (lint-able: a simple grep in CI can enforce this on changed files).
- `clsx`/`tailwind-merge` are actually imported (via `cn()`), or removed.
- A new dashboard page can be built entirely from primitives + tokens by following
  `skills/style.md`, with no visual review round-trips on basics (buttons, chips, cards).

## Out of Scope

- Adopting an external component library (shadcn/radix/MUI) — revisit only if the in-house
  primitive set proves insufficient; the current need is consistency, not widgets.
- A full visual redesign. The blueprint codifies the existing look (slate + emerald,
  rounded-xl panels); it does not change it.
- Backend/server code and the Results Store API (covered by `specs/main/completed/results-api/`).

---

## Implementation Design

The contract half lives in `skills/style.md` (rules, quick reference, new-dashboard
recipe); this section records the library surface and the decisions behind it.

### Library layout

```
src/utils/cn.js                      clsx + tailwind-merge composition
src/components/ui/
  Button.jsx        variants: primary|secondary|ghost|danger; sizes xs|sm|md; isLoading
  Badge.jsx         Badge (7 tones) + StatusChip (lifecycle status → tone/label/dot)
  Modal.jsx         overlay + dialog; escape/backdrop close; sm|md|lg|xl; footer slot
  FormControls.jsx  Input, Select, Textarea, Checkbox, Label; shared field base + error state
  Panel.jsx         standard card surface; title/actions slots; padding none|sm|md
  StatCard.jsx      KPI tile; details rows; onClick+active = filter card
  Spinner.jsx       Spinner + LoadingState (centered, labeled)
  EmptyState.jsx    icon/title/message/action
  PageHeader.jsx    dashboard header chrome + ShareLinkButton (copy-URL toast)
  ToggleGroup.jsx   segmented control for metric/mode selectors
  charts/
    palette.js      CHART_SERIES (fixed order), seriesColor(), CHART_STATUS
    theme.js        getChartTheme()/gridProps() — chart ink from CSS vars
    Axis.jsx        ChartXAxis/ChartYAxis (theme-aware CustomAxis successors)
    ChartContainer.jsx  theme-aware ChartCard successor; title/subtitle/actions
    ChartTooltip.jsx    ChartTooltip shell + ChartTooltipRow
  index.js          barrel — the only import surface call sites should use
```

### Decisions

- **Tokens.** Primitives use the existing `theme-*` token classes
  (`src/index.css` `@theme` block) for surfaces/ink; accent and status tints are
  Tailwind light+`dark:` pairs *inside primitives only*. Call sites never pick
  colors — they pick `variant`/`tone`/`status`. This keeps the token layer small
  while still giving one place per pattern for dark-mode handling.
- **Chart ink via `getComputedStyle`.** SVG presentation attributes can't parse
  `var()`, so `charts/theme.js` resolves `--chart-grid`/`--chart-axis` at render
  time with dark fallbacks. Recharts 3 supports wrapper components, so
  `ChartXAxis`/`ChartYAxis` mirror the proven `CustomXAxis` pattern.
- **Categorical palette** (`#059669, #0284c7, #d97706, #7c3aed, #db2777`): the
  hue families already in use (emerald/sky/amber/violet/pink), snapped to the
  600 steps so they pass all palette checks — OKLCH lightness band, chroma
  floor, CVD adjacent-pair separation (worst pair ΔE 16.1, target ≥8),
  normal-vision floor, and ≥3:1 contrast — against both `#ffffff` (light) and
  `#0f172a` (dark) surfaces, with zero warnings. 5 slots is deliberate: no
  existing chart exceeds 5 series; overflow folds into "Other".
- **`common/` is superseded, not deleted yet.** `Card` → `StatCard`,
  `ChartCard` → `ChartContainer`, `CustomXAxis/YAxis` → `ChartXAxis/YAxis`.
  `MultiSelectDropdown`, `Row`, `CustomChartTooltip`, `CustomLabel` stay in
  `common/` until their call sites migrate; dead files are removed once
  unreferenced.
- **Forced dark mode unchanged.** `App.jsx` still pins `.dark`; primitives are
  written light+dark so flipping that later is a one-line change.

### Deferred primitives (follow-ups surfaced during migration)

Requested by refactor agents but deliberately not added in the migration pass:

- **Toast/ToastStack** — real gap (bespoke toast stacks in ResultsStore,
  SubmitValidationPage, Dashboard); behavior-bearing, so extracting it is not a
  style-only change. Highest-value follow-up.
- **Stepper/wizard progress** — single surface (SubmitValidationPage) so far;
  extract on second use.
- **Button as anchor** (`<a>` rendering) and amber/warning variant — one call
  site each so far.
- **ToggleGroup full-width mode** — one call site (Local/Cloud ingestion switch).
- **Switch (toggle)** — DataConnectionsPanel has bespoke switch tracks; extract
  when a second surface needs one.
- **Alert/Callout** — error/success banners are bespoke in several panels.
- **Modal `padding="none"` + a `2xl`/full size** — DataInspector's two-pane
  `max-w-6xl h-[90vh]` dialog stays bespoke until Modal supports this shape.
- **Button info/blue variant, outline Badge** — single requesters so far.
- **StatCard `tone` prop** (icon tint) — currently applied via className at
  call sites; extract when a third dashboard needs it.
- **Hero panel + Benchmark scenario shells** — the gradient shells are
  documented as copy-verbatim patterns in skills/style.md; extract into ui/
  once their structure stops churning. (`WellLitHeader`, `SectionLabel`,
  `ChartLegend`, and ToggleGroup `fullWidth` graduated from this list during
  the P/D dashboard exercise.)
- **ChartFilters (collapsible Filters button + control row)**, **BenchmarkTable**
  (the results-matrix style), and the **PrismHome path card shell** — each now
  has 3+ copy-paste instances; extraction candidates surfaced by the second
  clean-run agent.
- **Hero selectable toggle buttons** (3 dashboards) and **primary-outcome
  boxes** (3 dashboards) — extraction candidates from the P/D iteration.
  Shared **number formatters** (tok/s, ms→s) are still per-dashboard.
  (`StatPills`, `FactCell`, `tooltipProps()`, `ChartTooltipRow opacity`, and
  `LoadingState fullPage` graduated from this list during the P/D audit;
  existing dashboards migrate onto them opportunistically.)
- **Gradient hero CTAs and hue-matched tag pills** (PrismHome, wizard CTAs) —
  intentionally bespoke brand flourishes, not primitives.

### Migration order

1. Foundation (this library + `skills/style.md`) — one commit.
2. Per-surface refactors, one commit each, no behavior changes: ResultsStore,
   ManageBenchmarks, DataConnections, Milestone1, Agentic, PrefixCache,
   Regressions, Dashboard(+subdir), Home/Nav/App chrome, Catalog/Schema/
   Inspector/Connections, auth chrome.
3. Cleanup: remove `common/` components with zero remaining importers.
4. Ratchet via the checklist in `skills/style.md`.
