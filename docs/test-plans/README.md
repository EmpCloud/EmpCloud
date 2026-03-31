# EMP Cloud — Master Test Plan Index

**Generated**: 2026-04-01
**Total Test Cases**: ~1,581 across 12 modules
**Coverage Target**: Every API endpoint in the entire EMP ecosystem

## Test Plan Documents

| # | Document | Modules | Test Cases |
|---|----------|---------|-----------|
| 1 | [01-empcloud-core-test-plan.md](01-empcloud-core-test-plan.md) | EmpCloud (35 route files) | ~250 |
| 2 | [02-payroll-test-plan.md](02-payroll-test-plan.md) | EMP Payroll (26 route files) | ~280 |
| 3 | [03-performance-recruit-test-plan.md](03-performance-recruit-test-plan.md) | EMP Performance + EMP Recruit | ~350 |
| 4 | [04-exit-rewards-lms-test-plan.md](04-exit-rewards-lms-test-plan.md) | EMP Exit + EMP Rewards + EMP LMS | ~392 |
| 5 | [05-field-billing-monitor-test-plan.md](05-field-billing-monitor-test-plan.md) | EMP Field + EMP Billing + EMP Monitor | ~309 |
| | **Total** | **12 modules** | **~1,581** |

## Existing Coverage (737 tests passing)

| Suite | Tests |
|-------|-------|
| Security (SQLi, XSS, CSRF, RBAC, tenant isolation) | 143 |
| Auth & SSO (login, tokens, SSO to 9 modules) | 35 |
| HRMS Core (employees, attendance, leave, documents, policies) | 137 |
| Features (helpdesk, surveys, forum, events, wellness, chatbot) | 132 |
| Billing & Payments (Stripe, Razorpay, PayPal, subscriptions) | 70 |
| Admin (super admin, revenue, modules, orgs) | 48 |
| Regression (33 bug fixes verified) | 33 |
| Performance (response times, concurrent, health checks) | 22 |
| Mobile (iPhone + iPad viewports) | 13 |
| Workflows (end-to-end lifecycles) | 35 |
| Other (screenshots, field, org chart) | 69 |
| **Current Total** | **737 passing** |

## Gap Analysis

| Module | Total Endpoints | Currently Tested | Test Plan Coverage |
|--------|----------------|-----------------|-------------------|
| EmpCloud Core | ~300 | ~120 (40%) | +250 → 100% |
| EMP Payroll | ~250 | 3 (1%) | +280 → 100% |
| EMP Performance | ~170 | 0 (0%) | +170 → 100% |
| EMP Recruit | ~180 | 0 (0%) | +180 → 100% |
| EMP Exit | ~126 | 0 (0%) | +126 → 100% |
| EMP Rewards | ~105 | 0 (0%) | +105 → 100% |
| EMP LMS | ~161 | 5 (3%) | +161 → 100% |
| EMP Field | ~128 | 2 (2%) | +128 → 100% |
| EMP Billing | ~181 | 30 (17%) | +181 → 100% |
| EMP Monitor | ~128 | 0 (0%) | +128 → 100% |

## Implementation Priority

1. **Phase 1 (Week 1-2)**: EmpCloud Core gaps — employee profiles, attendance, leave, documents, helpdesk, admin
2. **Phase 2 (Week 3-4)**: Payroll + Billing — payroll runs, salary, tax, quotes, credit notes, dunning
3. **Phase 3 (Week 5-6)**: Performance + Recruit — review cycles, goals, jobs, applications, offers
4. **Phase 4 (Week 7-8)**: Exit + Rewards + LMS — exit workflow, kudos, courses, certifications
5. **Phase 5 (Week 9-10)**: Field + Monitor — check-in/out, screenshots, productivity reports
