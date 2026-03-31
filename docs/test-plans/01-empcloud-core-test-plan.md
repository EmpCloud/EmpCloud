# EmpCloud Core — Comprehensive E2E Test Plan

**Generated**: 2026-04-01
**API Base URL**: `https://test-empcloud-api.empcloud.com/api/v1`
**Total Test Cases**: ~250 across 20 test files
**Coverage Target**: All 300+ endpoints in 35 route files

## Test Files Index

| # | File | Area | Tests |
|---|------|------|-------|
| 1 | e2e-employee-details.spec.ts | Profile, addresses, education, experience, dependents, salary, photo, probation | 25 |
| 2 | e2e-attendance-advanced.spec.ts | Shifts CRUD, assign, swap, geo-fences, regularizations, monthly report | 21 |
| 3 | e2e-leave-advanced.spec.ts | Types, policies, balances, applications lifecycle, comp-off, calendar | 27 |
| 4 | e2e-documents-advanced.spec.ts | Upload, download, verify, reject, expiry tracking, mandatory | 11 |
| 5 | e2e-helpdesk-advanced.spec.ts | Assignment, reopen, rating, KB CRUD, helpfulness | 13 |
| 6 | e2e-asset-management.spec.ts | CRUD, categories, assign/return/retire, report lost, dashboard | 17 |
| 7 | e2e-position-headcount.spec.ts | Headcount plans, assignment deletion | 5 |
| 8 | e2e-user-management.spec.ts | CRUD, invite, org chart, privilege escalation | 12 |
| 9 | e2e-onboarding.spec.ts | Wizard steps, complete, skip | 4 |
| 10 | e2e-whistleblowing.spec.ts | Submit, track, assign, update, escalate, dashboard | 13 |
| 11 | e2e-biometrics.spec.ts | Face enrollment, QR codes, check-in/out, devices, settings, logs | 18 |
| 12 | e2e-custom-fields.spec.ts | Definitions CRUD, values, search, reorder | 11 |
| 13 | e2e-wellness-advanced.spec.ts | Program complete, update, detail | 3 |
| 14 | e2e-survey-advanced.spec.ts | My responses, results export | 3 |
| 15 | e2e-forum-advanced.spec.ts | Category update, reply delete/accept, post update | 4 |
| 16 | e2e-admin-advanced.spec.ts | User mgmt, module toggle, data sanity fix, notifications | 13 |
| 17 | e2e-billing-webhooks.spec.ts | Billing webhook, module webhook, invoice PDF | 5 |
| 18 | e2e-oauth.spec.ts | OIDC discovery, JWKS, token, revoke, introspect, userinfo | 7 |
| 19 | e2e-logs-aiconfig.spec.ts | Log dashboard, AI config, provider test | 12 |
| 20 | e2e-dashboard-auth-org.spec.ts | Dashboard widgets, auth flows, org management, audit | 16 |

## Credentials

- **Admin** (HR/Org Admin): ananya@technova.in / Welcome@123
- **Employee**: arjun@technova.in / Welcome@123
- **Super Admin**: admin@empcloud.com / SuperAdmin@123
