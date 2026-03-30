# Memory Index

## User
- [user_role.md](user_role.md) — Builds EMP Cloud ecosystem, works with Suresh (Technical Architect) for infra/keys

## Rules & Preferences
- [feedback_rules.md](feedback_rules.md) — All 19 workflow rules: approvals, deploy, testing, SSH, agents, debugging
- [feedback_lessons.md](feedback_lessons.md) — 25 key lessons from deployment, database, auth, testing, integration
- [feedback_devops_capabilities.md](feedback_devops_capabilities.md) — We have full devops (sudo, nginx, MySQL, PM2). Do it ourselves.
- [feedback_no_rate_limits_anywhere.md](feedback_no_rate_limits_anywhere.md) — No rate limits anywhere in dev/test mode

## Architecture & Infrastructure
- [reference_infrastructure.md](reference_infrastructure.md) — Test server, all 19+ PM2 services with ports, public URLs, deploy procedure
- [project_architecture.md](project_architecture.md) — Full 12-module HRMS ecosystem overview
- [project_sso_architecture.md](project_sso_architecture.md) — SSO flow: Cloud passes accessToken, modules exchange for local HS256

## Features & Integration
- [project_billing_integration_fixed.md](project_billing_integration_fixed.md) — Billing fully wired: API key, webhook endpoint, 3 gateways
- [project_back_to_dashboard.md](project_back_to_dashboard.md) — Back button in all 10 module headers
- [project_lms_deployment.md](project_lms_deployment.md) — LMS deployed, SSO integrated

## GitHub & Admin
- [reference_github_admin.md](reference_github_admin.md) — GraphQL deleteIssue, token permissions, bulk delete

## Key Decisions (2026-03-30/31)
- **5 roles only**: employee(0) → manager(20) → hr_admin(60) → org_admin(80) → super_admin(100). No hr_manager.
- **org_id=0 reserved for super_admin** — EmpCloud Platform org. Table rebuilt with NO_AUTO_VALUE_ON_ZERO. Auto-increment starts at 40.
- **Super admin hidden from org user lists** — user.service.ts filters out role=super_admin
- **API errors logged to console, not toast** — background errors don't disrupt UI. Check DevTools console.
- **Log Dashboard** already built at /admin/logs — reads PM2 logs + audit_logs for all 12 modules
- **12 company policy templates** seeded via migration 035 — Indian corporate policies (POSH, DPDP, etc.)
- **Org chart** redesigned — pannable, zoomable, contained viewport with +/- controls
- **EMP Field module** built from scratch — TypeScript/MySQL/Knex, port 4800, nginx configured, 16/16 Playwright tests pass
- **Database sanitized** — 10/10 data sanity pass, clean attendance (115 records, 0 mismatches), 47 TechNova employees with proper hierarchy
- **RBAC fixes** — leave approve/reject requires manager middleware, shift swap allows managers, leave balance enforces self-or-HR
