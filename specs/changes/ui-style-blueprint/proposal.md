# Proposal: UI/Style Blueprint — shared primitives + a `style` skill

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
- Backend/server code and the Results Store API (covered by `specs/main/results-api/`).

## Next Artifacts

Per the OPSX lifecycle: after review of this proposal, `specs.md` (functional requirements
for each primitive + the skill's rule set) and `design.md` (component APIs, token map,
migration order) follow in this directory.
