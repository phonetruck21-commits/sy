---
name: sy-security-audit-autofix
description: Security audit, secret detection, remediation and key rotation across S.Y projects.
version: 1.0.0
---
# S.Y Security Audit & Auto-Fix

## Scope
Apply to each authorized S.Y codebase separately, including S.Y CRM Admin, S.Y AI OFFICE, Phone Truck website, Technician USB Toolkit, Nagla, Hostel B2B, SOS Rescue and other owned projects. Do not assume access to a repository or deployed service. In demo-only projects, audit demo code only; do not connect production services.

## Mandatory workflow
1. Inventory repository, runtime, frontend/backend boundaries, CI/CD, deployment, dependency files and build artifacts. Record repository and commit identifiers.
2. Create a reversible checkpoint named `PRE_SECURITY_FIX` (commit/branch or backed-up snapshot); do not overwrite existing checkpoints.
3. Search tracked files, ignored files accessible with authorization, compiled frontend assets, source maps, logs, config and available Git history for credentials. Use secret scanners where installed and contextual review. Never echo full secret values.
4. Classify findings by file:line, type, severity, exposure route and impact. Distinguish intentionally public keys (e.g. browser publishable/anon keys) from server secrets; validate scope, restrictions, RLS and auth.
5. Remediate by moving privileged calls and secrets to server-only code and server environment/secret manager. Add server-side authorization, least privilege, safe logging, appropriate CORS/cookies, `.gitignore` and CI secret scanning. Never expose privileged Supabase service-role keys; verify RLS policies.
6. Treat any secret previously exposed as compromised. Identify affected providers, rotate/revoke with safe sequencing, update all consumers, and validate. If credentials or production access are unavailable, provide exact manual rotation steps; never claim rotation completed.
7. Run type checks, builds, tests, auth/authorization tests, frontend bundle scans, and repeat the secret scan. Do not declare clean unless evidence supports it. Document untested areas.
8. Deliver a concise Hebrew report with project, commit, findings (redacted), file:line, risk, changes, test results, exposed keys requiring rotation, unresolved items and rollback instructions.

## Safety rules
- Never print, store in reports, or send actual secrets to the assistant conversation.
- Do not change production infrastructure, revoke active keys, deploy, delete data or alter irreversible state without explicit approval.
- Preserve working features, data and prior versions; request approval for high-impact changes.
- Do not report edits or scans in repositories that were not actually accessed.
- Run before release and after security-sensitive changes, and integrate in CI where authorized.
