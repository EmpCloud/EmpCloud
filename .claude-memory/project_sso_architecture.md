---
name: SSO architecture and known issues
description: How SSO works across modules, past bugs (sanitizeModule stripping base_url, LMS stale build), module base_urls in DB
type: project
---

SSO flow: Cloud client passes its RS256 access token as `?sso_token=` query param to module's `base_url`. Module client extracts it, POSTs to module backend `/auth/sso`, which decodes (NOT verifies) the JWT, validates user in empcloud DB, issues local HS256 tokens.

**Verified 2026-03-29 via public HTTPS URLs — ALL 6 modules pass SSO:**
- Payroll (testpayroll-api.empcloud.com) — SUCCESS, auto-creates local profile
- Recruit (test-recruit-api.empcloud.com) — SUCCESS
- Performance (test-performance-api.empcloud.com) — SUCCESS
- Rewards (test-rewards-api.empcloud.com) — SUCCESS
- Exit (test-exit-api.empcloud.com) — SUCCESS
- LMS (testlms-api.empcloud.com) — SUCCESS
- Projects (test-project-api.empcloud.com) — SUCCESS (NOTE: uses `/v1/auth/sso` not `/api/v1/auth/sso`)
- Monitor (test-empmonitor-api.empcloud.com) — SUCCESS (NOTE: uses `/api/v3/auth/sso` — v3 not v1)

**Key facts:**
- Cloud does NOT call `/api/v1/auth/sso/token` — it passes the existing access token directly
- Modules decode without RS256 verification (trusted redirect)
- 5 modules (Rewards, Recruit, Performance, Exit, LMS) do best-effort JTI revocation check
- Payroll auto-creates profile on first SSO login; others return null moduleProfileId
- `sanitizeModule` was stripping `base_url` for non-admin users — FIXED 2026-03-29
- LMS had SSO source code but stale client build — rebuilt 2026-03-29
- Module base_urls in DB must match nginx configs (test-recruit vs testrecruit naming)
- Biometrics has empty base_url (expected — embedded in Attendance, no standalone frontend)
- All 10 modules return base_url in /api/v1/modules response (sanitizeModule only strips webhook_secret now)

**How to apply:** When SSO breaks, check: (1) base_url in modules table, (2) module client build has sso_token extraction, (3) module backend POST /auth/sso works, (4) CORS allows Cloud origin.
