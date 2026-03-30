# Memory Index

## User
- [user_role.md](user_role.md) — Builds EMP Cloud ecosystem, works with Suresh (Technical Architect) for infra/keys

## Rules & Preferences
- [feedback_rules.md](feedback_rules.md) — All 19 workflow rules: approvals, deploy procedure, testing, SSH, agents, debugging
- [feedback_lessons.md](feedback_lessons.md) — 25 key lessons from deployment, database, auth, testing, and integration

## Architecture & Infrastructure
- [reference_infrastructure.md](reference_infrastructure.md) — Test server, all 19 PM2 services with ports, public URLs, deploy procedure, GitHub Actions
- [project_architecture.md](project_architecture.md) — Full 12-module HRMS ecosystem overview, features, status
- [project_sso_architecture.md](project_sso_architecture.md) — SSO flow: Cloud passes accessToken as ?sso_token, modules decode+exchange for local HS256

## Features & Integration
- [project_billing_integration_fixed.md](project_billing_integration_fixed.md) — Billing fully wired: API key, webhook endpoint, 3 gateways working
- [project_back_to_dashboard.md](project_back_to_dashboard.md) — "← EMP Cloud" back button in all 10 module headers
- [project_lms_deployment.md](project_lms_deployment.md) — LMS deployed to testlms.empcloud.com, SSO integrated

## GitHub & Admin
- [reference_github_admin.md](reference_github_admin.md) — GraphQL deleteIssue mutation, token permissions, bulk delete pattern
