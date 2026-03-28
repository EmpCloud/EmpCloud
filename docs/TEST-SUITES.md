# EMP Cloud — Complete Test Suite Documentation

## Overview

| Category | Tests | Status |
|----------|-------|--------|
| Unit Tests (mocked) | 602 | All modules |
| API Integration Tests | 833 | All 8 modules |
| E2E Functional Tests | 44 | Playwright |
| E2E Workflow Tests | 20 | Playwright |
| Deep Lifecycle Tests | 15 | Playwright |
| Security Tests | 109 | Playwright |
| NexGen Verification | 47 | Playwright |
| **TOTAL** | **1,670+** | |

---

## 1. Unit Tests (602 tests)

Mocked DB tests using Vitest. Co-located with source files.

| Module | Tests | File |
|--------|-------|------|
| empcloud — Auth | 24 | services/auth/auth.service.test.ts |
| empcloud — Leave | 20 | services/leave/leave.service.test.ts |
| empcloud — Attendance | 17 | services/attendance/attendance.service.test.ts |
| empcloud — Employee | 13 | services/employee/employee-profile.service.test.ts |
| empcloud — Helpdesk | 28 | services/helpdesk/helpdesk.service.test.ts |
| empcloud — Survey | 29 | services/survey/survey.service.test.ts |
| empcloud — Asset | 23 | services/asset/asset.service.test.ts |
| empcloud — Position | 20 | services/position/position.service.test.ts |
| empcloud — Org | 24 | services/org/org.service.test.ts |
| empcloud — Chatbot Tools | 21 | services/chatbot/tools.test.ts |
| emp-performance — Review Cycle | 10 | services/review/review-cycle.service.test.ts |
| emp-performance — Goal | 10 | services/goal/goal.service.test.ts |
| emp-performance — Feedback | 10 | services/feedback/feedback.service.test.ts |
| emp-rewards — Kudos | 10 | services/kudos/kudos.service.test.ts |
| emp-rewards — Points | 10 | services/points/points.service.test.ts |
| emp-rewards — Badge | 10 | services/badge/badge.service.test.ts |
| emp-rewards — Reward | 10 | services/reward/reward.service.test.ts |
| emp-exit — Exit Request | 10 | services/exit/exit-request.service.test.ts |
| emp-exit — FnF | 10 | services/fnf/fnf.service.test.ts |
| emp-exit — Clearance | 10 | services/clearance/clearance.service.test.ts |
| emp-payroll — Payroll | 14 | services/payroll.service.test.ts |
| emp-payroll — Salary | 12 | services/salary.service.test.ts |
| emp-payroll — India Tax | 17 | services/tax/india-tax.service.test.ts |
| emp-payroll — Loan | 17 | services/loan.service.test.ts |
| emp-billing — Invoice Calculator | 62 | (existing + 5 new) |
| emp-lms — Course | 41 | services/course.service.test.ts |
| emp-lms — Enrollment | 38 | services/enrollment.service.test.ts |
| emp-lms — Quiz | 42 | services/quiz.service.test.ts |
| emp-lms — SCORM | 15 | services/scorm.service.test.ts |

---

## 2. DB Integration Tests (244 tests — empcloud)

Real MySQL database queries. Run on test server.

| Group | Tests | File |
|-------|-------|------|
| Auth | 11 | __tests__/services/auth.test.ts |
| Leave | 17 | __tests__/services/leave.test.ts |
| Attendance | 17 | __tests__/services/attendance.test.ts |
| Employee | 17 | __tests__/services/employee.test.ts |
| Helpdesk | 19 | __tests__/services/helpdesk.test.ts |
| Survey | 18 | __tests__/services/survey.test.ts |
| Asset | 17 | __tests__/services/asset.test.ts |
| Position | 15 | __tests__/services/position.test.ts |
| Org | 11 | __tests__/services/org.test.ts |
| Security | 45 | __tests__/services/security.test.ts |
| Data Integrity | 33 | __tests__/services/data-integrity.test.ts |

Run: `TEST_DB_HOST=localhost pnpm --filter @empcloud/server test`

---

## 3. API Integration Tests (833 tests)

Real HTTP calls against running servers.

| Module | Tests | File |
|--------|-------|------|
| empcloud | 137 | __tests__/api/full-api.test.ts |
| emp-recruit | 106 | __tests__/api.test.ts |
| emp-performance | 128 | __tests__/api.test.ts |
| emp-rewards | 88 | __tests__/api.test.ts |
| emp-exit | 86 | __tests__/api.test.ts |
| emp-payroll | 89 | __tests__/api.test.ts |
| emp-billing | 89 | __tests__/api.test.ts |
| emp-lms | 110 | __tests__/api.test.ts |

---

## 4. E2E Tests (Playwright)

### Functional Tests (44 tests)
File: `e2e/functional-tests.spec.ts`
- Authentication, Employee Directory, Leave, Attendance, Documents
- Announcements, Policies, Settings, Modules, Billing
- Helpdesk, Surveys, Assets, Positions, Super Admin, SSO, Sidebar

### Workflow Tests (20 tests)
File: `e2e/workflow-tests.spec.ts`
- Employee Onboarding, Leave Apply->Approve, Attendance Check-in/out
- Helpdesk Lifecycle, Document Upload, Announcement Create->Read
- Survey Create->Respond, Asset Assignment, Position->Vacancy
- Events, Wellness, Forum, Feedback, Whistleblowing, Billing, AI Chatbot

### Deep Lifecycle Tests (15 tests)
File: `e2e/deep-workflow-tests.spec.ts`
- Leave Apply->Approve->Balance Decreases
- Leave Apply->Reject with Reason
- Helpdesk Create->Assign->Comment->Resolve->Rate
- Announcement Create->Read->Verify Count
- Survey Create->Publish->Respond->Results
- Full document, asset, position, attendance, feedback, billing lifecycles

### Security Tests (109 tests)
File: `e2e/security-tests.spec.ts`
- SQL Injection (11), XSS Prevention (7), Tenant Isolation (13)
- RBAC/Authorization (12), Token Security (9), Rate Limiting (3)
- Input Validation (12), SSO Security (5), Security Headers (7)
- Path Traversal (3), Auth Flow (6), HTTP Methods (3)
- Data Exposure (5), CSRF (3), Privilege Escalation (4)

### NexGen Verification (47 tests)
File: `e2e/nexgen-verification.spec.ts`
- Logs in as 5 different employees (CEO, HR, VP, Dev, Employee)
- Tests every feature: Dashboard, Attendance, Leave, Directory, Org Chart
- Helpdesk, Announcements, Documents, Surveys, Assets, Events
- Wellness, Forum, Feedback, AI Chatbot, Settings, Billing, Modules
- Super Admin (Health + Data Sanity), Mobile Responsive, Profile Edit

---

## 5. Simulation Scripts

### 1-Day Simulation
File: `scripts/simulate-org.cjs`
- Creates NexGen Technologies (20 employees, 6 departments)
- Simulates full day of HR operations
- 158/159 actions successful (99.4%)

### 7-Day Simulation
File: `scripts/simulate-7days.cjs`
- 7 days of realistic HR operations
- 92 attendance records, 7 leaves, 3 tickets, surveys, events, forum
- Tests weekend vs weekday patterns

---

## How to Run

```bash
# Unit tests (empcloud)
pnpm --filter @empcloud/server test

# DB integration tests (on test server)
TEST_DB_HOST=localhost pnpm --filter @empcloud/server test

# E2E tests
npx playwright test e2e/functional-tests.spec.ts
npx playwright test e2e/nexgen-verification.spec.ts
npx playwright test e2e/security-tests.spec.ts

# All E2E
npx playwright test

# Simulations
node scripts/simulate-org.cjs
node scripts/simulate-7days.cjs
```

---

*Last updated: 2026-03-28*
