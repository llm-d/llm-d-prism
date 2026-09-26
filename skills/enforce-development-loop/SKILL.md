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
1. Ask the user for the feature name (which should correspond to a spec markdown file `specs/changes/[feature-name].md`).
2. If not specified, look for active spec files in `specs/changes/` that might be relevant.

### Step 2: Validate Product Phase
1. Check if the spec file exists (`specs/changes/[feature-name].md`) and includes the Product Specification / Proposal section (Context, Problem Statement, Proposed Solution, Success Criteria).
2. If it does not exist, pause and instruct the user to draft the Product Spec section in `specs/changes/[feature-name].md` first.
3. Check the roadmap ([specs/main/roadmap.md](../../specs/main/roadmap.md)) to verify if the spec is referenced.
4. If not referenced, alert the user that the feature is not currently tracked in the roadmap and must be added.

### Step 3: Validate UI/UX Phase
1. Check if `specs/changes/[feature-name].md` includes a UI/UX Specification section.
2. Verify that the UI/UX specification outlines every new/modified UI element and its functionality, adhering to [`skills/style.md`](../style.md).
3. Check if there are active UI/UX mocks or prototypes.
4. Verify that UI/UX mockup/prototype code is pushed to the `next` branch (or a dedicated feature branch), not `main`.
   - Run `git branch --contains` or check the current branch name.
   - If changes are on `main`, alert the user that UI/UX work must be isolated on `next` or a feature branch.

### Step 4: Validate Engineering Phase
1. Check if `specs/changes/[feature-name].md` includes an Engineering Design Specification section.
2. Verify that the engineering design section outlines:
   - Required changes to the Prism backend.
   - Required changes to the results store / database schema.
   - Frontend component and state design.
3. If the UI changes require backend/schema updates and the engineering design section is missing, pause and instruct the user/agent to draft the Engineering Design section first.

### Step 5: Final Compliance Check
Provide a summary table of the development loop compliance:

| Phase | Artifact / Check | Status | Action Required |
|---|---|---|---|
| **Product** | Product section in `specs/changes/[feature-name].md` | [Pass/Fail/Missing] | |
| **Product** | Referenced in Roadmap | [Pass/Fail/Missing] | |
| **UI/UX** | UI/UX section in `specs/changes/[feature-name].md` | [Pass/Fail/Missing] | |
| **UI/UX** | Code isolated (not on `main`) | [Pass/Fail] | |
| **Engineering**| Engineering design section (if needed) | [Pass/Fail/Not Needed] | |

If any critical checks fail, do not proceed with merging implementation code to `main`.
