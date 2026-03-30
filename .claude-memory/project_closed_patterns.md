---
name: Closed issues pattern analysis (2026-03-29)
description: 200 closed issues analyzed. Top root causes: RBAC 19%, missing routes 18%, auth/SSO 13%. 31% reopen rate.
type: project
---

## Top Root Causes (66% of all issues from top 4)
1. **RBAC/Permission misconfiguration** — 38 issues (19%). Performance module worst (13 RBAC bugs alone)
2. **Missing/incorrect API routes** — 36 issues (18%). Route not registered or aliased wrong
3. **E2E test environment issues** — 32 issues (16%). Flaky tests, timing, wrong URLs
4. **Auth/SSO token issues** — 26 issues (13%). LMS had 13 auth bugs

## Fix Patterns (what we do most)
- Route registration/alias: 33% of fixes
- RBAC policy/middleware update: 28%
- Modal/Form behavior: 23%
- Auth/SSO flow fix: 17.5%
- i18n key additions: 8%

## Module Bug Ranking
1. EmpCloud Core: 69 issues (34.5%) — i18n, RBAC, E2E
2. LMS: 29 (14.5%) — auth/SSO dominant
3. Performance: 24 (12%) — RBAC dominant (13 of 24!)
4. Recruit: 19 (9.5%) — missing routes dominant

## Critical Stats
- **31% reopen rate** — fixes are incomplete or regress
- **34% closed without verification** — premature closing
- **74.5% no severity label** — triage discipline needed
- **Average close time: 8.4 hours** — fast but often premature

## Recommendations for Agents
- When fixing Performance: always check ALL admin pages for RBAC, not just the reported one
- When fixing LMS: auth/SSO is the root cause 45% of the time
- When fixing routes: check BOTH server route registration AND client fetch URL match
- Always verify fix with curl before closing (31% reopen rate proves this is critical)
