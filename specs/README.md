# 📋 Specifications & Change Protocol (OPSX)

This directory governs the evolution of the codebase. We follow a simplified version of the [OpenSpec OPSX protocol](https://github.com/Fission-AI/OpenSpec/blob/main/docs/opsx.md) to ensure that both **Humans** and **AI Agents** can collaborate, propose ideas, and implement features with high context and low friction.

## 🏗 Directory Structure

*   `main/`: The "Living Source of Truth." Contains the current architecture and functional specs of the production system.
*   `changes/`: Active work-in-progress. Every feature, bug fix, or experiment gets its own subdirectory here.
*   `archive/`: Completed or abandoned proposals. This serves as the "organizational memory" to prevent re-litigating past decisions.

---

## 🔄 The Change Lifecycle

All changes—whether drafted by a human or an agent—must follow this progression:

### 1. Discovery & Exploration (`explore.md`)
Before a formal proposal, use an `explore.md` file in a new `changes/` subdirectory to brainstorm. 
*   **Goal:** Research TPU performance, benchmark vLLM configurations, or draft UI mockups.
*   **Agent Role:** Agents should use this file to document technical constraints or library research.

### 2. The Proposal (`proposal.md`)
Once an idea is ready for review, create a `proposal.md`.
*   **Must include:** Context/Intent, Proposed Solution, and Success Criteria.
*   **Collaboration:** Open a GitHub Pull Request (PR) for the specific change directory. This allows for threaded discussions on the *intent* before implementation begins.

### 3. Specification & Design (`specs.md` & `design.md`)
Define *what* it does and *how* it works.
*   **Specs:** Functional requirements (e.g., "The system must parse vLLM logs with >99% accuracy").
*   **Design:** Technical implementation details, schema changes, and API contracts.

### 4. Implementation & Archiving
Once the code is merged:
1.  **Update Main:** Any permanent changes to the system architecture must be reflected in `specs/main/`.
2.  **Move to Archive:** The specific change directory is moved to `specs/archive/`. 
    *   *Note:* If a proposal is rejected, move it to archive with a `# Status: Rejected` header explaining why.

---

## 🤖 Instructions for AI Agents

When tasked with a new feature or research item, you **must** adhere to the following:

1.  **Check the Archive:** Search `specs/archive/` to ensure this hasn't been attempted or rejected previously.
2.  **Initialize a Change:** Create `/specs/changes/[short-feature-name]/`.
3.  **Draft the Artifacts:** Start with `proposal.md`. Do not begin writing application code until the proposal is reviewed by a human.
4.  **Stay Context-Aware:** Always reference `specs/main/` to understand the current state of the infrastructure (e.g., existing MLOps pipelines or React patterns).

---

## 🛠 Tooling & References

*   **Protocol:** [OpenSpec / OPSX](https://github.com/Fission-AI/OpenSpec)
*   **Project Context:** See `openspec/config.yaml` for hardware-specific rules (TPU/GPU) and performance benchmarking standards.

---

> **Note to Humans:** When reviewing PRs, prioritize the validity of the `proposal.md`. If the "Why" is wrong, the "How" doesn't matter.