---
name: enforce-development-loop
description: Enforce the Product -> UI/UX -> Engineering development loop for new features. Run when starting a feature, reviewing progress, or before merging to main.
---

# Enforce Development Loop

## Purpose

Enforce the Product -> UI/UX -> Engineering development loop to ensure all user-facing features have product specs, UI/UX mocks with implementation specs, and engineering design specs before core implementation begins. This prevents engineering mismatches and ensures data layer compatibility.

## Usage

Use this skill when:
- Starting a new feature.
- Reviewing a feature's progress.
- Validating a PR before merging.

## Workflow

### Step 1: Identify the Feature Name and Scope
1. Ask the user for the feature name (which should correspond to a directory under `specs/changes/[feature-name]/`).
2. If not specified, look for active directories in `specs/changes/` that might be relevant.

### Step 2: Validate Product Phase
1. Check if the product spec exists: `specs/changes/[feature-name]/product_spec.md` (or `prd.md`, or `proposal.md` with product details).
2. If it does not exist, pause and instruct the user to draft the Product Spec first.
3. Check the roadmap ([specs/main/roadmap.md](../../specs/main/roadmap.md)) to verify if the product spec is referenced.
4. If not referenced, alert the user that the feature is not currently tracked in the roadmap and must be added.

### Step 3: Validate UI/UX Phase
1. Check if the UI/UX implementation spec exists: `specs/changes/[feature-name]/ui_spec.md` (or `specs.md` with UI details).
2. Verify that the UI/UX implementation spec outlines every new/modified UI element and its functionality.
3. Check if there are active UI/UX mocks or prototypes.
4. Verify that UI/UX mockup/prototype code is pushed to the `next` branch (or a dedicated feature branch), not `main`.
   - Run `git branch --contains` or check the current branch name.
   - If changes are on `main`, alert the user that UI/UX work must be isolated on `next` or a feature branch.

### Step 4: Validate Engineering Phase
1. Check if the engineering design spec exists: `specs/changes/[feature-name]/design.md`.
2. Verify that the design spec outlines:
   - Required changes to the Prism backend.
   - Required changes to the results store / database schema.
3. If the UI changes require backend/schema updates and the design spec is missing, pause and instruct the user/agent to draft the Engineering Design Spec first.

### Step 5: Final Compliance Check
Provide a summary table of the development loop compliance:

| Phase | Artifact / Check | Status | Action Required |
|---|---|---|---|
| **Product** | `product_spec.md` / `proposal.md` | [Pass/Fail/Missing] | |
| **Product** | Referenced in Roadmap | [Pass/Fail/Missing] | |
| **UI/UX** | `ui_spec.md` / `specs.md` | [Pass/Fail/Missing] | |
| **UI/UX** | Code isolated (not on `main`) | [Pass/Fail] | |
| **Engineering**| `design.md` (if needed) | [Pass/Fail/Not Needed] | |

If any critical checks fail, do not proceed with merging implementation code to `main`.
