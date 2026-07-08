# GitHub OAuth & Permissions Configuration

This document outlines the required configuration and permissions for setting up
GitHub authentication (OAuth) for Prism, specifically for validating
organization membership and role-based permissions (admin vs. standard user)
under the `llm-d` organization.

---

## 1. Using a GitHub App

GitHub Apps are the modern way to handle integrations. They offer fine-grained
permissions and better security controls.

### 1.1 General Settings

When creating your GitHub App on GitHub:

1. **Homepage URL**: Set to `https://prism.llm-d.ai/`.
2. **Callback URL** (under **Identifying and authorizing users**):
    - Production: `https://prism.llm-d.ai/api/auth/github/callback`
    - Local Development: `http://localhost:4321/api/auth/github/callback` (or
      `http://localhost:8081/api/auth/github/callback` depending on local port
      configuration).
3. **User Authorization Tokens**:
    - Check only **"Expire user authorization tokens"**.
4. **Webhook**:
    - Webhook capability is optional for Prism authentication, so uncheck
      **"Active"**.
5. **Permissions**:
    - Under **Organization permissions**:
        - Locate the **Members** permission.
        - Set it to **Read-only**.
        - _Why?_ This grants the app access to read organization memberships,
          team list memberships, and user roles (specifically, whether they are
          an administrator or a member of the organization).
    - Under **User permissions**:
        - Basic profile information (read-only) is granted by default. No
          additional permissions are required.
6. Under **Where can this GitHub App be installed?**:
    - Select **Any account**.

For details on how the backend uses this authentication to verify user roles,
permissions, and GCS allowlists, see the [Prism IAM documentation](iam.md).
