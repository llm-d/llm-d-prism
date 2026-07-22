---
name: style
description: The UI/style contract for Prism. Read before ANY change that adds or modifies JSX markup, Tailwind classes, colors, or chart styling — and to scaffold a new dashboard from benchmark results.
---

# Prism Style Contract

Every UI change in Prism goes through this contract. It exists so that humans and
agents produce the same UI the same way: primitives from `src/components/ui/`,
colors from theme tokens, charts from the shared chart layer. If you follow this
file, a new dashboard needs zero visual review round-trips on basics.

## When to use

- Adding or modifying any JSX markup, Tailwind classes, colors, or chart styling.
- Creating a new dashboard or page (see the recipe at the bottom).
- Reviewing a PR that touches `src/components/` or `src/index.css`.

## Changing this contract

This file (and the `src/components/ui/` API it governs) changes only with
approval from one of **@seanhorgan** or **@raji14**. Changes to
`specs/main/roadmap.md` require one of **@seanhorgan** or **@jjk-g**. The full
pipeline and its approval gates are documented in
`specs/main/dashboard-pipeline.md`.

## The rules

1. **Use the primitives.** Buttons, badges/status chips, modals, form fields,
   panels, stat/KPI cards, empty states, spinners, page headers, toggle groups,
   chart containers/axes/tooltips come from `src/components/ui/`. Never
   re-implement one inline. If a variant you need is missing, extend the
   primitive (new `variant`/`tone`/`size`) in the same PR — don't fork it.
2. **Colors come from tokens or the chart palette.** No new hex literals in
   `src/components/` outside `src/components/ui/`. No new per-dashboard color
   arrays — chart series colors come from `CHART_SERIES`/`seriesColor()`.
   Surface/ink colors use the `theme-*` token classes (below).
3. **Extract on second use.** Markup repeated in two places becomes a primitive
   (or a variant of one) in `src/components/ui/` in the same PR. Never
   copy-paste styled JSX between components.
4. **Both themes, always.** Every primitive and screen must render correctly in
   light and dark mode. Prefer token classes (theme-handled once, in
   `src/index.css`); where a tint is needed, pair light + `dark:` classes.
   Never a light-only or dark-only component. (The app currently forces dark
   mode in `App.jsx` — that does not exempt components from light support.)
5. **Class composition uses `cn()`** from `src/utils/cn.js` — never template
   literals with `${}` for conditional classes.
6. **Behavior-free styling changes.** A style refactor never changes state,
   props, data flow, or copy. If you need both, separate the commits.

## Theme tokens

Defined in `src/index.css`; single source of color truth. Dark values apply under
the `.dark` class on `<html>`.

| Tailwind class | CSS variable | Use for |
|---|---|---|
| `bg-theme-bg` | `--bg-primary` | Page background |
| `bg-theme-card` | `--bg-card` | Cards, panels, modals, tooltips |
| `border-theme-border` | `--border-color` | All hairline borders |
| `text-theme-text` | `--text-primary` | Headings, values, primary ink |
| `text-theme-muted` | `--text-muted` | Secondary/label ink |
| (js) `getChartTheme()` | `--chart-grid`, `--chart-axis` | Chart grid + axis ink |
| — | `--brand-accent` | Brand emerald (buttons/links via primitives) |

Accent tints (status chips, focus rings, active states) live inside the
primitives — call sites pick a `tone`/`variant`, never a color class.

## Primitive quick reference

All from `import { ... } from './ui'` (or the relative path to `src/components/ui`).

| Primitive | Key props | Replaces |
|---|---|---|
| `Button` | `variant: primary\|secondary\|ghost\|danger\|dangerOutline\|outline\|link`, `size: xs\|sm\|md\|icon`, `isLoading` | hand-rolled `<button className="px-4 py-2 …">` |
| `Badge` | `tone: neutral\|brand\|success\|info\|warning\|danger\|violet`, `size: xs\|sm\|md` | ad-hoc chip spans |
| `StatusChip` | `status: staged\|processing\|in_review\|approved\|rejected\|…` (auto tone+label+dot) | status color ternaries |
| `Modal` | `isOpen, onClose, title, subtitle, size: sm\|md\|lg\|xl, footer, closeOnBackdrop, closeOnEscape` | `fixed inset-0` overlays |
| `Input/Select/Textarea/Checkbox/Label` | `error`, standard DOM props | ad-hoc form field styling |
| `Panel` | `title, actions, padding: none\|sm\|md` | `bg-white dark:bg-slate-800 rounded-xl border …` shells |
| `StatCard` | `icon, title, value, details[], onClick, active` | KPI cards (clickable = filter card) |
| `EmptyState` | `icon, title, message, action` | "No data" markup |
| `Spinner` / `LoadingState` | `size` / `label, fullPage` | inline `animate-spin` loaders; `fullPage` = pre-data dashboard shell |
| `PageHeader` | `title, subtitle, badge, onNavigateBack, onToggleMobileNav, actions` | dashboard header chrome |
| `ShareLinkButton` | — (copies URL + "Link copied!" toast) | per-dashboard share buttons |
| `ToggleGroup` | `options[{value,label}], value, onChange, fullWidth` | metric/mode pill selectors (single-select) |
| `StatPills` | `options[], active[], onToggle` | stat/percentile visibility multi-toggles |
| `FactCell` | `label, value, title` | scenario-card label + mono value cells |

## Chart rules

- Wrap every chart in `ChartContainer` (`title`, filter controls in `actions`,
  one row above the plot).
- Axes: `ChartXAxis` / `ChartYAxis` (theme-aware; same tick formatting as the
  old `CustomXAxis`/`CustomYAxis`). Grid: `<CartesianGrid {...gridProps()} />`.
- Series colors: `CHART_SERIES` in fixed order — emerald, sky, amber, violet,
  pink. Assign by entity, never by rank: a series keeps its color when filters
  change the series count. More than 5 series → fold into "Other" or use small
  multiples; never invent a 6th hue. The palette is CVD-validated for both
  themes; do not edit it without re-validating.
- Status colors in charts come from `CHART_STATUS` and are reserved for state —
  never used as an extra series color; always paired with a label.
- **One axis.** Never two y-scales on one chart. Two measures of different
  scale → two charts or index to a common base.
- **Canonical metric selectors.** Every latency/throughput chart selector uses
  the same option sets, labels, and order across dashboards:
  - Latency: `NTPOT | TPOT | TTFT | ITL | E2E` (values `ntpot | tpot | ttft |
    itl | e2e`).
  - Throughput: `Output | Input | Total | QPS` (values `output | input |
    total | qps`).
  - Stats: `Mean | P50 | P90 | P99`.
  Omit options the data lacks — never render a selectable metric that can't be
  plotted — but keep the canonical order and labels for the ones present. Do
  not invent synonyms ("Request latency" → `E2E`; "tok/s" variants → the
  canonical four).
- **Stat bars are opacity-encoded, not single-select.** On latency bar charts,
  render the available stats SIMULTANEOUSLY as grouped bars in the SAME series
  color at fixed opacities — `P50`/`Mean` = 1, `P90` = 0.6, `P99` = 0.35 (per
  `<Cell fillOpacity>`; see the Prefix cache latency chart). Visibility is
  controlled by the `StatPills` primitive in the Filters row ("Stats:" /
  "Percentiles:"), and tooltip swatches keep the series color at the stat's
  opacity (`ChartTooltipRow opacity`). When a metric reports only one stat (e.g. mean-only ITL), hide the
  stat control entirely for that metric — no placeholder text.
- **Collapsible chart filters.** When a chart has more than one control group,
  put a `Filters` toggle (Button with a ChevronUp/ChevronDown suffix, default
  open) in the `ChartContainer` actions and collapse the control row behind
  it — see the Prefix cache dashboard's `showChartFilters` pattern. A single
  ToggleGroup does not need the collapse.
- **Bar marks**: `radius={[6, 6, 0, 0]}`, `isAnimationActive={false}`,
  `barCategoryGap="25%"`; `maxBarSize` 80 for single-stat bars, 50 for grouped
  stat bars. recharts `<Tooltip>` gets `{...tooltipProps()}` (standard hover
  cursor wash, no animation, correct z-order) — never inline rgba cursors.
- Tooltips: build on `ChartTooltip` + `ChartTooltipRow` (`opacity` for stat
  rows). The swatch carries series identity; text wears text tokens, never
  the series color.
- ≥2 series → render a `ChartLegend` (entries of `{label, color}`, colors from
  the palette), placed directly below the plot inside the `ChartContainer`;
  a single series needs none (the title names it).

## Well-lit path dashboard anatomy

A "well-lit path" dashboard is not just a registered view — it has a canonical
look shared by Intelligent routing, Prefix cache offloading, and Agentic
serving. A new path must ship ALL of these or it will read as foreign:

**Sanctioned dark-only chrome.** Well-lit path pages are deliberately dark
regardless of app theme: the root shell, hero gradients, and scenario panels
below are exempt from the both-themes rule. Primitives used inside them remain
theme-aware — that is fine under forced dark.

**Glass surfaces.** In dark mode, content panels on these pages are
translucent with `backdrop-blur` (charts `slate-900/50`, stat tiles
`slate-800/60`) so the dotted grid and glow blobs bleed through — never
opaque near-black. `ChartContainer` and `StatCard` carry this treatment
built-in; bespoke panels (hero, scenario) should match it. If a panel looks
flat black, it is off-blueprint.

1. **Hue identity.** Pick an unused hue family (taken: cyan/blue = routing,
   sky/emerald = prefix cache, purple = agentic, violet = P/D disagg). Apply it
   consistently to: the `ITEM_THEMES` nav entry, the PrismHome card (tag
   pills, hover border/glow, Launch CTA gradient), and the hero panel's hover
   accent. Chart series colors still come from `CHART_SERIES` — the hue
   identity is chrome, not data ink.
2. **Header**: use the `WellLitHeader` primitive — fixed top bar with the
   llm-d logo, Prism wordmark, page title, "Guided path" badge, Contact us
   link, and Share button (`getShareUrl` for dashboards that encode state in
   the share link). Never hand-roll this header.
3. **Page root + animated background** — copy this shell verbatim (the
   `pt-16` clears the fixed header; the dotted-grid `#334155` literal is a
   named ratchet exemption):
   ```jsx
   <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center pt-16 md:pl-24 w-full font-sans relative overflow-hidden bg-[radial-gradient(#334155_1.2px,transparent_1.2px)] bg-[size:24px_24px] bg-repeat">
       <div className="absolute top-0 -left-1/4 w-1/2 h-1/2 bg-blue-600/25 rounded-full blur-3xl pointer-events-none animate-pulse" />
       <div className="absolute bottom-0 -right-1/4 w-1/2 h-1/2 bg-emerald-600/25 rounded-full blur-3xl pointer-events-none animate-pulse" style={{ animationDelay: '2s' }} />
   ```
4. **Section order** (top to bottom), each headed by a `SectionLabel`:
   - **Hero panel** — gradient shell with a hover glow blob:
     `relative overflow-hidden border border-slate-800/80 rounded-2xl
     bg-gradient-to-br from-slate-900/90 via-slate-900/50 to-slate-950/90 p-5
     shadow-2xl backdrop-blur-xl group hover:border-<hue>-500/30`, containing a
     3-column grid: `Overview` (tone cyan — what this path is and why it
     matters), a `Selectable …` column (tone cyan — INTERACTIVE toggles that
     filter the charts below: optimizations, tiers, or swept configs; active =
     `border-<hue>-500/30 bg-slate-900/60`, inactive = `opacity-60`; prefer
     this over static config facts, and never duplicate what the Benchmark
     scenario card already shows), and a third column (tone slate) of
     roadmap "Coming soon" chips — data caveats belong in the design spec,
     not as UI bullet lists.
   - **Scenario/outcomes row** — ONE `lg:grid-cols-12` row, cards side by
     side (never stacked full-width sections). Spans: scenario 6 / outcomes 3
     / action 3 when an Action card is present; scenario 8 / outcomes 4 when
     it is not.
     - **Benchmark scenario** (tone sky): gradient card with three internal
       columns (Infra layer / Model serving / Workload), each a stack of tiny
       label + `font-mono font-bold text-white` value pairs.
     - **Primary outcomes** (tone emerald, in a `Panel`): 2-3 SUCCINCT boxes
       (`bg-slate-800/40 border-slate-700/50 rounded-lg p-2.5`) — one number
       per outcome, no multi-row KPI cards. Overflow discipline: the left
       label block gets `min-w-0 pr-2` (so `truncate` works in flex), the
       value gets `shrink-0`, and unit sub-lines stay terse ("(total tok/s)",
       "(mean, s)").
     - **Action** (tone cyan, in a `Panel`, optional): title, one-line blurb,
       and a full-width hue-colored CTA link (guide/reproduction). Include it
       when there is a real guide to link; otherwise omit and rebalance.
   - **Charts** — `ChartContainer`s per the chart rules above.
   - **Results table** — every well-lit dashboard ends with the full per-run
     matrix in a `ChartContainer`: charts summarize, the table is the record.
     Table style: `w-full text-left border-collapse text-xs`; header row
     `bg-slate-950 text-slate-400 font-mono uppercase tracking-wider
     text-[10px]`; body `divide-y divide-slate-800/60 font-mono`; winning
     row/cells highlighted `bg-emerald-900/20` + `text-emerald-300` with a
     success Badge. Units stated in the subtitle.
5. **PrismHome card** — every well-lit path gets a card in the "Well-lit
   paths" rail of `src/components/PrismHome.jsx`, in nav order. The rail is
   `max-w-6xl`; cards are `w-[246px]` so the row fits with minimal horizontal
   scroll. Copy an existing card's shell (`bg-slate-900/95`, hover lift + hue
   glow) and
   fill in: title, 2 hue-tinted tag pills, 1-2 sentence description, a metrics
   preview box (`bg-slate-950/60` with two label/value rows + a small
   hue-tinted visualization), and the gradient `Launch` CTA. These cards are
   sanctioned bespoke chrome — hue classes are expected here.

## Recipe: new dashboard from benchmark results

This is the path for a new well-lit-path dashboard (e.g. **P/D disaggregation**,
wide EP). Input: benchmark results (GCS bucket, `/api/...` endpoint, or a JSON
drop). Output: a registered, on-blueprint dashboard.

1. **Spec first (OPSX).** Create `specs/changes/<name>/proposal.md`: what the
   dashboard shows, which metrics, which comparisons. See `specs/README.md`.
2. **Data in.** Prefer a small server endpoint that returns parsed run objects
   (see `server/server.js`'s `/api/prefix-cache/data` for the pattern):
   `{ model, workloadSize, tech, setup, throughput, ttft: {p50,p90,p99}, ... }`.
3. **Scaffold the component** at `src/components/<Name>Dashboard.jsx`:

   ```jsx
   import { useEffect, useMemo, useState } from 'react';
   import { BarChart, Bar, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
   import {
       PageHeader, ShareLinkButton, Button, StatCard, ChartContainer,
       ChartXAxis, ChartYAxis, ChartTooltip, ChartTooltipRow,
       ToggleGroup, LoadingState, EmptyState, gridProps, seriesColor,
   } from './ui';

   export default function PdDisaggregationDashboard({ onNavigateBack, onToggleMobileNav }) {
       const [runs, setRuns] = useState(null);
       useEffect(() => {
           fetch('/api/pd-disaggregation/data').then(r => r.json()).then(setRuns).catch(() => setRuns([]));
       }, []);
       if (runs === null) return <LoadingState label="Loading benchmark data…" />;

       return (
           <div className="w-full flex flex-col items-center">
               <PageHeader
                   title="Prefill/Decode Disaggregation"
                   subtitle="Throughput & latency vs. aggregated serving"
                   onNavigateBack={onNavigateBack}
                   onToggleMobileNav={onToggleMobileNav}
                   actions={<ShareLinkButton />}
               />
               <main className="w-full max-w-7xl px-6 py-8 flex flex-col gap-6">
                   {/* KPI row: 3-4 StatCards */}
                   {/* ChartContainer per question; ToggleGroup for metric switches */}
               </main>
           </div>
       );
   }
   ```

4. **Register the view** in `src/App.jsx`: import the component and add a
   `{currentView === 'pd-disaggregation' && <PdDisaggregationDashboard … />}`
   entry, passing `onNavigateBack={() => handleNavigate('home')}` and
   `onToggleMobileNav`.
5. **Enable navigation** in `src/components/LeftNavigation.jsx`: flip the
   item's `disabled: true` (or add it to `MENU_GROUPS`) and add an
   `ITEM_THEMES` entry in the path's hue.
6. **Make it a well-lit path**: apply everything in "Well-lit path dashboard
   anatomy" above — hue identity, animated background, hero panel,
   Benchmark scenario / Primary outcomes sections, and the PrismHome card.
7. **Self-check** against the checklist below, then `npm run lint` and
   `npm run build`.

## Review checklist (ratchet)

Run on every UI PR — these greps must return nothing for changed files outside
`src/components/ui/`:

```bash
git diff main --name-only -- 'src/components/*.jsx' 'src/components/**/*.jsx' | grep -v '^src/components/ui/' | \
  xargs grep -nE '#[0-9a-fA-F]{6}|fixed inset-0|animate-spin' -- 2>/dev/null
```

- [ ] No new hex literals or inline `animate-spin` outside `src/components/ui/`.
- [ ] No new `fixed inset-0` DIALOGS outside `src/components/ui/` — dialogs use
      `Modal`. (Legitimate non-dialog uses exist: invisible popover click-away
      layers and slide-over drawer backdrops. A hit must be one of those, with
      the pattern named in the PR description.)
- [ ] No template-literal class conditionals where `cn()` fits.
- [ ] New repeated markup extracted into `src/components/ui/`.
- [ ] Charts: fixed-order palette, one axis, `ChartContainer` shell, tooltip on
      the shared shell, legend present for ≥2 series.
- [ ] Renders correctly in both themes (toggle `.dark` on `<html>` to check).
