# Skill: Fixing GitHub Issues

## Goal
Resolve a GitHub issue by creating a dedicated branch from the upstream repository, implementing the fix, verifying it, and committing the changes with a reference to the issue.

## Context
This workflow ensures that fixes are developed on isolated branches based on the latest upstream main branch, reducing merge conflicts and keeping the history clean.

## Instructions

1.  **Fetch the latest changes** from the upstream repository (usually named `prism`):
    ```bash
    git fetch prism
    ```
2.  **Create and checkout a new branch** based on the upstream `main` branch:
    ```bash
    git checkout -b fix-issue-<number> prism/main
    ```
    *Replace `<number>` with the GitHub issue number.*

3.  **Read the GitHub issue** to understand the problem and requirements. Use available tools (like `read_url_content` or `browser_subagent`) to fetch the issue description if needed.

4.  **Implement the fix** in the codebase.

5.  **Verify the fix**:
    *   If applicable, use the browser subagent to verify UI behavior or manual tests.
    *   Run automated tests if available.

6.  **Stage the modified files**:
    ```bash
    git add <path/to/file>
    ```
7.  **Commit the changes** referencing the issue number:
    ```bash
    git commit -m "Description of fix (#<number>)"
    ```
    *Replace `<number>` with the GitHub issue number.*

## Verification
1.  Verify that the branch is created and active: `git branch`
2.  Verify that the commit message contains the issue reference (e.g., `#32`).
3.  Verify that the changes are effective in the running application or tests.
