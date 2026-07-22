# Design: UI/Style Blueprint

Implementation design for `proposal.md`. The contract half lives in
`skills/style.md` (rules, quick reference, new-dashboard recipe); this file
records the library surface and the decisions behind it.

## Library layout

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

## Decisions

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

## Deferred primitives (follow-ups surfaced during migration)

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

## Migration order

1. Foundation (this library + `skills/style.md`) — one commit.
2. Per-surface refactors, one commit each, no behavior changes: ResultsStore,
   ManageBenchmarks, DataConnections, Milestone1, Agentic, PrefixCache,
   Regressions, Dashboard(+subdir), Home/Nav/App chrome, Catalog/Schema/
   Inspector/Connections, auth chrome.
3. Cleanup: remove `common/` components with zero remaining importers.
4. Ratchet via the checklist in `skills/style.md`.
